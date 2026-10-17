import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, readFile, stat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { ChatGPTAuth, CHATGPT_ISSUER, CHATGPT_SCOPE, writePrivateJson } from './chatgptAuth';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const pair = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(pair.publicKey), kid: 'fixture-key', use: 'sig', alg: 'RS256' };
const now = Date.now();
const saved = () => ({ issuer: CHATGPT_ISSUER, subject: 'owner', client_id: 'oaiapp_fixture', ext_agent_host_id: 'urn:uuid:aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    access_token: 'private-access-fixture', refresh_token: 'private-refresh-fixture', id_token: 'private-id-fixture', token_type: 'Bearer',
    scopes: CHATGPT_SCOPE.split(' '), expires_at: now + 3600_000, saved_at: new Date(now).toISOString() });
async function fixture(fetcher?: any) { const dir = await mkdtemp(join(tmpdir(), 'hackerika-auth-')); directories.push(dir); return new ChatGPTAuth(join(dir, 'credentials.json'), fetcher, () => now); }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
async function idToken(nonce: string, options: { audience?: string; subject?: string; issuer?: string; expired?: boolean } = {}) {
    return new SignJWT({ nonce }).setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' }).setIssuer(options.issuer || CHATGPT_ISSUER)
        .setAudience(options.audience || 'oaiapp_fixture').setSubject(options.subject || 'owner')
        .setIssuedAt(Math.floor(now / 1000) - 10).setExpirationTime(Math.floor(now / 1000) + (options.expired ? -1 : 3600)).sign(pair.privateKey);
}

test('OAuth binds registration to state, nonce, PKCE, exact loopback and a persistent host', async () => {
    let tokenBody: URLSearchParams | undefined, identity = '';
    const auth = await fixture(async (url: string, init: any) => {
        if (url.endsWith('/jwks.json')) return json({ keys: [jwk] });
        tokenBody = new URLSearchParams(init.body);
        return json({ access_token: 'access', refresh_token: 'refresh', id_token: identity, token_type: 'Bearer', expires_in: 3600, scope: CHATGPT_SCOPE });
    });
    const { attempt, url } = await auth.begin('http://127.0.0.1:1455/auth/callback');
    const query = new URL(url).searchParams;
    expect(query.get('client_id')).toBe('dynamic_agent_client'); expect(query.get('agent_name_hint')).toBe('Hackerika');
    expect(query.get('code_challenge')).not.toBe(attempt.verifier); expect(query.get('ext_agent_host_id')).toBe(await auth.hostId());
    identity = await idToken(attempt.nonce);
    await auth.finish(attempt, new URL(`http://127.0.0.1:1455/auth/callback?state=${attempt.state}&client_id=oaiapp_fixture&code=one-time-code`));
    expect(tokenBody!.get('client_id')).toBe('oaiapp_fixture'); expect(tokenBody!.get('code_verifier')).toBe(attempt.verifier);
    expect(tokenBody!.get('resource')).toBe('https://api.openai.com/v1'); expect(tokenBody!.has('client_secret')).toBe(false);
    expect((await auth.read()).subject).toBe('owner'); expect((await stat(auth.file)).mode & 0o777).toBe(0o600);
    await expect(auth.finish(attempt, new URL(`http://127.0.0.1:1455/auth/callback?state=${attempt.state}&client_id=oaiapp_fixture&code=one-time-code`))).rejects.toThrow('invalid_oauth_state');
    const returning = new URL((await auth.begin('http://127.0.0.1:1456/auth/callback')).url);
    expect(returning.searchParams.get('client_id')).toBe('oaiapp_fixture'); expect(returning.searchParams.has('agent_name_hint')).toBe(false);
});

test('bad state, changed client ID, denial and non-loopback callbacks make no token request', async () => {
    let calls = 0; const auth = await fixture(async () => { calls++; throw Error('must not fetch'); });
    await writePrivateJson(auth.file, saved());
    await expect(auth.begin('https://example.com/auth/callback')).rejects.toThrow('invalid_loopback_callback');
    await expect(auth.begin('http://localhost:1455/auth/callback')).rejects.toThrow('invalid_loopback_callback');
    const { attempt } = await auth.begin('http://127.0.0.1:1455/auth/callback');
    await expect(auth.finish(attempt, new URL('http://127.0.0.1:1455/auth/callback?state=wrong&code=x'))).rejects.toThrow('invalid_oauth_state');
    await expect(auth.finish(attempt, new URL(`http://127.0.0.1:1455/auth/callback?state=${attempt.state}&client_id=oaiapp_other&code=x`))).rejects.toThrow('client_id_mismatch');
    await expect(auth.finish(attempt, new URL(`http://127.0.0.1:1455/auth/callback?state=${attempt.state}&error=access_denied`))).rejects.toThrow('authorization_declined');
    expect(calls).toBe(0);
});

for (const variant of ['nonce', 'audience', 'issuer', 'expired', 'signature', 'permission'] as const) {
    test(`sign-in rejects invalid ${variant} without replacing an existing account`, async () => {
        let identity = '';
        const auth = await fixture(async (url: string) => url.endsWith('/jwks.json') ? json({ keys: [jwk] }) : json({ access_token: 'new-access', refresh_token: 'new-refresh', id_token: identity, token_type: 'Bearer', expires_in: 3600, scope: variant === 'permission' ? 'openid profile email' : CHATGPT_SCOPE }));
        await writePrivateJson(auth.file, saved()); const before = await readFile(auth.file, 'utf8');
        const { attempt } = await auth.begin('http://127.0.0.1:1455/auth/callback');
        identity = await idToken(variant === 'nonce' ? 'wrong' : attempt.nonce, { audience: variant === 'audience' ? 'oaiapp_other' : undefined, issuer: variant === 'issuer' ? 'https://attacker.invalid' : undefined, expired: variant === 'expired' });
        if (variant === 'signature') identity = identity.slice(0, -12) + 'INVALIDSIGN';
        await expect(auth.finish(attempt, new URL(`http://127.0.0.1:1455/auth/callback?state=${attempt.state}&code=x`))).rejects.toThrow(variant === 'permission' ? 'plan_permission_required' : 'invalid_id_token');
        expect(await readFile(auth.file, 'utf8')).toBe(before);
    });
}

test('parallel refreshes rotate one token set atomically and use the issued client', async () => {
    let calls = 0, body: URLSearchParams | undefined;
    const auth = await fixture(async (_url: string, init: any) => {
        calls++; body = new URLSearchParams(init.body); await new Promise(resolve => setTimeout(resolve, 10));
        return json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 3600 });
    });
    await writePrivateJson(auth.file, { ...saved(), expires_at: now - 1 });
    const results = await Promise.all(Array.from({ length: 8 }, () => auth.credentials()));
    expect(calls).toBe(1); expect(results.every(result => result.access_token === 'rotated-access')).toBe(true);
    expect(body!.get('client_id')).toBe('oaiapp_fixture'); expect(body!.get('refresh_token')).toBe('private-refresh-fixture'); expect(body!.has('scope')).toBe(false);
    expect((await auth.read()).refresh_token).toBe('rotated-refresh');
});

test('refresh failure preserves credentials and never echoes a raw token error', async () => {
    const auth = await fixture(async () => json({ error: 'invalid_grant', error_description: 'private-refresh-fixture' }, 400));
    await writePrivateJson(auth.file, { ...saved(), expires_at: now - 1 }); const before = await readFile(auth.file, 'utf8');
    await expect(auth.credentials()).rejects.toThrow('ChatGPT: invalid_grant');
    expect(await readFile(auth.file, 'utf8')).toBe(before);
});

test('VM import retains the VM host ID and rejects broadly readable credential files', async () => {
    const fetcher = async () => json({ keys: [jwk] }); const source = await fixture(fetcher), destination = await fixture(fetcher);
    await writePrivateJson(source.file, { ...saved(), id_token: await idToken('import-fixture'), ext_agent_host_id: await source.hostId() });
    const vmId = await destination.hostId(); await destination.importCredentials(source.file);
    expect((await destination.read()).ext_agent_host_id).toBe(vmId); expect(vmId).not.toBe(await source.hostId());
    await chmod(source.file, 0o644); await expect(source.read()).rejects.toThrow('unsafe_credential_file');
});

test('sign-out clears secrets and keeps registration even if remote revocation fails', async () => {
    const auth = await fixture(async () => { throw Error('offline'); }); await writePrivateJson(auth.file, saved());
    expect(await auth.signOut()).toEqual({ revoked: false }); await expect(auth.read()).rejects.toThrow('sign_in_required');
    const registration = await readFile(`${auth.file}.registration.json`, 'utf8');
    expect(registration).toContain('oaiapp_fixture'); expect(registration).not.toContain('private-refresh-fixture');
});
