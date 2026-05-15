import { ParsedChallenge, validateAndSanitizeChallenge } from './types';

interface B01lersChallenge {
    id?: string | number;
    name?: string;
    category?: string;
    points?: number;
    solves?: number;
    description?: string;
    tags?: Array<string | { name?: string; value?: string }>;
    files?: Array<{ url?: string; name?: string }>;
    solved?: boolean;
    solved_by_me?: boolean;
    answered?: boolean;
}

interface B01lersPayload {
    challenges: B01lersChallenge[];
    solves?: Array<{
        id?: string | number;
        name?: string;
    }>;
}

function findMatchingArrayEnd(input: string, arrayStartIndex: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = arrayStartIndex; i < input.length; i++) {
        const char = input[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (inString) {
            continue;
        }

        if (char === '[') {
            depth += 1;
        } else if (char === ']') {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

function extractChallengesFromNextFlightPayload(decodedPayload: string): B01lersPayload | null {
    const challengesKey = '"challenges":';
    const challengesKeyIndex = decodedPayload.indexOf(challengesKey);
    if (challengesKeyIndex === -1) {
        return null;
    }

    const challengesArrayStart = decodedPayload.indexOf('[', challengesKeyIndex + challengesKey.length);
    if (challengesArrayStart === -1) {
        return null;
    }

    const challengesArrayEnd = findMatchingArrayEnd(decodedPayload, challengesArrayStart);
    if (challengesArrayEnd === -1) {
        return null;
    }

    const challengesJson = decodedPayload.slice(challengesArrayStart, challengesArrayEnd + 1);

    let solvesJson = '[]';
    const solvesKey = '"solves":';
    const solvesKeyIndex = decodedPayload.indexOf(solvesKey, challengesArrayEnd + 1);
    if (solvesKeyIndex !== -1) {
        const solvesArrayStart = decodedPayload.indexOf('[', solvesKeyIndex + solvesKey.length);
        if (solvesArrayStart !== -1) {
            const solvesArrayEnd = findMatchingArrayEnd(decodedPayload, solvesArrayStart);
            if (solvesArrayEnd !== -1) {
                solvesJson = decodedPayload.slice(solvesArrayStart, solvesArrayEnd + 1);
            }
        }
    }

    try {
        return JSON.parse(`{"challenges":${challengesJson},"solves":${solvesJson}}`) as B01lersPayload;
    } catch (_error) {
        return null;
    }
}

function extractPayloadFromNextFlightHtml(html: string): B01lersPayload | null {
    const scriptRegex = /<script[^>]*>\s*self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)\s*<\/script>/g;
    let scriptMatch: RegExpExecArray | null = null;

    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
        const encodedPayload = scriptMatch[1];
        if (!encodedPayload.includes('\\"challenges\\":[')) {
            continue;
        }

        let decodedPayload: string;
        try {
            // Next.js serializes this as a JS string in the script. Decode one level.
            decodedPayload = JSON.parse(`"${encodedPayload}"`);
        } catch (_error) {
            continue;
        }

        const extracted = extractChallengesFromNextFlightPayload(decodedPayload);
        if (extracted && extracted.challenges.length > 0) {
            return extracted;
        }
    }

    return null;
}

function validatePayload(data: any): asserts data is B01lersPayload {
    if (typeof data !== 'object' || data === null) {
        throw new Error('b01lers format error: Expected object');
    }

    if (!Array.isArray(data.challenges)) {
        throw new Error('b01lers format error: Missing required "challenges" array');
    }

    if (data.challenges.length > 0) {
        const challenge = data.challenges[0];
        if (typeof challenge !== 'object' || challenge === null) {
            throw new Error('b01lers format error: Challenge items must be objects');
        }

        if (typeof challenge.name !== 'string' || !challenge.name.trim()) {
            throw new Error('b01lers format error: Challenge "name" must be a non-empty string');
        }

        if (typeof challenge.category !== 'string' || !challenge.category.trim()) {
            throw new Error('b01lers format error: Challenge "category" must be a non-empty string');
        }
    }
}

function normalizeTags(tags: B01lersChallenge['tags']): string[] {
    if (!Array.isArray(tags)) {
        return [];
    }

    return tags
        .map(tag => {
            if (typeof tag === 'string') {
                return tag.trim();
            }

            if (tag && typeof tag === 'object') {
                return String(tag.name || tag.value || '').trim();
            }

            return '';
        })
        .filter(tag => tag.length > 0);
}

function mergeDescriptionAndFiles(description: string, files: B01lersChallenge['files']): string {
    if (!Array.isArray(files) || files.length === 0) {
        return description;
    }

    const filesInfo = files
        .map((file, index) => {
            const fileName = file?.name || `File ${index + 1}`;
            const fileUrl = file?.url || 'No URL available';
            return `📎 **${fileName}**: ${fileUrl}`;
        })
        .join('\n');

    if (!description) {
        return `**Files:**\n${filesInfo}`;
    }

    return `${description}\n\n---\n\n**Files:**\n${filesInfo}`;
}

export function parse(data: any): ParsedChallenge[] {
    let parsedData: B01lersPayload | null = null;

    if (typeof data === 'string') {
        if (!data.includes('self.__next_f.push') || !data.includes('\\"challenges\\":[')) {
            throw new Error('b01lers format error: Not a Next.js challenges HTML payload');
        }

        parsedData = extractPayloadFromNextFlightHtml(data);
        if (!parsedData) {
            throw new Error('b01lers format error: Failed to extract challenges from Next.js payload');
        }
    } else {
        parsedData = data as B01lersPayload;
    }

    validatePayload(parsedData);

    const solvedById = new Set(
        (parsedData.solves || [])
            .map(solve => solve.id)
            .filter((id): id is string | number => id !== undefined && id !== null)
            .map(id => String(id))
    );
    const solvedByName = new Set(
        (parsedData.solves || [])
            .map(solve => solve.name)
            .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    );

    return parsedData.challenges.map((challenge, index) => {
        const description = mergeDescriptionAndFiles(challenge.description || '', challenge.files);
        const solved = Boolean(
            challenge.solved_by_me ||
            challenge.solved ||
            challenge.answered ||
            solvedById.has(String(challenge.id ?? '')) ||
            solvedByName.has(String(challenge.name ?? ''))
        );

        return validateAndSanitizeChallenge({
            id: challenge.id ?? index + 1,
            name: challenge.name,
            category: challenge.category,
            points: challenge.points,
            solves: challenge.solves,
            solved,
            description,
            tags: normalizeTags(challenge.tags)
        }, index);
    });
}
