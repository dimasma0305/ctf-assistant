#!/usr/bin/env bun
/**
 * Deploy the Hackerika search-proxy Worker to Cloudflare.
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN   — API token with Workers Scripts:Edit + Account Settings:Read
 *   CLOUDFLARE_ACCOUNT_ID  — 24-hex account ID
 *   WORKER_SHARED_SECRET   — secret string the bot will send as X-Hackerika-Token (any random ~32-char string)
 *
 * Optional:
 *   WORKER_NAME            — script name (default "hackerika-search")
 *
 * Re-runnable: uploads/updates the script, syncs the secret binding, ensures
 * workers.dev subdomain routing is enabled. Idempotent.
 */

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.cloudflare.com/client/v4';

function need(name: string): string {
    const v = process.env[name];
    if (!v) {
        console.error(`❌ Missing required env var: ${name}`);
        process.exit(1);
    }
    return v;
}

const TOKEN = need('CLOUDFLARE_API_TOKEN');
const ACCOUNT_ID = need('CLOUDFLARE_ACCOUNT_ID');
const SHARED_SECRET = need('WORKER_SHARED_SECRET');
const WORKER_NAME = process.env.WORKER_NAME || 'hackerika-search';

const SCRIPT_PATH = path.join(import.meta.dir, 'search.js');

async function api(method: string, urlPath: string, body?: any, contentType = 'application/json'): Promise<any> {
    const url = API + urlPath;
    const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` };
    let payload: any;
    if (body !== undefined) {
        if (body instanceof FormData) {
            payload = body;
        } else if (typeof body === 'string') {
            payload = body;
            headers['Content-Type'] = contentType;
        } else {
            payload = JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
        }
    }
    const r = await fetch(url, { method, headers, body: payload });
    const text = await r.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: r.status, body: parsed };
}

async function step(name: string, fn: () => Promise<void>) {
    process.stdout.write(`→ ${name}... `);
    try {
        await fn();
        console.log('✓');
    } catch (e: any) {
        console.log('✗');
        console.error('  ', e.message || e);
        process.exit(1);
    }
}

async function main() {
    console.log(`Deploying Worker "${WORKER_NAME}" to account ${ACCOUNT_ID.slice(0, 8)}…`);

    // 1. Read script source
    let scriptSource = '';
    await step('reading worker source', async () => {
        scriptSource = fs.readFileSync(SCRIPT_PATH, 'utf8');
        if (scriptSource.length < 100) throw new Error('script unexpectedly tiny');
    });

    // 2. Ensure workers.dev subdomain exists (idempotent). The PUT endpoint
    //    returns 200 whether the name was already claimed by this account
    //    or newly claimed now.
    let subdomain = '';
    await step('checking workers.dev subdomain', async () => {
        const r = await api('GET', `/accounts/${ACCOUNT_ID}/workers/subdomain`);
        if (r.status === 200 && r.body?.success && r.body?.result?.subdomain) {
            subdomain = r.body.result.subdomain;
        } else if (r.status === 404 || (r.body?.errors || []).some((e: any) => e.code === 10007)) {
            // No subdomain yet — claim one. We use the user's CF account email prefix.
            // (Already provisioned manually for first deploy; this branch is for fresh accounts.)
            throw new Error('No workers.dev subdomain on this account. Visit dash.cloudflare.com once to claim one, then re-run.');
        } else {
            throw new Error('Unexpected subdomain response: ' + JSON.stringify(r.body).slice(0, 200));
        }
    });
    console.log(`  subdomain: ${subdomain}.workers.dev`);

    // 3. Upload the worker script. Modules format requires multipart with a
    //    metadata part declaring main_module + bindings.
    await step(`uploading script (${scriptSource.length} bytes)`, async () => {
        const form = new FormData();
        const metadata = {
            main_module: 'search.js',
            compatibility_date: '2025-01-01',
            bindings: [
                {
                    type: 'secret_text',
                    name: 'SHARED_SECRET',
                    text: SHARED_SECRET,
                },
                // Workers AI binding — gives env.AI.run(...) access to CF's
                // inference endpoint. Used by the /embed route for the
                // BGE-small-en-v1.5 embedding model. Free tier covers ~100k
                // requests/day which is plenty for our message volume.
                {
                    type: 'ai',
                    name: 'AI',
                },
            ],
        };
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append(
            'search.js',
            new Blob([scriptSource], { type: 'application/javascript+module' }),
            'search.js',
        );
        const r = await api('PUT', `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`, form);
        if (r.status !== 200 || !r.body?.success) {
            throw new Error('upload failed: ' + JSON.stringify(r.body).slice(0, 500));
        }
    });

    // 4. Enable per-script workers.dev subdomain routing (so the URL serves).
    await step('enabling workers.dev route', async () => {
        const r = await api(
            'POST',
            `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain`,
            { enabled: true, previews_enabled: false },
        );
        if (r.status !== 200 || !r.body?.success) {
            // 409 "already enabled" is fine; surface other errors.
            const errs = r.body?.errors || [];
            const benign = errs.length && errs.every((e: any) => e.code === 10071 || /enabled/i.test(e.message || ''));
            if (!benign) throw new Error('subdomain route enable failed: ' + JSON.stringify(r.body).slice(0, 400));
        }
    });

    const url = `https://${WORKER_NAME}.${subdomain}.workers.dev`;
    console.log('');
    console.log('✅ Deployed.');
    console.log(`   URL:    ${url}`);
    console.log(`   Health: curl ${url}/`);
    console.log(`   Search: curl -H 'X-Hackerika-Token: $WORKER_SHARED_SECRET' "${url}/search?q=test"`);
    console.log('');
    console.log('Add these to docker-compose env (or .env):');
    console.log(`   CF_WORKER_URL=${url}`);
    console.log(`   CF_WORKER_TOKEN=${SHARED_SECRET}`);
}

main().catch((e) => {
    console.error('fatal:', e);
    process.exit(1);
});
