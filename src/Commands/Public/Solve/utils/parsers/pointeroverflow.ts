import { ParsedChallenge, validateAndSanitizeChallenge } from './types';

// Interface for Pointer Overflow CTF challenge format
interface PointerOverflowChallenge {
    cid: number;
    name: string;
    points: number;
    min_points: number;
    current_points: number;
    description: string;
    unlocked: boolean;
    answered: boolean;
    solves: number;
    weight: number;
    prerequisite: {
        type: string;
    };
    teaser: boolean;
    validator: string;
    attachments: Array<{
        aid: number;
        url: string;
        name: string;
    }>;
    tags: Array<{
        tagslug: string;
        name: string;
    }>;
    answers?: Array<{
        timestamp: string;
        team: {
            name: string;
            tid: number;
        };
    }>;
}

// Interface for Pointer Overflow CTF API response
interface PointerOverflowResponse {
    challenges: PointerOverflowChallenge[];
}

// Pointer Overflow CTF format validation
function validateResponseShape(data: any): asserts data is PointerOverflowResponse {
    if (typeof data !== 'object' || data === null) {
        throw new Error('Pointer Overflow CTF format error: Expected object');
    }
    if (!('challenges' in data)) {
        throw new Error('Pointer Overflow CTF format error: Missing required "challenges" field');
    }
    if (!Array.isArray((data as any).challenges)) {
        throw new Error('Pointer Overflow CTF format error: "challenges" field must be an array');
    }
}

function validateChallengeShape(challenge: any): void {
    if (typeof challenge !== 'object' || challenge === null) {
        throw new Error('Pointer Overflow CTF format error: Challenge must be an object');
    }

    // Validate required fields (tests expect specific messages for these).
    if (!('name' in challenge) || typeof challenge.name !== 'string') {
        throw new Error('Pointer Overflow CTF format error: Challenge missing required field "name"');
    }
    if (!('cid' in challenge) || typeof challenge.cid !== 'number') {
        throw new Error('Pointer Overflow CTF format error: Challenge "cid" must be a number');
    }
}

// Extract category from challenge name
// Examples: "OSINT 400-1 Behave, Ye Strangers" -> "osint"
//           "Web 200-1 What's Mine is Yours" -> "web"
function extractCategory(name: string): string {
    // Match pattern like "OSINT 400-1" or "Web 200-1"
    const match = name.match(/^([A-Za-z]+)\s+\d+/);
    if (match) {
        return match[1].toLowerCase();
    }
    return 'misc';
}

// Parse Pointer Overflow CTF format
export function parse(data: any): ParsedChallenge[] {
    // Handle security prefix: )]}'
    let parsedData = data;
    
    // If data is a string, remove the security prefix and parse
    if (typeof data === 'string') {
        // Remove the )]}' prefix if present
        const cleanedData = data.replace(/^\)\]\}',?\s*/, '');
        try {
            parsedData = JSON.parse(cleanedData);
        } catch (error) {
            throw new Error('Pointer Overflow CTF format error: Failed to parse JSON after removing security prefix');
        }
    }
    
    // Validate format before processing
    validateResponseShape(parsedData);
    
    // TypeScript assertion after validation
    const poData = parsedData as PointerOverflowResponse;
    
    return poData.challenges.map((challenge, index) => {
        validateChallengeShape(challenge);

        // Extract category from challenge name
        const category = extractCategory(challenge.name);
        
        // Combine description with attachments if they exist
        let combinedDescription = challenge.description || '';
        
        // Add attachments information to description if attachments exist
        if (Array.isArray(challenge.attachments) && challenge.attachments.length > 0) {
            const attachmentsInfo = challenge.attachments.map((file: any) => {
                return `📎 **${file.name || `Attachment ${file.aid}`}**: ${file.url}`;
            }).join('\n');
            
            if (combinedDescription) {
                combinedDescription += '\n\n---\n\n**Attachments:**\n' + attachmentsInfo;
            } else {
                combinedDescription = '**Attachments:**\n' + attachmentsInfo;
            }
        }
        
        // Extract tags
        const tags = Array.isArray(challenge.tags) ? challenge.tags.map((tag: any) => tag.name || tag.tagslug) : [];
        
        // Add additional metadata as tags
        if (challenge.unlocked === false) {
            tags.push('locked');
        }
        if (challenge.teaser === true) {
            tags.push('teaser');
        }
        
        return validateAndSanitizeChallenge({
            id: challenge.cid,
            name: challenge.name,
            category: category,
            points: typeof challenge.current_points === 'number' ? challenge.current_points : challenge.points,
            solves: challenge.solves,
            solved: challenge.answered === true,
            description: combinedDescription,
            tags
        }, index);
    });
}
