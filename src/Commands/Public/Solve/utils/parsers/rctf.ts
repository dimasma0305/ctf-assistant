import { ParsedChallenge, validateAndSanitizeChallenge } from './types';

// Interface for RCTF challenge format
interface RCTFChallenge {
    id: string;
    name: string;
    category: string;
    points: number;
    solves: number;
    description: string;
    author: string;
    files: Array<{
        url: string;
        name: string;
    }>;
    totalVotes: number;
    userVote: number;
}

// Interface for RCTF API response
interface RCTFResponse {
    kind: string;
    message: string;
    data: RCTFChallenge[];
}

// RCTF format validation
function validate(data: any): void {
    if (typeof data !== 'object' || data === null) {
        throw new Error('RCTF format error: Expected object, got ' + typeof data);
    }
    
    if (!data.hasOwnProperty('kind')) {
        throw new Error('RCTF format error: Missing required "kind" field');
    }
    
    if (typeof data.kind !== 'string') {
        throw new Error('RCTF format error: "kind" field must be a string');
    }
    
    if (!data.hasOwnProperty('message')) {
        throw new Error('RCTF format error: Missing required "message" field');
    }
    
    if (typeof data.message !== 'string') {
        throw new Error('RCTF format error: "message" field must be a string');
    }
    
    if (!data.hasOwnProperty('data')) {
        throw new Error('RCTF format error: Missing required "data" field');
    }
    
    if (!Array.isArray(data.data)) {
        throw new Error('RCTF format error: "data" field must be an array');
    }
    
    // Validate challenge structure for first item (if exists)
    if (data.data.length > 0) {
        const challenge = data.data[0];
        const requiredFields = ['id', 'name', 'category', 'points', 'solves'];
        for (const field of requiredFields) {
            if (!challenge.hasOwnProperty(field)) {
                throw new Error(`RCTF format error: Challenge missing required field "${field}"`);
            }
        }
        
        if (typeof challenge.id !== 'string') {
            throw new Error('RCTF format error: Challenge "id" must be a string');
        }
        
        if (typeof challenge.name !== 'string') {
            throw new Error('RCTF format error: Challenge "name" must be a string');
        }
        
        if (typeof challenge.category !== 'string') {
            throw new Error('RCTF format error: Challenge "category" must be a string');
        }
        
        if (typeof challenge.points !== 'number') {
            throw new Error('RCTF format error: Challenge "points" must be a number');
        }
        
        if (typeof challenge.solves !== 'number') {
            throw new Error('RCTF format error: Challenge "solves" must be a number');
        }
    }
}

// Parse RCTF format
export function parse(data: any): ParsedChallenge[] {
    // Validate RCTF format before processing
    validate(data);
    
    // TypeScript assertion after validation
    const rctfData = data as RCTFResponse;
    
    return rctfData.data.map((challenge, index) => {
        // Extract tags from category (RCTF categories can contain multiple tags separated by /)
        const tags: string[] = [];
        if (challenge.category) {
            // Split category by / and filter out empty strings
            const categoryTags = challenge.category.split('/').map(tag => tag.trim()).filter(tag => tag);
            tags.push(...categoryTags);
        }
        
        // Add author as a tag if present
        if (challenge.author) {
            tags.push(`author:${challenge.author.replace('@', '')}`);
        }
        
        // Add file count as a tag if there are files
        if (challenge.files && challenge.files.length > 0) {
            tags.push(`files:${challenge.files.length}`);
        }
        
        // Combine description with file information
        let combinedDescription = challenge.description || '';
        
        // Add files information to description if files exist
        if (challenge.files && challenge.files.length > 0) {
            const filesInfo = challenge.files.map(file => {
                return `📎 **${file.name}**: ${file.url}`;
            }).join('\n');
            
            if (combinedDescription) {
                combinedDescription += '\n\n---\n\n**Files:**\n' + filesInfo;
            } else {
                combinedDescription = '**Files:**\n' + filesInfo;
            }
        }
        
        return validateAndSanitizeChallenge({
            id: challenge.id,
            name: challenge.name,
            category: challenge.category,
            points: challenge.points,
            solves: challenge.solves,
            solved: false, // RCTF doesn't provide solved status in this endpoint
            description: combinedDescription,
            tags
        }, index);
    });
}
