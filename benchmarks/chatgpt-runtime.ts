import { resolve, isAbsolute } from 'node:path';
import { stat } from 'node:fs/promises';

/** Explicit mount for isolated image trials; never bake OAuth sessions into images. */
export async function chatGPTMountArgs(image: string, envFile: string): Promise<string[]> {
    if (!image) return [];
    const environment = await Bun.file(envFile).text();
    if (!/^AI_PROVIDER=chatgpt\s*$/m.test(environment)) return [];
    const index = process.argv.indexOf('--chatgpt-auth-dir');
    if (index < 0 || !process.argv[index + 1]) throw Error('ChatGPT image trials require --chatgpt-auth-dir PRIVATE_DIRECTORY');
    const directory = resolve(process.argv[index + 1]); const info = await stat(directory);
    if (!info.isDirectory() || (info.mode & 0o077) || directory.includes(',')) throw Error('Use an owner-only private credential directory');
    const file = environment.match(/^CHATGPT_AUTH_FILE=(.+)$/m)?.[1]?.trim();
    if (!file || !isAbsolute(file) || !file.endsWith('/credentials.json') || file.includes(',')) throw Error('Set an absolute CHATGPT_AUTH_FILE ending in /credentials.json');
    // Host env files may point under /root, which the unprivileged image user
    // cannot traverse even when the credential file itself is readable.
    const mount = '/run/hackerika-chatgpt';
    return ['--mount', `type=bind,src=${directory},dst=${mount}`, '--env', `CHATGPT_AUTH_FILE=${mount}/credentials.json`];
}
