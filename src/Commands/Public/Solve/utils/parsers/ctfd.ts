import { ParsedChallenge, validateAndSanitizeChallenge } from './types';

// Interface for CTFd challenge format
interface CTFdChallenge {
    id: number;
    type: string;
    name: string;
    value: number;
    solves: number;
    solved_by_me: boolean;
    category: string;
    tags: Array<{ value: string }>;
    template: string;
    script: string;
    description?: string;
    files?: Array<{
        id: number;
        type: string;
        location: string;
    }>;
}

// Interface for CTFd API response
interface CTFdResponse {
    success: boolean;
    data: CTFdChallenge[];
}

// CTFd format validation
function validate(data: any): void {
    if (typeof data !== 'object' || data === null) {
        throw new Error('CTFd format error: Expected object, got ' + typeof data);
    }
    
    if (!data.hasOwnProperty('success')) {
        throw new Error('CTFd format error: Missing required "success" field');
    }
    
    if (typeof data.success !== 'boolean') {
        throw new Error('CTFd format error: "success" field must be boolean');
    }
    
    if (!data.success) {
        throw new Error('CTFd format error: API response indicates failure (success: false)');
    }
    
    if (!data.hasOwnProperty('data')) {
        throw new Error('CTFd format error: Missing required "data" field');
    }
    
    if (!Array.isArray(data.data)) {
        throw new Error('CTFd format error: "data" field must be an array');
    }
    
    // Validate challenge structure for first item (if exists)
    if (data.data.length > 0) {
        const challenge = data.data[0];
        const requiredFields = ['id', 'name', 'category', 'value', 'solves'];
        for (const field of requiredFields) {
            if (!challenge.hasOwnProperty(field)) {
                throw new Error(`CTFd format error: Challenge missing required field "${field}"`);
            }
        }
        
        if (typeof challenge.id !== 'number') {
            throw new Error('CTFd format error: Challenge "id" must be a number');
        }
        
        if (typeof challenge.name !== 'string') {
            throw new Error('CTFd format error: Challenge "name" must be a string');
        }
    }
}

// Parse CTFd format
export function parse(data: any): ParsedChallenge[] {
    // Validate CTFd format before processing
    validate(data);
    
    // TypeScript assertion after validation
    const ctfdData = data as CTFdResponse;
    
    return ctfdData.data.map((challenge, index) => {
        // Combine description with file information if files exist
        let combinedDescription = challenge.description || '';
        
        if (challenge.files && challenge.files.length > 0) {
            const filesInfo = challenge.files.map(file => {
                return `📎 **File ${file.id}**: ${file.location}`;
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
            points: challenge.value,
            solves: challenge.solves,
            solved: challenge.solved_by_me,
            description: combinedDescription,
            tags: challenge.tags?.map(tag => tag.value) || []
        }, index);
    });
}
