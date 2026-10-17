import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { ChatGPTAuth, ChatGPTError, defaultChatGPTFile, writePrivateJson } from '../src/Services/AI/chatgptAuth';
import { ChatGPTPlanClient } from '../src/Services/AI/chatgptClient';

const args = process.argv.slice(2);
const option = (key: string, fallback = '') => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1] || fallback; };
const command = args[0] || 'login';
const auth = new ChatGPTAuth(option('--auth-file', defaultChatGPTFile()));
const client = new ChatGPTPlanClient(auth);

// Standard credit rates checked on 2026-10-17. This is a conservative preference
// list, not a promise about included plan limits. Unknown models require selection.
const economicalModels = ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra'];
async function selectModel() {
    const models = await client.models();
    const selected = option('--model') || economicalModels.find(slug => models.some(model => model.slug === slug));
    if (!selected || !models.some(model => model.slug === selected)) throw new ChatGPTError('economical_model_not_available_select_from_catalog');
    await writePrivateJson(join(dirname(auth.file), 'selection.json'), { model: selected, reasoningEffort: 'low', selectedAt: new Date().toISOString(), policy: 'Lowest known Standard-credit model available in the account catalog; actual access still requires completed inference.' });
    console.log(`Model hemat yang tersedia: ${selected}`);
    return selected;
}

async function login(): Promise<void> {
    let attempt: Awaited<ReturnType<ChatGPTAuth['begin']>>;
    let origin = '', busy = false;
    let succeed!: () => void, fail!: (error: unknown) => void;
    const completed = new Promise<void>((resolve, reject) => { succeed = resolve; fail = reject; });
    const server = createServer(async (req, res) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'");
        if (req.headers.host !== new URL(origin).host || req.method !== 'GET') { res.writeHead(403); res.end('Forbidden'); return; }
        const url = new URL(req.url || '/', origin);
        if (url.pathname === '/continue') { res.writeHead(302, { Location: attempt.url }); res.end(); return; }
        if (url.pathname === '/') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end('<!doctype html><html lang="id"><meta charset="utf-8"><title>Hackerika</title><main><h1>Hubungkan Hackerika</h1><p>Gunakan paket ChatGPT milikmu untuk proses AI Hackerika. Pemakaian mengikuti kuota dan batas aplikasi yang kamu izinkan.</p><p><a href="/continue">Continue with ChatGPT</a></p><p>Kredensial disimpan di komputer ini. Aplikasi tidak memperoleh riwayat percakapan ChatGPT-mu.</p></main></html>'); return;
        }
        if (url.pathname !== '/auth/callback') { res.writeHead(404); res.end('Not found'); return; }
        if (url.searchParams.get('state') !== attempt.attempt.state) { res.writeHead(400); res.end('Invalid sign-in state. Return to the original login tab.'); return; }
        if (busy) { res.writeHead(409); res.end('Sign-in already in progress.'); return; }
        busy = true;
        try {
            await auth.finish(attempt.attempt, url);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('Hackerika sudah terhubung. Kamu boleh menutup tab ini.'); succeed();
        } catch (error) { res.writeHead(400); res.end('Sign-in could not be completed. Check the local terminal.'); fail(error); }
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(Number(option('--port', '0')), '127.0.0.1', resolve); });
    const address = server.address(); if (!address || typeof address === 'string') throw new ChatGPTError('callback_listener_failed');
    origin = `http://127.0.0.1:${address.port}`;
    try {
        attempt = await auth.begin(`${origin}/auth/callback`, args.includes('--new-account'));
        // Print only a loopback URL. A returning OAuth URL can contain an ID-token hint.
        console.log(`Buka di browser komputer ini: ${origin}/`);
        if (!args.includes('--no-browser')) {
            const executable = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
            const browserArgs = process.platform === 'win32' ? ['/c', 'start', '', `${origin}/`] : [`${origin}/`];
            const browser = spawn(executable, browserArgs, { detached: true, stdio: 'ignore' }); browser.on('error', () => {}); browser.unref();
        }
        const timer = setTimeout(() => fail(new ChatGPTError('login_expired')), 10 * 60_000);
        try { await completed; } finally { clearTimeout(timer); }
        console.log(`Koneksi tersimpan: ${auth.file}`);
        await selectModel();
        console.log('Untuk server: pindahkan file kredensial ini lewat SSH, lalu jalankan import. Jangan kirim isinya ke Discord atau chat.');
    } finally { server.close(); server.closeAllConnections(); }
}

try {
    if (command === 'login') await login();
    else if (command === 'status') { const saved = await auth.read(); console.log(JSON.stringify({ connected: true, planPermission: saved.scopes.includes('chatgpt.tokens.use.direct'), expiresAt: new Date(saved.expires_at).toISOString() })); }
    else if (command === 'models') console.log(JSON.stringify(await client.models(), null, 2));
    else if (command === 'import') { if (!args[1] || args[1].startsWith('--')) throw new ChatGPTError('supply_private_credential_file'); await auth.importCredentials(args[1]); console.log('Kredensial diimpor; host ID server dipertahankan.'); await selectModel(); }
    else if (command === 'check') {
        const model = await selectModel();
        const response = await client.chat.completions.create({ model, messages: [{ role: 'user', content: 'Reply with exactly OK.' }] }, { timeout: 30_000 });
        if (response.choices[0]?.message?.content?.trim() !== 'OK') throw new ChatGPTError('inference_preflight_failed');
        console.log('CHATGPT_PLAN_INFERENCE_OK');
    } else if (command === 'logout') { const result = await auth.signOut(); console.log(result.revoked ? 'Signed out; renewable session revoked.' : 'Signed out locally; remote revocation was not confirmed. Disconnect Hackerika in ChatGPT Settings.'); }
    else throw new ChatGPTError('use_login_status_models_import_check_or_logout');
} catch (error: any) {
    console.error(error instanceof ChatGPTError ? error.message : 'ChatGPT setup failed. No credentials were printed.');
    process.exitCode = 1;
}
