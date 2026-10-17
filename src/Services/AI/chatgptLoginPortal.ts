import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { ChatGPTAuth } from './chatgptAuth';

const equal = (a: string, b: string) => {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
};
const base = '/hackerika-connect';

/** Short-lived operator portal: manually delivers the original loopback callback.
 * The fragment capability never travels in request URLs or proxy access logs.
 * No password, ChatGPT cookie, code, or OAuth token is logged by this handler.
 */
export function createChatGPTLoginPortal(options: {
    origin: string;
    secret: string;
    auth: Pick<ChatGPTAuth, 'begin' | 'finish'>;
    callbackUri: string;
    onConnected?: () => void;
    now?: () => number;
}) {
    const origin = new URL(options.origin).origin;
    if (new URL(origin).protocol !== 'https:') throw Error('HTTPS portal origin required');
    const callback = new URL(options.callbackUri);
    if (callback.protocol !== 'http:' || callback.hostname !== '127.0.0.1' || callback.pathname !== '/auth/callback' || callback.search || callback.hash) throw Error('Loopback callback required');
    const now = options.now || Date.now;
    const expires = now() + 30 * 60_000;
    const cookie = randomBytes(32).toString('base64url');
    let claimed = false, connected = false, busy = false;
    let attempt: Awaited<ReturnType<ChatGPTAuth['begin']>> | undefined;
    const authorized = (req: Request) => req.headers.get('cookie')?.split(';').some(v => equal(v.trim(), `__Secure-hkr_login=${cookie}`)) === true;
    const response = (body: string, status = 200, extra: Record<string, string> = {}) => new Response(body, { status, headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', ...extra,
    } });
    async function complete(url: URL) {
        if (!attempt || url.origin + url.pathname !== options.callbackUri || url.hash || url.username || url.password
            || !equal(url.searchParams.get('state') || '', attempt.attempt.state)) return response('Alamat hasil login tidak cocok dengan sesi ini.', 400);
        if (connected || busy) return response('Sesi sudah diproses.', 409);
        busy = true;
        try {
            await options.auth.finish(attempt.attempt, url);
            connected = true;
            options.onConnected?.();
            return response('Login berhasil disimpan. Kamu boleh menutup halaman ini. Aktivasi model akan diverifikasi oleh operator.');
        } catch { return response('Login belum berhasil. Mulai login lagi dari halaman ini.', 400); }
        finally { busy = false; }
    }
    return {
        async callback(req: Request): Promise<Response> {
            if (req.method !== 'GET') return response('Method not allowed', 405);
            return complete(new URL(req.url));
        },
        async fetch(req: Request): Promise<Response> {
            const url = new URL(req.url);
            if (req.headers.get('host') !== new URL(origin).host) return response('Forbidden', 403);
            if (now() > expires) return response('Halaman login sudah kedaluwarsa.', 410);
            if (req.method === 'POST' && (req.headers.get('origin') !== origin || req.headers.get('content-type')?.split(';')[0] !== 'application/json')) return response('Forbidden', 403);
            if (req.method === 'GET' && (url.pathname === base || url.pathname === base + '/')) {
                const nonce = randomBytes(18).toString('base64url');
                return response(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hubungkan Hackerika</title>
<style>body{font:17px system-ui;max-width:650px;margin:50px auto;padding:20px;background:#111827;color:#f3f4f6}button,a{font:inherit}a{color:#93c5fd}button{padding:10px 18px;cursor:pointer}textarea{display:block;width:95%;min-height:100px;margin:14px 0}p{line-height:1.6}[hidden]{display:none}</style>
<main><h1>Hubungkan Hackerika</h1><p id="status" role="status">Memeriksa sesi…</p><section id="flow" hidden>
<p>Login dan izinkan pemakaian paket ChatGPT-mu pada halaman resmi OpenAI. Pemakaian Hackerika mengikuti kuota dan batas yang kamu izinkan.</p>
<p><a href="${base}/authorize" target="_blank" rel="noopener noreferrer">Continue with ChatGPT ↗</a></p>
<p>Setelah selesai, tab OpenAI kembali ke alamat <code>127.0.0.1</code> yang mungkin gagal dibuka. Salin seluruh alamat di address bar tab itu, lalu tempel di bawah.</p>
<form id="complete"><label for="callback">Alamat hasil redirect login</label><textarea id="callback" required autocomplete="off" spellcheck="false" placeholder="http://127.0.0.1:1455/auth/callback?…"></textarea><button type="submit">Selesaikan login</button></form>
<p>Jangan tempel password atau token. Alamat hasil login cukup dikirim melalui formulir ini.</p></section></main>
<script nonce="${nonce}">const b='${base}',s=document.querySelector('#status'),f=document.querySelector('#flow');const key=location.hash.slice(1);history.replaceState(null,'',b);
async function post(path,data){return fetch(b+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),credentials:'same-origin'});}
(async()=>{try{if(key){const r=await post('/session',{secret:key});if(!r.ok)throw Error(await r.text());}const r=await fetch(b+'/status',{credentials:'same-origin'});if(!r.ok)throw Error('Buka tautan login pribadi yang diberikan operator.');s.textContent=await r.text();f.hidden=false;}catch(e){s.textContent=e.message;}})();
document.querySelector('#complete').addEventListener('submit',async e=>{e.preventDefault();const el=document.querySelector('#callback'),button=e.target.querySelector('button');button.disabled=true;try{const r=await post('/complete',{callback:el.value.trim()});el.value='';s.textContent=await r.text();if(r.ok)f.hidden=true;}catch{s.textContent='Koneksi gagal. Coba kembali.';}finally{button.disabled=false;}});</script></html>`, 200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
                });
            }
            if (req.method === 'POST' && url.pathname === base + '/session') {
                let data: any; try { const text = await req.text(); if (text.length > 8192) return response('Too large', 413); data = JSON.parse(text); } catch { return response('Invalid request', 400); }
                if (claimed || !equal(typeof data.secret === 'string' ? data.secret : '', options.secret)) return response('Tautan tidak valid atau sudah digunakan.', 403);
                claimed = true;
                return response('Sesi siap.', 200, { 'Set-Cookie': `__Secure-hkr_login=${cookie}; Path=${base}; Max-Age=1800; Secure; HttpOnly; SameSite=Strict` });
            }
            if (!authorized(req)) return response('Forbidden', 403);
            if (req.method === 'GET' && url.pathname === base + '/status') return response(connected ? 'Login sudah tersimpan.' : 'Sesi siap. Lanjutkan login di OpenAI.');
            if (req.method === 'GET' && url.pathname === base + '/authorize') {
                if (connected || busy) return response('Sesi sudah diproses.', 409);
                if (!attempt || attempt.attempt.expiresAt <= now()) attempt = await options.auth.begin(options.callbackUri);
                return response('', 302, { Location: attempt.url });
            }
            if (req.method === 'POST' && url.pathname === base + '/complete') {
                try {
                    const text = await req.text(); if (text.length > 8192) return response('Too large', 413);
                    const data = JSON.parse(text); if (typeof data.callback !== 'string') return response('Alamat redirect diperlukan.', 400);
                    return complete(new URL(data.callback));
                } catch { return response('Alamat redirect tidak valid.', 400); }
            }
            return response('Not found', 404);
        },
    };
}
