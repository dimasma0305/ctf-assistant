import { describe, test, expect } from 'bun:test';
import { parse } from './pointeroverflow';
describe('Pointer Overflow CTF Parser', () => {
    describe('Valid Data Parsing', () => {
        test('should parse valid challenge data without security prefix', () => {
            const validData = {
                challenges: [
                    {
                        cid: 178303157050061,
                        name: 'OSINT 400-1 Behave, Ye Strangers',
                        points: 400,
                        min_points: 400,
                        current_points: 400,
                        description: 'Test description for OSINT challenge',
                        unlocked: true,
                        answered: false,
                        solves: 14,
                        weight: 30,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static_pbkdf2_ci',
                        attachments: [],
                        tags: [{ tagslug: 'osint', name: 'OSINT' }],
                    },
                ],
            };

            const result = parse(validData);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(178303157050061);
            expect(result[0].name).toBe('OSINT 400-1 Behave, Ye Strangers');
            expect(result[0].category).toBe('osint');
            expect(result[0].points).toBe(400);
            expect(result[0].solves).toBe(14);
            expect(result[0].solved).toBe(false);
            expect(result[0].description).toBe('Test description for OSINT challenge');
            expect(result[0].tags).toEqual(['OSINT']);
        });

        test('should parse challenge with current_points when available', () => {
            const data = {
                challenges: [
                    {
                        cid: 123,
                        name: 'Web 200-1 Test',
                        points: 300,
                        min_points: 100,
                        current_points: 250,
                        description: 'Test',
                        unlocked: true,
                        answered: false,
                        solves: 5,
                        weight: 20,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].points).toBe(250); // Should use current_points
        });

        test('should parse multiple challenges', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'OSINT 100-1 Test One',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'First challenge',
                        unlocked: true,
                        answered: true,
                        solves: 50,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [{ tagslug: 'osint', name: 'OSINT' }],
                    },
                    {
                        cid: 2,
                        name: 'Web 200-1 Test Two',
                        points: 200,
                        min_points: 200,
                        current_points: 200,
                        description: 'Second challenge',
                        unlocked: true,
                        answered: false,
                        solves: 30,
                        weight: 20,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [{ tagslug: 'web', name: 'Web' }],
                    },
                ],
            };

            const result = parse(data);

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('OSINT 100-1 Test One');
            expect(result[0].category).toBe('osint');
            expect(result[0].solved).toBe(true);
            expect(result[1].name).toBe('Web 200-1 Test Two');
            expect(result[1].category).toBe('web');
            expect(result[1].solved).toBe(false);
        });
    });

    describe('Security Prefix Handling', () => {
        test('should handle security prefix )]}\' in string data', () => {
            const dataWithPrefix = `)]}'{"challenges": [{"cid": 123, "name": "Web 100-1 Test", "points": 100, "min_points": 100, "current_points": 100, "description": "Test", "unlocked": true, "answered": false, "solves": 10, "weight": 10, "prerequisite": {"type": "None"}, "teaser": false, "validator": "static", "attachments": [], "tags": []}]}`;

            const result = parse(dataWithPrefix);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Web 100-1 Test');
        });

        test('should handle security prefix with comma )]}\', in string data', () => {
            const dataWithPrefix = `)]}', {"challenges": [{"cid": 123, "name": "Crypto 100-1 Test", "points": 100, "min_points": 100, "current_points": 100, "description": "Test", "unlocked": true, "answered": false, "solves": 10, "weight": 10, "prerequisite": {"type": "None"}, "teaser": false, "validator": "static", "attachments": [], "tags": []}]}`;

            const result = parse(dataWithPrefix);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Crypto 100-1 Test');
        });

        test('should work without security prefix', () => {
            const dataWithoutPrefix = '{"challenges": [{"cid": 123, "name": "Pwn 100-1 Test", "points": 100, "min_points": 100, "current_points": 100, "description": "Test", "unlocked": true, "answered": false, "solves": 10, "weight": 10, "prerequisite": {"type": "None"}, "teaser": false, "validator": "static", "attachments": [], "tags": []}]}';

            const result = parse(dataWithoutPrefix);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Pwn 100-1 Test');
        });
    });

    describe('Category Extraction', () => {
        test('should extract category from challenge name (OSINT)', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'OSINT 400-1 Behave, Ye Strangers',
                        points: 400,
                        min_points: 400,
                        current_points: 400,
                        description: 'Test',
                        unlocked: true,
                        answered: false,
                        solves: 14,
                        weight: 30,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);
            expect(result[0].category).toBe('osint');
        });

        test('should extract category from challenge name (Web)', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: "Web 200-1 What's Mine is Yours",
                        points: 200,
                        min_points: 200,
                        current_points: 200,
                        description: 'Test',
                        unlocked: true,
                        answered: false,
                        solves: 44,
                        weight: 44,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);
            expect(result[0].category).toBe('web');
        });

        test('should handle lowercase category names', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'crypto 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'Test',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);
            expect(result[0].category).toBe('crypto');
        });

        test('should default to misc if no category pattern found', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Some Random Challenge',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'Test',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);
            expect(result[0].category).toBe('misc');
        });
    });

    describe('Attachments Handling', () => {
        test('should include attachments in description', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Forensics 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'Find the flag',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [
                            {
                                aid: 1,
                                url: 'https://example.com/file1.zip',
                                name: 'challenge.zip',
                            },
                            {
                                aid: 2,
                                url: 'https://example.com/file2.txt',
                                name: 'hint.txt',
                            },
                        ],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].description).toContain('Find the flag');
            expect(result[0].description).toContain('**Attachments:**');
            expect(result[0].description).toContain('📎 **challenge.zip**: https://example.com/file1.zip');
            expect(result[0].description).toContain('📎 **hint.txt**: https://example.com/file2.txt');
        });

        test('should handle attachments without names', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Rev 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'Reverse me',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [
                            {
                                aid: 5,
                                url: 'https://example.com/binary',
                                name: '',
                            },
                        ],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].description).toContain('📎 **Attachment 5**: https://example.com/binary');
        });

        test('should handle empty attachments array', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Misc 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'Simple challenge',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].description).toBe('Simple challenge');
            expect(result[0].description).not.toContain('**Attachments:**');
        });
    });

    describe('Tags Handling', () => {
        test('should extract tags from tags array', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Web 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'Test',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [
                            { tagslug: 'web', name: 'Web' },
                            { tagslug: 'xss', name: 'XSS' },
                        ],
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].tags).toEqual(['Web', 'XSS']);
        });

        test('should add locked tag when unlocked is false', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Crypto 500-1 Test',
                        points: 500,
                        min_points: 500,
                        current_points: 500,
                        description: 'Test',
                        unlocked: false,
                        answered: false,
                        solves: 0,
                        weight: 50,
                        prerequisite: { type: 'Challenge' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].tags).toContain('locked');
        });

        test('should add teaser tag when teaser is true', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Pwn 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'Test',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: true,
                        validator: 'static',
                        attachments: [],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].tags).toContain('teaser');
        });

        test('should combine all tags', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Web 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'Test',
                        unlocked: false,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'Challenge' },
                        teaser: true,
                        validator: 'static',
                        attachments: [],
                        tags: [{ tagslug: 'web', name: 'Web' }],
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].tags).toEqual(['Web', 'locked', 'teaser']);
        });
    });

    describe('Error Handling', () => {
        test('should throw error for non-object data', () => {
            expect(() => parse(null)).toThrow('Pointer Overflow CTF format error: Expected object');
            expect(() => parse(undefined)).toThrow('Pointer Overflow CTF format error: Expected object');
            expect(() => parse(123)).toThrow('Pointer Overflow CTF format error: Expected object');
        });

        test('should throw error for missing challenges field', () => {
            expect(() => parse({})).toThrow('Pointer Overflow CTF format error: Missing required "challenges" field');
        });

        test('should throw error for non-array challenges field', () => {
            expect(() => parse({ challenges: 'not an array' })).toThrow(
                'Pointer Overflow CTF format error: "challenges" field must be an array'
            );
        });

        test('should throw error for missing required challenge fields', () => {
            const invalidData = {
                challenges: [
                    {
                        cid: 1,
                        // missing name
                        points: 100,
                        solves: 10,
                    },
                ],
            };

            expect(() => parse(invalidData)).toThrow(
                'Pointer Overflow CTF format error: Challenge missing required field "name"'
            );
        });

        test('should throw error for invalid cid type', () => {
            const invalidData = {
                challenges: [
                    {
                        cid: 'not a number',
                        name: 'Test',
                        points: 100,
                        solves: 10,
                    },
                ],
            };

            expect(() => parse(invalidData)).toThrow(
                'Pointer Overflow CTF format error: Challenge "cid" must be a number'
            );
        });

        test('should throw error for invalid JSON with security prefix', () => {
            const invalidJSON = `)]}', {invalid json}`;

            expect(() => parse(invalidJSON)).toThrow(
                'Pointer Overflow CTF format error: Failed to parse JSON after removing security prefix'
            );
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty challenges array', () => {
            const data = { challenges: [] };

            const result = parse(data);

            expect(result).toEqual([]);
        });

        test('should handle missing description', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Web 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: '',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);

            // Empty description gets converted to undefined by validateAndSanitizeChallenge
            expect(result[0].description).toBeUndefined();
        });

        test('should handle challenge with only attachments (no text description)', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Stego 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: '',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [
                            {
                                aid: 1,
                                url: 'https://example.com/image.png',
                                name: 'image.png',
                            },
                        ],
                        tags: [],
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].description).toContain('**Attachments:**');
            expect(result[0].description).toContain('📎 **image.png**');
        });

        test('should handle missing tags array', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Misc 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'Test',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: undefined,
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].tags).toEqual([]);
        });

        test('should handle tag with missing name (use tagslug)', () => {
            const data = {
                challenges: [
                    {
                        cid: 1,
                        name: 'Web 100-1 Test',
                        points: 100,
                        min_points: 100,
                        current_points: 100,
                        description: 'Test',
                        unlocked: true,
                        answered: false,
                        solves: 10,
                        weight: 10,
                        prerequisite: { type: 'None' },
                        teaser: false,
                        validator: 'static',
                        attachments: [],
                        tags: [{ tagslug: 'web-security', name: '' }],
                    },
                ],
            };

            const result = parse(data);

            expect(result[0].tags).toContain('web-security');
        });
    });
});

