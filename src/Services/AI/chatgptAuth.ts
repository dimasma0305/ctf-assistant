import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, chmod, unlink, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createLocalJWKSet, jwtVerify } from 'jose';

export const CHATGPT_ISSUER = 'https://auth.openai.com';
export const CHATGPT_RESOURCE = 'https://api.openai.com/v1';
export const CHATGPT_SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const defaultChatGPTFile = () => resolve(process.env.CHATGPT_AUTH_FILE || join(homedir(), '.config/hackerika/chatgpt/credentials.json'));
export class ChatGPTError extends Error {
    constructor(public code: string, public status?: number) { super(`ChatGPT: ${code}`); this.name = 'ChatGPTError'; }
}
export interface ChatGPTCredentials {
    issuer: string; subject: string; email?: string; client_id: string; ext_agent_host_id: string;
    access_token: string; refresh_token: string; id_token: string; token_type: 'Bearer';
    scopes: string[]; expires_at: number; saved_at: string;
}
export interface SignInAttempt { state: string; nonce: string; verifier: string; redirectUri: string; hostId: string; clientId?: string; subject?: string; expiresAt: number; }
type Fetcher = typeof globalThis.fetch;
const refreshes = new Map<string, Promise<ChatGPTCredentials>>();
const opaque = () => randomBytes(32).toString('base64url');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function writePrivateJson(filename: string, value: unknown): Promise<void> {
    await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
    // A trusted host controller may refresh a session also mounted into the
    // unprivileged bot. Atomic replacement must preserve that file's owner.
    const previous = await lstat(filename).catch((error: any) => {
        if (error?.code !== 'ENOENT') throw error;
        return null;
    });
    if (previous && (!previous.isFile() || previous.isSymbolicLink())) throw new ChatGPTError('unsafe_credential_file');
    const temporary = `${filename}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
        if (previous && process.getuid?.() === 0) await handle.chown(previous.uid, previous.gid);
        await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync();
    }
    finally { await handle.close(); }
    try { await rename(temporary, filename); await chmod(filename, 0o600); }
    finally { await unlink(temporary).catch(() => {}); }
}

async function privateJson(filename: string): Promise<any> {
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024 || (process.platform !== 'win32' && (stat.mode & 0o077))) throw new ChatGPTError('unsafe_credential_file');
    return JSON.parse(await readFile(filename, 'utf8'));
}

export class ChatGPTAuth {
    readonly file: string;
    // Benchmarks freeze conversation dates. OAuth expiry must use real elapsed
    // wall time, independently of that synthetic Discord chronology.
    constructor(file = defaultChatGPTFile(), private fetcher: Fetcher = globalThis.fetch,
        private now = () => Math.floor(performance.timeOrigin + performance.now())) { this.file = resolve(file); }

    async hostId(): Promise<string> {
        const filename = join(dirname(this.file), 'host.json');
        try {
            const value = await privateJson(filename);
            if (typeof value.id !== 'string' || !/^urn:uuid:[\da-f-]{36}$/i.test(value.id)) throw new ChatGPTError('invalid_host_id');
            return value.id;
        } catch (error: any) {
            if (error?.code !== 'ENOENT') throw error;
            await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
            const id = `urn:uuid:${randomUUID()}`;
            try { const handle = await open(filename, 'wx', 0o600); try { await handle.writeFile(JSON.stringify({ id })); } finally { await handle.close(); } return id; }
            catch (error: any) { if (error?.code === 'EEXIST') return this.hostId(); throw error; }
        }
    }

    async read(): Promise<ChatGPTCredentials> {
        let value: any;
        try { value = await privateJson(this.file); }
        catch (error: any) { if (error?.code === 'ENOENT') throw new ChatGPTError('sign_in_required', 401); throw error instanceof ChatGPTError ? error : new ChatGPTError('invalid_credentials'); }
        if (value.issuer !== CHATGPT_ISSUER || !value.subject || !/^oaiapp_[\w-]+$/.test(value.client_id || '')
            || ![value.access_token, value.refresh_token, value.id_token].every(v => typeof v === 'string' && v.length > 0)
            || value.token_type !== 'Bearer' || !Array.isArray(value.scopes) || !value.scopes.includes('chatgpt.tokens.use.direct')
            || !Number.isFinite(value.expires_at)) throw new ChatGPTError('invalid_credentials');
        return value;
    }

    private async json(url: string, init: RequestInit = {}): Promise<any> {
        let response: Response;
        try { response = await this.fetcher(url, { ...init, redirect: 'error', signal: init.signal || AbortSignal.timeout(20_000) }); }
        catch { throw new ChatGPTError('authentication_network_error'); }
        const text = await response.text();
        if (text.length > 256 * 1024) throw new ChatGPTError('authentication_response_too_large');
        let data: any; try { data = JSON.parse(text); } catch { throw new ChatGPTError('invalid_authentication_response', response.status); }
        if (!response.ok) throw new ChatGPTError(typeof data.error === 'string' && /^[\w-]{1,80}$/.test(data.error) ? data.error : 'authentication_failed', response.status);
        return data;
    }

    private async identity(idToken: string, clientId: string, nonce?: string) {
        const keys = await this.json(`${CHATGPT_ISSUER}/.well-known/jwks.json`);
        try {
            const { payload } = await jwtVerify(idToken, createLocalJWKSet(keys), { issuer: CHATGPT_ISSUER, audience: clientId, algorithms: ['RS256', 'ES256'], currentDate: new Date(this.now()), requiredClaims: ['sub', 'exp', 'iat'] });
            if (typeof payload.sub !== 'string' || !payload.sub || nonce && (typeof payload.nonce !== 'string' || !same(payload.nonce, nonce))
                || payload.azp && payload.azp !== clientId || Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) throw Error('identity_mismatch');
            return { issuer: CHATGPT_ISSUER, subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined };
        } catch { throw new ChatGPTError('invalid_id_token', 401); }
    }

    async begin(redirectUri: string, newAccount = false): Promise<{ attempt: SignInAttempt; url: string }> {
        const redirect = new URL(redirectUri);
        if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || redirect.pathname !== '/auth/callback' || redirect.search || redirect.hash || redirect.username || redirect.password) throw new ChatGPTError('invalid_loopback_callback');
        const hostId = await this.hostId();
        let saved: Partial<ChatGPTCredentials> | undefined;
        if (!newAccount) try { saved = await this.read(); } catch (error: any) {
            if (error?.code !== 'sign_in_required') throw error;
            try { saved = await privateJson(`${this.file}.registration.json`); } catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
        }
        const attempt: SignInAttempt = { state: opaque(), nonce: opaque(), verifier: opaque(), hostId, redirectUri, clientId: saved?.client_id, subject: saved?.subject, expiresAt: this.now() + 10 * 60_000 };
        const parameters: Record<string, string> = { client_id: saved?.client_id || 'dynamic_agent_client', ext_agent_host_id: hostId,
            response_type: 'code', redirect_uri: redirectUri, scope: CHATGPT_SCOPE, resource: CHATGPT_RESOURCE,
            state: attempt.state, nonce: attempt.nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url') };
        if (!saved) parameters.agent_name_hint = 'Hackerika';
        if (saved?.id_token) parameters.id_token_hint = saved.id_token;
        return { attempt, url: `${CHATGPT_ISSUER}/api/accounts/authorize?${new URLSearchParams(parameters)}` };
    }

    async finish(attempt: SignInAttempt, callback: URL): Promise<void> {
        if (this.now() > attempt.expiresAt || !same(callback.searchParams.get('state') || '', attempt.state)) throw new ChatGPTError('invalid_oauth_state', 400);
        if (callback.origin + callback.pathname !== attempt.redirectUri) throw new ChatGPTError('invalid_loopback_callback');
        if (callback.searchParams.has('error')) throw new ChatGPTError('authorization_declined', 403);
        const supplied = callback.searchParams.get('client_id');
        if (attempt.clientId && supplied && supplied !== attempt.clientId) throw new ChatGPTError('client_id_mismatch', 400);
        const clientId = attempt.clientId || supplied;
        const code = callback.searchParams.get('code');
        if (!clientId || !/^oaiapp_[\w-]+$/.test(clientId) || !code) throw new ChatGPTError('registration_incomplete');
        // A callback is single-use, including after a failed exchange.
        attempt.expiresAt = 0;
        const tokens = await this.json(`${CHATGPT_ISSUER}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirectUri, resource: CHATGPT_RESOURCE }) });
        const identity = await this.identity(tokens.id_token, clientId, attempt.nonce);
        if (attempt.subject && identity.subject !== attempt.subject) throw new ChatGPTError('account_mismatch');
        await writePrivateJson(`${this.file}.registration.json`, { ...identity, client_id: clientId });
        await writePrivateJson(this.file, this.record(tokens, { ...identity, client_id: clientId, ext_agent_host_id: attempt.hostId }));
    }

    private record(tokens: any, previous: Partial<ChatGPTCredentials>): ChatGPTCredentials {
        const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : previous.scopes;
        if (!scopes?.includes('chatgpt.tokens.use.direct')) throw new ChatGPTError('plan_permission_required', 403);
        if (tokens.token_type?.toLowerCase() !== 'bearer' || typeof tokens.access_token !== 'string' || !tokens.access_token || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token
            || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new ChatGPTError('invalid_token_response');
        return { ...previous, access_token: tokens.access_token, refresh_token: tokens.refresh_token, id_token: tokens.id_token || previous.id_token,
            token_type: 'Bearer', scopes, expires_at: this.now() + tokens.expires_in * 1000, saved_at: new Date(this.now()).toISOString() } as ChatGPTCredentials;
    }

    async credentials(signal?: AbortSignal): Promise<ChatGPTCredentials> {
        const current = await this.read();
        if (current.expires_at > this.now() + 60_000) return current;
        const running = refreshes.get(this.file); if (running) return running;
        const pending = this.refresh(signal).finally(() => refreshes.delete(this.file));
        refreshes.set(this.file, pending); return pending;
    }

    private async refresh(signal?: AbortSignal): Promise<ChatGPTCredentials> {
        const lock = `${this.file}.lock`;
        const deadline = this.now() + 30_000;
        let handle;
        while (!handle) {
            signal?.throwIfAborted();
            try { handle = await open(lock, 'wx', 0o600); }
            catch (error: any) {
                if (error?.code !== 'EEXIST') throw new ChatGPTError('credential_lock_failed');
                if (this.now() > deadline) throw new ChatGPTError('credential_refresh_busy');
                const stat = await lstat(lock).catch(() => null);
                if (stat && this.now() - stat.mtimeMs > 120_000) await unlink(lock).catch(() => {});
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        try {
            const previous = await this.read();
            if (previous.expires_at > this.now() + 60_000) return previous;
            const tokens = await this.json(`${CHATGPT_ISSUER}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : undefined,
                body: new URLSearchParams({ grant_type: 'refresh_token', client_id: previous.client_id, refresh_token: previous.refresh_token, resource: CHATGPT_RESOURCE }) });
            if (tokens.id_token) { const identity = await this.identity(tokens.id_token, previous.client_id); if (identity.subject !== previous.subject) throw new ChatGPTError('account_mismatch'); }
            const updated = this.record(tokens, { ...previous, ext_agent_host_id: await this.hostId() });
            await writePrivateJson(this.file, updated); return updated;
        } finally { await handle.close(); await unlink(lock).catch(() => {}); }
    }

    async importCredentials(filename: string): Promise<void> {
        const incoming = await new ChatGPTAuth(filename, this.fetcher, this.now).read();
        // ID tokens may have expired during VM transfer; never weaken signature/expiry
        // validation. Refresh the transferred session first if necessary.
        const identity = await this.identity(incoming.id_token, incoming.client_id);
        if (identity.subject !== incoming.subject) throw new ChatGPTError('account_mismatch');
        await writePrivateJson(this.file, { ...incoming, ext_agent_host_id: await this.hostId() });
    }

    async signOut(): Promise<{ revoked: boolean }> {
        const credentials = await this.read(); let revoked = false;
        try {
            const discovery = await this.json(`${CHATGPT_ISSUER}/.well-known/openid-configuration`);
            const url = new URL(discovery.revocation_endpoint);
            if (url.origin !== CHATGPT_ISSUER) throw new ChatGPTError('invalid_revocation_endpoint');
            const response = await this.fetcher(url.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: credentials.refresh_token, token_type_hint: 'refresh_token', client_id: credentials.client_id }) });
            revoked = response.status === 200;
        } catch {}
        await writePrivateJson(`${this.file}.registration.json`, { issuer: credentials.issuer, subject: credentials.subject, email: credentials.email, client_id: credentials.client_id });
        await unlink(this.file);
        return { revoked };
    }
}
