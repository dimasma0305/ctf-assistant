import { describe, expect, test } from 'bun:test';
import { createChatGPTLoginPortal } from './chatgptLoginPortal';

describe('temporary ChatGPT login portal', () => {
    test('requires the fragment capability, a same-origin session, and the original loopback state; rejects replay', async () => {
        let finished = 0;
        const origin = 'https://app.assistant.1pc.tf', path = '/hackerika-connect';
        const state = 'expected-state', callback = 'http://127.0.0.1:1455/auth/callback';
        const portal = createChatGPTLoginPortal({ origin, secret: 'private-bootstrap', callbackUri: callback, auth: {
            async begin(uri) { expect(uri).toBe(callback); return { url: 'https://auth.openai.com/api/accounts/authorize?state=expected-state', attempt: { state, nonce: 'nonce', verifier: 'verifier', redirectUri: callback, hostId: 'host', expiresAt: Date.now() + 600_000 } }; },
            async finish(_attempt, url) { expect(url.origin + url.pathname).toBe(callback); expect(url.searchParams.get('code')).toBe('test-code'); finished++; },
        } });
        const request = (suffix: string, body?: unknown, cookie = '', requestOrigin = origin) => new Request(origin + path + suffix, { method: body === undefined ? 'GET' : 'POST', headers: { host: new URL(origin).host, origin: requestOrigin, cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        expect((await portal.fetch(request('/authorize'))).status).toBe(403);
        expect((await portal.fetch(request('/session', { secret: 'private-bootstrap' }, '', 'https://evil.example'))).status).toBe(403);
        expect((await portal.fetch(request('/session', { secret: 'wrong' }))).status).toBe(403);
        const grant = await portal.fetch(request('/session', { secret: 'private-bootstrap' }));
        expect(grant.status).toBe(200);
        expect(grant.headers.get('set-cookie')).toContain('Secure; HttpOnly; SameSite=Strict');
        const cookie = grant.headers.get('set-cookie')!.split(';')[0];
        expect((await portal.fetch(request('/session', { secret: 'private-bootstrap' }))).status).toBe(403);
        const start = await portal.fetch(request('/authorize', undefined, cookie));
        expect(start.status).toBe(302); expect(start.headers.get('location')).toStartWith('https://auth.openai.com/');
        expect((await portal.fetch(request('/complete', { callback: 'https://evil.example/auth/callback?state=expected-state&code=test-code' }, cookie))).status).toBe(400);
        expect((await portal.fetch(request('/complete', { callback: callback + '?state=wrong&code=test-code' }, cookie))).status).toBe(400);
        expect((await portal.fetch(request('/complete', { callback: callback + '?state=expected-state&code=test-code' }, cookie, 'https://evil.example'))).status).toBe(403);
        expect(finished).toBe(0);
        const body = { callback: callback + '?state=expected-state&code=test-code' };
        expect((await portal.fetch(request('/complete', body, cookie))).status).toBe(200);
        expect((await portal.fetch(request('/complete', body, cookie))).status).toBe(409);
        expect(finished).toBe(1);
    });
    test('expires and does not render the bootstrap secret or OAuth URL in public HTML', async () => {
        let clock = 0;
        const portal = createChatGPTLoginPortal({ origin: 'https://app.assistant.1pc.tf', secret: 'never-public', callbackUri: 'http://127.0.0.1:1455/auth/callback', now: () => clock, auth: {} as any });
        const req = () => new Request('https://app.assistant.1pc.tf/hackerika-connect', { headers: { host: 'app.assistant.1pc.tf' } });
        const page = await portal.fetch(req());
        expect(page.status).toBe(200); expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
        const html = await page.text(); expect(html).not.toContain('never-public'); expect(html).not.toContain('https://auth.openai.com/api/accounts/authorize');
        clock = 30 * 60_000 + 1; expect((await portal.fetch(req())).status).toBe(410);
    });
});
