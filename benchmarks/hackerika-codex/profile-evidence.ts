/** The worker may read GitHub with curl as well as the source gateway. Count
 * only body-backed reads of this fixture's public GitHub records, never a URL
 * mentioned in prose, a search snippet, or curl's exit status by itself. */
export function githubReadFromReceipt(command: string, exitCode: number, output: string): string | undefined {
  if (exitCode !== 0 || !/\bcurl\s/.test(command)) return;
  const urls = command.match(/https:\/\/(?:raw\.githubusercontent\.com|api\.github\.com)\/[^\s'"\\]+/g) || [];
  if (urls.length !== 1 || /\b(?:echo|printf)\b/.test(command)) return;
  const url = new URL(urls[0]), body = output.trim();
  if (url.hostname === 'raw.githubusercontent.com' && /\.md$/i.test(url.pathname)
    && body.length >= 200 && /^#\s+\S/.test(body) && !/\b404:\s*Not Found\b/.test(body)) return url.href;
  if (url.hostname !== 'api.github.com') return;
  try {
    const data = JSON.parse(body);
    if (data?.message || data?.error) return;
    if (/^\/users\/[^/]+$/.test(url.pathname) && typeof data?.login === 'string'
      && data.login.toLowerCase() === url.pathname.split('/')[2].toLowerCase()
      && data.html_url === `https://github.com/${data.login}`) return url.href;
    if (/^\/repos\/[^/]+\/[^/]+$/.test(url.pathname) && typeof data?.full_name === 'string'
      && data.full_name.toLowerCase() === url.pathname.slice(7).toLowerCase()) return url.href;
  } catch { /* Error text, truncated JSON and transformed output need review. */ }
}
