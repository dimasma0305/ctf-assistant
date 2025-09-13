import { ParsedChallenge, validateAndSanitizeChallenge } from './types';

// rCTF format validation
function validate(data: any): void {
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (typeof data === 'object' && data !== null) {
        if (data.challenges && Array.isArray(data.challenges)) {
            challenges = data.challenges;
        } else if (data.data && Array.isArray(data.data)) {
            challenges = data.data;
        } else if (data.challs && Array.isArray(data.challs)) {
            challenges = data.challs;
        } else {
            throw new Error('rCTF format error: Expected array of challenges or object with challenges/data/challs property');
        }
    } else {
        throw new Error('rCTF format error: Expected array or object, got ' + typeof data);
    }
    
    // Validate at least one challenge has rCTF-like structure
    if (challenges.length > 0) {
        const challenge = challenges[0];
        if (typeof challenge !== 'object' || challenge === null) {
            throw new Error('rCTF format error: Challenge items must be objects');
        }
        
        // rCTF should have at least name/title and some identifier
        const hasName = challenge.name || challenge.title || challenge.chall_name;
        const hasId = challenge.id || challenge._id || challenge.chall_id;
        
        if (!hasName) {
            throw new Error('rCTF format error: Challenges must have a name/title field');
        }
    }
}

// Parse rCTF format 
export function parse(data: any): ParsedChallenge[] {
    // Validate rCTF format before processing
    validate(data);
    
    // rCTF can return data in different formats:
    // 1. Direct array of challenges
    // 2. Object with challenges property
    // 3. Object with data property containing challenges
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (data.challenges && Array.isArray(data.challenges)) {
        challenges = data.challenges;
    } else if (data.data && Array.isArray(data.data)) {
        challenges = data.data;
    } else if (data.challs && Array.isArray(data.challs)) {
        challenges = data.challs;
    } else {
        throw new Error('Invalid rCTF response format - expected array of challenges or object with challenges/data/challs property');
    }
    
    return challenges.map((challenge: any, index: number) => {
        // rCTF typically uses these field names
        const id = challenge.id || challenge._id || challenge.chall_id || index + 1;
        const name = challenge.name || challenge.title || challenge.chall_name || `Challenge ${index + 1}`;
        const category = challenge.category || challenge.genre || challenge.type || 'misc';
        const points = challenge.points || challenge.value || challenge.score || challenge.weight || 0;
        const solves = challenge.solves || challenge.solve_count || challenge.num_solves || 0;
        const solved = challenge.solved || challenge.is_solved || challenge.solved_by_me || false;
        const tags = challenge.tags || challenge.hints || [];
        
        return validateAndSanitizeChallenge({
            id,
            name,
            category,
            points,
            solves,
            solved,
            tags: Array.isArray(tags) ? tags : []
        }, index);
    });
}
