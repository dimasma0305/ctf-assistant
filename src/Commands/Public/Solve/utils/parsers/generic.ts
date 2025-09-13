import { ParsedChallenge, validateAndSanitizeChallenge } from './types';

// Generic format validation
function validate(data: any): void {
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (typeof data === 'object' && data !== null) {
        const possibleArrays = [
            data.data, data.challenges, data.challs, 
            data.problems, data.tasks, data.items
        ];
        
        const foundArray = possibleArrays.find(arr => Array.isArray(arr));
        
        if (foundArray) {
            challenges = foundArray;
        } else {
            throw new Error('Generic format error: Expected array of challenges or object with data/challenges/challs/problems/tasks/items property');
        }
    } else {
        throw new Error('Generic format error: Expected array or object, got ' + typeof data);
    }
    
    // Basic validation for generic format
    if (challenges.length > 0) {
        const challenge = challenges[0];
        if (typeof challenge !== 'object' || challenge === null) {
            throw new Error('Generic format error: Challenge items must be objects');
        }
        
        // Generic format should have some form of name
        const hasName = challenge.name || challenge.title || 
                       challenge.problem_name || challenge.task_name || 
                       challenge.challenge_name;
        
        if (!hasName) {
            throw new Error('Generic format error: Challenges must have a name field (name, title, problem_name, task_name, or challenge_name)');
        }
    }
}

// Parse generic format - handles multiple common formats
export function parse(data: any): ParsedChallenge[] {
    // Validate generic format before processing
    validate(data);
    
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (data.data && Array.isArray(data.data)) {
        challenges = data.data;
    } else if (data.challenges && Array.isArray(data.challenges)) {
        challenges = data.challenges;
    } else if (data.challs && Array.isArray(data.challs)) {
        challenges = data.challs;
    } else if (data.problems && Array.isArray(data.problems)) {
        challenges = data.problems;
    } else if (data.tasks && Array.isArray(data.tasks)) {
        challenges = data.tasks;
    } else if (data.items && Array.isArray(data.items)) {
        challenges = data.items;
    } else {
        throw new Error('Generic format expects an array of challenges or object with data/challenges/challs/problems/tasks/items property');
    }
    
    return challenges.map((challenge: any, index: number) => {
        // Try to map common field variations
        const id = challenge.id || 
                  challenge._id || 
                  challenge.challengeId || 
                  challenge.problem_id || 
                  challenge.task_id || 
                  index + 1;
                  
        const name = challenge.name || 
                    challenge.title || 
                    challenge.problem_name || 
                    challenge.task_name || 
                    challenge.challenge_name || 
                    `Challenge ${index + 1}`;
                    
        const category = challenge.category || 
                        challenge.type || 
                        challenge.genre || 
                        challenge.topic || 
                        challenge.section || 
                        'misc';
                        
        const points = challenge.points || 
                      challenge.value || 
                      challenge.score || 
                      challenge.weight || 
                      challenge.difficulty || 
                      challenge.worth || 0;
                      
        const solves = challenge.solves || 
                      challenge.solve_count || 
                      challenge.solved_count || 
                      challenge.submissions || 
                      challenge.completions || 
                      challenge.num_solves || 0;
                      
        const solved = challenge.solved || 
                      challenge.solved_by_me || 
                      challenge.is_solved || 
                      challenge.completed || 
                      challenge.status === 'solved' || 
                      challenge.status === 'complete' || false;
                      
        // Handle tags in various formats
        let tags: string[] = [];
        if (challenge.tags && Array.isArray(challenge.tags)) {
            tags = challenge.tags.map((tag: any) => 
                typeof tag === 'string' ? tag : (tag.name || tag.value || tag.tag || String(tag))
            );
        } else if (challenge.hints && Array.isArray(challenge.hints)) {
            tags = challenge.hints;
        } else if (challenge.keywords && Array.isArray(challenge.keywords)) {
            tags = challenge.keywords;
        } else if (typeof challenge.tags === 'string') {
            // Handle comma-separated tags
            tags = challenge.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
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
