import { chmod, rm } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import net, { type Socket } from 'node:net';
import { networkInterfaces } from 'node:os';
import { isPrivateIp } from '../../src/utils/urlGuard';

function inIpv4Cidr(address: string, cidr: string): boolean {
  const [network, bitsText] = cidr.split('/');
  const bits = Number(bitsText);
  if (isIP(address) !== 4 || isIP(network) !== 4 || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const number = (ip: string) => ip.split('.').reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (number(address) & mask) === (number(network) & mask);
}

/** Docker networks can use globally allocated-looking ranges on this host. */
export function isLocalNetworkTarget(address: string): boolean {
  if (isPrivateIp(address)) return true;
  return Object.values(networkInterfaces()).flatMap(entries => entries || []).some(entry =>
    entry.address === address || (entry.family === 'IPv4' && !!entry.cidr && inIpv4Cidr(address, entry.cidr)));
}

/** Per-job SOCKS5 egress for ordinary curl/git HTTPS commands. The worker
 * still has no Docker network: every TCP dial is DNS-pinned and checked here. */
export async function startEgressProxy(path: string, signal: AbortSignal) {
  const server = net.createServer();
  const sockets = new Set<Socket>();
  let connections = 0;
  let transferred = 0;
  const maxConnections = 64;
  const maxBytes = 256 * 1024 * 1024;
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.setTimeout(45_000, () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
  };
  const deny = (client: Socket, code = 2) => {
    if (!client.destroyed) client.end(Buffer.from([5, code, 0, 1, 0, 0, 0, 0, 0, 0]));
  };
  server.on('connection', client => {
    if (++connections > maxConnections || signal.aborted) { client.destroy(); return; }
    track(client);
    let stage = 0;
    let buffer = Buffer.alloc(0);
    const handle = async (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 8192) { client.destroy(); return; }
      if (stage === 0) {
        if (buffer.length < 2) return;
        const length = 2 + buffer[1];
        if (buffer.length < length) return;
        if (buffer[0] !== 5 || !buffer.subarray(2, length).includes(0)) { client.end(Buffer.from([5, 255])); return; }
        buffer = buffer.subarray(length);
        stage = 1;
        client.write(Buffer.from([5, 0]));
      }
      if (stage !== 1 || buffer.length < 4) return;
      const type = buffer[3];
      const addressBytes = type === 1 ? 4 : type === 4 ? 16 : type === 3 && buffer.length >= 5 ? buffer[4] : -1;
      const start = type === 3 ? 5 : 4;
      const length = start + addressBytes + 2;
      if (addressBytes < 1) { deny(client, 8); return; }
      if (buffer.length < length) return;
      if (buffer[0] !== 5 || buffer[1] !== 1 || buffer[2] !== 0) { deny(client, 7); return; }
      const host = type === 1 ? Array.from(buffer.subarray(start, start + 4)).join('.')
        : type === 4 ? [...Array(8)].map((_, i) => buffer.readUInt16BE(start + i * 2).toString(16)).join(':')
        : buffer.subarray(start, start + addressBytes).toString('utf8');
      const port = buffer.readUInt16BE(start + addressBytes);
      const pending = buffer.subarray(length);
      buffer = Buffer.alloc(0);
      stage = 2;
      if (!port || !host || host.length > 253 || /[^a-zA-Z0-9.:-]/.test(host)) { deny(client); return; }
      let ip = host;
      try {
        if (!isIP(host)) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const addresses = await Promise.race([
            lookup(host, { all: true, verbatim: true }),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('dns_timeout')), 5000); }),
          ]).finally(() => clearTimeout(timer));
          if (!addresses.length || addresses.some(item => isLocalNetworkTarget(item.address))) { deny(client); return; }
          ip = addresses[0].address;
        } else if (isLocalNetworkTarget(host)) { deny(client); return; }
      } catch { deny(client); return; }
      if (signal.aborted || client.destroyed) return;
      const upstream = net.connect({ host: ip, port, family: isIP(ip) });
      track(upstream);
      upstream.setTimeout(10_000, () => upstream.destroy());
      upstream.once('error', () => deny(client, 5));
      upstream.once('connect', () => {
        upstream.setTimeout(45_000, () => upstream.destroy());
        client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
        client.off('data', onData);
        if (pending.length) upstream.write(pending);
        for (const socket of [client, upstream]) socket.on('data', data => {
          transferred += data.length;
          if (transferred > maxBytes) { client.destroy(); upstream.destroy(); }
        });
        client.pipe(upstream); upstream.pipe(client);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('close', () => upstream.destroy());
        upstream.on('close', () => client.destroy());
      });
    };
    const onData = (chunk: Buffer) => { void handle(chunk).catch(() => client.destroy()); };
    client.on('data', onData);
    client.on('error', () => client.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => { server.off('error', reject); resolve(); });
  });
  await chmod(path, 0o666);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    for (const socket of sockets) socket.destroy();
    server.close();
    void rm(path, { force: true });
  };
  signal.addEventListener('abort', close, { once: true });
  return { close: () => { signal.removeEventListener('abort', close); close(); } };
}
