import { ParsedChallenge, validateAndSanitizeChallenge } from './types';

// picoCTF format validation
function validate(data: any): void {
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (typeof data === 'object' && data !== null) {
        if (data.problems && Array.isArray(data.problems)) {
            challenges = data.problems;
        } else if (data.data && Array.isArray(data.data)) {
            challenges = data.data;
        } else if (data.challenges && Array.isArray(data.challenges)) {
            challenges = data.challenges;
        } else {
            throw new Error('picoCTF format error: Expected array of problems or object with problems/data/challenges property');
        }
    } else {
        throw new Error('picoCTF format error: Expected array or object, got ' + typeof data);
    }
    
    // Validate picoCTF-specific structure
    if (challenges.length > 0) {
        const challenge = challenges[0];
        if (typeof challenge !== 'object' || challenge === null) {
            throw new Error('picoCTF format error: Challenge items must be objects');
        }
        
        // picoCTF should have name/title and some identifier
        const hasName = challenge.name || challenge.title || challenge.problem_name;
        const hasId = challenge.id || challenge.pid || challenge.problem_id;
        
        if (!hasName) {
            throw new Error('picoCTF format error: Challenges must have a name/title/problem_name field');
        }
    }
}

// Parse picoCTF format
export function parse(data: any): ParsedChallenge[] {
    // Validate picoCTF format before processing
    validate(data);
    
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (data.problems && Array.isArray(data.problems)) {
        challenges = data.problems;
    } else if (data.data && Array.isArray(data.data)) {
        challenges = data.data;
    } else if (data.challenges && Array.isArray(data.challenges)) {
        challenges = data.challenges;
    } else {
        throw new Error('Invalid picoCTF response format - expected array of problems or object with problems/data/challenges property');
    }
    
    return challenges.map((challenge: any, index: number) => {
        // picoCTF field mappings
        const id = challenge.id || 
                  challenge.pid || 
                  challenge.problem_id || 
                  index + 1;
                  
        const name = challenge.name || 
                    challenge.title || 
                    challenge.problem_name || 
                    `Challenge ${index + 1}`;
                    
        const category = challenge.category || 
                        challenge.genre || 
                        challenge.type || 
                        'misc';
                        
        const points = challenge.points || 
                      challenge.value || 
                      challenge.score || 
                      challenge.worth || 0;
                      
        const solves = challenge.solves || 
                      challenge.solve_count || 
                      challenge.num_solves || 
                      challenge.solved_by || 0;
                      
        const solved = challenge.solved || 
                      challenge.solved_by_me || 
                      challenge.is_solved || 
                      challenge.status === 'solved' || false;
                      
        // Handle hints as tags
        let tags: string[] = [];
        if (challenge.hints && Array.isArray(challenge.hints)) {
            tags = challenge.hints;
        } else if (challenge.tags && Array.isArray(challenge.tags)) {
            tags = challenge.tags;
        }
        
        return validateAndSanitizeChallenge({
            id,
            name,
            category,
            points,
            solves,
            solved,
            tags
        }, index);
    });
}
