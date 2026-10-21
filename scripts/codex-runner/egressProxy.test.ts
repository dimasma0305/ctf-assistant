import { expect, test } from 'bun:test';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { networkInterfaces } from 'node:os';
import { isLocalNetworkTarget, startEgressProxy } from './egressProxy';

test('host-connected Docker subnet is not treated as public egress', () => {
  const bridge = Object.entries(networkInterfaces()).find(([name, entries]) =>
    name.startsWith('docker') && entries?.some(entry => entry.family === 'IPv4'));
  if (!bridge) return;
  const address = bridge[1]!.find(entry => entry.family === 'IPv4')!.address;
  expect(isLocalNetworkTarget(address)).toBe(true);
  const parts = address.split('.').map(Number);
  parts[3] = parts[3] === 1 ? 2 : 1;
  expect(isLocalNetworkTarget(parts.join('.'))).toBe(true);
});

test('per-job SOCKS proxy rejects loopback targets while completing the protocol', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hackerika-egress-test-'));
  const path = join(directory, 'egress.sock');
  const proxy = await startEgressProxy(path, new AbortController().signal);
  const client = net.connect(path);
  const read = () => new Promise<Buffer>((resolve, reject) => {
    client.once('data', resolve); client.once('error', reject);
  });
  try {
    client.write(Buffer.from([5, 1, 0]));
    expect(await read()).toEqual(Buffer.from([5, 0]));
    client.write(Buffer.from([5, 1, 0, 1, 127, 0, 0, 1, 0, 80]));
    expect((await read())[1]).toBe(2);
  } finally {
    client.destroy(); proxy.close(); await rm(directory, { recursive: true, force: true });
  }
});
