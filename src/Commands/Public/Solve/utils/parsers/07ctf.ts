import { ParsedChallenge, validateAndSanitizeChallenge } from './types';

// 07CTF format validation
function validate(data: any): void {
    let challenges: any[];
    
    if (typeof data === 'object' && data !== null) {
        if (data.challenges && Array.isArray(data.challenges)) {
            challenges = data.challenges;
        } else if (Array.isArray(data)) {
            challenges = data;
        } else {
            throw new Error('07CTF format error: Expected object with challenges array or direct array');
        }
    } else if (Array.isArray(data)) {
        challenges = data;
    } else {
        throw new Error('07CTF format error: Expected object or array, got ' + typeof data);
    }
    
    // Validate 07CTF-specific structure
    if (challenges.length > 0) {
        const challenge = challenges[0];
        if (typeof challenge !== 'object' || challenge === null) {
            throw new Error('07CTF format error: Challenge items must be objects');
        }
        
        // 07CTF should have title field
        if (!challenge.title) {
            throw new Error('07CTF format error: Challenges must have a "title" field');
        }
        
        if (typeof challenge.title !== 'string') {
            throw new Error('07CTF format error: Challenge "title" must be a string');
        }
        
        // Check for solve_count field which is typical in 07CTF
        if (challenge.solve_count !== undefined && typeof challenge.solve_count !== 'number') {
            throw new Error('07CTF format error: "solve_count" must be a number when present');
        }
    }
}

// Parse 07CTF format
export function parse(data: any): ParsedChallenge[] {
    // Validate 07CTF format before processing
    validate(data);
    
    // 07CTF returns data with challenges array
    let challenges: any[];
    
    if (data.challenges && Array.isArray(data.challenges)) {
        challenges = data.challenges;
    } else if (Array.isArray(data)) {
        challenges = data;
    } else {
        throw new Error('Invalid 07CTF response format - expected object with challenges array or direct array');
    }
    
    return challenges.map((challenge: any, index: number) => {
        // 07CTF field mappings
        const id = challenge.id || index + 1;
        const name = challenge.title || `Challenge ${index + 1}`;
        const category = challenge.category || 'misc';
        
        // Dynamic points calculation: start at 500, reduce by 10 per solve, minimum 100
        const solveCount = challenge.solve_count || 0;
        const points = Math.max(100, 500 - (solveCount * 10));
        
        const solves = solveCount;
        const solved = challenge.solved || false;
        
        // No specific tags in 07CTF format, but we can derive from difficulty
        const tags: string[] = [];
        if (challenge.difficulty) {
            tags.push(challenge.difficulty.toLowerCase());
        }
        
        // Combine description with file information if files exist
        let combinedDescription = challenge.description || '';
        
        if (challenge.files && challenge.files.length > 0) {
            const filesInfo = challenge.files.map((file: any, fileIndex: number) => {
                const fileName = file.name || file.filename || `File ${fileIndex + 1}`;
                const fileUrl = file.url || file.link || 'No URL available';
                return `📎 **${fileName}**: ${fileUrl}`;
            }).join('\n');
            
            if (combinedDescription) {
                combinedDescription += '\n\n---\n\n**Files:**\n' + filesInfo;
            } else {
                combinedDescription = '**Files:**\n' + filesInfo;
            }
        }
        
        return validateAndSanitizeChallenge({
            id,
            name,
            category,
            points,
            solves,
            solved,
            description: combinedDescription,
            tags
        }, index);
    });
}
