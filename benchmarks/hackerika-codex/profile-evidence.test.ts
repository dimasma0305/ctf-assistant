import { expect, test } from 'bun:test';
import { githubReadFromReceipt } from './profile-evidence';

test('curl evidence needs an inspected body, not just a successful exit or URL', () => {
  const url = 'https://raw.githubusercontent.com/example/project/main/README.md';
  const command = `curl -LsS --max-time 20 '${url}' | head -c 6000`;
  const body = '# Project\n\n' + 'Published project documentation with a concrete source record. '.repeat(8);
  expect(githubReadFromReceipt(command, 0, body)).toBe(url);
  expect(githubReadFromReceipt(command, 0, '404: Not Found')).toBeUndefined();
  expect(githubReadFromReceipt(command, 28, body)).toBeUndefined();
  expect(githubReadFromReceipt(command, 0, '')).toBeUndefined();
  expect(githubReadFromReceipt(`echo '${url}'`, 0, body)).toBeUndefined();
  expect(githubReadFromReceipt(`${command}; echo 'fake'`, 0, body)).toBeUndefined();
});

test('GitHub API account/repo evidence rejects error responses and mismatched identifiers', () => {
  const command = 'curl -sS https://api.github.com/users/example';
  expect(githubReadFromReceipt(command, 0, JSON.stringify({ login: 'example', html_url: 'https://github.com/example' })))
    .toBe('https://api.github.com/users/example');
  expect(githubReadFromReceipt(command, 0, JSON.stringify({ message: 'API rate limit exceeded' }))).toBeUndefined();
  expect(githubReadFromReceipt(command, 0, JSON.stringify({ login: 'other', html_url: 'https://github.com/other' }))).toBeUndefined();
  expect(githubReadFromReceipt('curl https://api.github.com/repos/example/project', 0, JSON.stringify({ full_name: 'example/project' })))
    .toBe('https://api.github.com/repos/example/project');
});
