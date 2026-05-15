import { describe, expect, test } from 'bun:test';
import { parseFetchCommand } from './init';

describe('parseFetchCommand()', () => {
    test('parses browser fetch snippet with headers and cookie', () => {
        const input = `fetch("https://b01lersc.tf/challenges", {
  "headers": {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "cookie": "ctf_clearance=example-cookie"
  },
  "body": null,
  "method": "GET"
});`;

        const result = parseFetchCommand(input);

        expect(result.url).toBe('https://b01lersc.tf/challenges');
        expect(result.method).toBe('GET');
        expect(result.headers).toBeDefined();
        expect(result.headers?.accept).toContain('text/html');
        expect(result.headers?.cookie).toBe('ctf_clearance=example-cookie');
    });

    test('defaults to GET when options object is omitted', () => {
        const input = `fetch("https://example.com/challenges")`;
        const result = parseFetchCommand(input);

        expect(result.url).toBe('https://example.com/challenges');
        expect(result.method).toBe('GET');
        expect(result.headers).toEqual({});
    });
});
