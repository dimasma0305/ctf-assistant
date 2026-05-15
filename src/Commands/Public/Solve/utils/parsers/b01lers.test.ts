import { describe, expect, test } from 'bun:test';
import { parse } from './b01lers';

describe('b01lers parser', () => {
    test('parses direct b01lers challenge payload object', () => {
        const result = parse({
            challenges: [
                {
                    id: 'egg',
                    name: 'egg',
                    category: 'web',
                    points: 478,
                    solves: 14,
                    description: 'Test challenge',
                    tags: ['beginner']
                }
            ],
            solves: []
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('egg');
        expect(result[0].name).toBe('egg');
        expect(result[0].category).toBe('web');
        expect(result[0].points).toBe(478);
        expect(result[0].solves).toBe(14);
        expect(result[0].solved).toBe(false);
        expect(result[0].tags).toEqual(['beginner']);
    });

    test('parses Next.js self.__next_f payload from challenges HTML', () => {
        const challenges = [
            {
                id: 'egg',
                name: 'egg',
                category: 'web',
                points: 478,
                solves: 14,
                description: 'Test challenge from HTML',
                tags: ['beginner'],
                files: [
                    {
                        name: 'egg.zip',
                        url: 'https://example.com/egg.zip'
                    }
                ]
            },
            {
                id: 'pwn-1',
                name: 'throughthewall',
                category: 'pwn',
                points: 386,
                solves: 56,
                description: 'Second challenge',
                tags: []
            }
        ];
        const solves = [{ id: 'pwn-1', name: 'throughthewall' }];

        const decodedPayload = `d:["$","div",null,{"challenges":${JSON.stringify(challenges)},"solves":${JSON.stringify(solves)}}]`;
        const encodedPayload = JSON.stringify(decodedPayload).slice(1, -1);
        const html = `<html><body><script>self.__next_f.push([1,"${encodedPayload}"])</script></body></html>`;

        const result = parse(html);

        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('egg');
        expect(result[0].category).toBe('web');
        expect(result[0].solved).toBe(false);
        expect(result[0].description).toContain('Test challenge from HTML');
        expect(result[0].description).toContain('egg.zip');

        expect(result[1].name).toBe('throughthewall');
        expect(result[1].category).toBe('pwn');
        expect(result[1].solved).toBe(true);
    });

    test('rejects non-nextjs string payloads', () => {
        expect(() => parse('<html><body>hello</body></html>')).toThrow('b01lers format error: Not a Next.js challenges HTML payload');
    });
});
