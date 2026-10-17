import { readFileSync } from 'node:fs';
import { ChatGPTAuth } from '../src/Services/AI/chatgptAuth';
import { createChatGPTLoginPortal } from '../src/Services/AI/chatgptLoginPortal';

const origin = process.env.CHATGPT_PORTAL_ORIGIN!;
const secret = readFileSync(process.env.CHATGPT_PORTAL_SECRET_FILE!, 'utf8').trim();
if (!origin || secret.length < 40) throw Error('Private portal configuration required');
const auth = new ChatGPTAuth();
let connected = false;
const portal = createChatGPTLoginPortal({ origin, secret, auth,
    callbackUri: 'http://127.0.0.1:1455/auth/callback',
    onConnected() { connected = true; console.log('CHATGPT_LOGIN_STORED'); setTimeout(() => process.exit(0), 180_000); },
});
// The required loopback listener exists before any authorization URL is created.
Bun.serve({ hostname: '127.0.0.1', port: 1455, fetch: portal.callback, maxRequestBodySize: 16384 });
Bun.serve({ hostname: '0.0.0.0', port: 3001, fetch: portal.fetch, maxRequestBodySize: 16384,
    error() { return new Response('Login portal request failed.', { status: 500 }); } });
console.log('CHATGPT_LOGIN_PORTAL_READY');
setTimeout(() => { console.log(connected ? 'CHATGPT_LOGIN_PORTAL_CLOSED' : 'CHATGPT_LOGIN_PORTAL_EXPIRED'); process.exit(0); }, 30 * 60_000);
