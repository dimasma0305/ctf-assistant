import { ParsedChallenge, validateAndSanitizeChallenge } from './types';

// GzCTF format validation
function validate(data: any): void {
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (typeof data === 'object' && data !== null) {
        if (data.data && Array.isArray(data.data)) {
            challenges = data.data;
        } else if (data.challenges && Array.isArray(data.challenges)) {
            challenges = data.challenges;
        } else if (data.result && Array.isArray(data.result)) {
            challenges = data.result;
        } else {
            throw new Error('GzCTF format error: Expected array of challenges or object with data/challenges/result property');
        }
    } else {
        throw new Error('GzCTF format error: Expected array or object, got ' + typeof data);
    }
    
    // Validate GzCTF-specific structure
    if (challenges.length > 0) {
        const challenge = challenges[0];
        if (typeof challenge !== 'object' || challenge === null) {
            throw new Error('GzCTF format error: Challenge items must be objects');
        }
        
        // GzCTF should have title/name and id/challengeId
        const hasName = challenge.title || challenge.name || challenge.challengeName;
        const hasId = challenge.id || challenge.challengeId || challenge.Id;
        
        if (!hasName) {
            throw new Error('GzCTF format error: Challenges must have a title/name field');
        }
        
        // GzCTF often has specific score-related fields
        const hasScore = challenge.originalScore !== undefined || 
                         challenge.minScore !== undefined || 
                         challenge.points !== undefined ||
                         challenge.baseScore !== undefined;
        
        if (!hasScore && challenges.length > 0) {
            console.warn('GzCTF format warning: No recognizable score fields found');
        }
    }
}

// Parse GzCTF format
export function parse(data: any): ParsedChallenge[] {
    // Validate GzCTF format before processing
    validate(data);
    
    // GzCTF can return data in multiple formats:
    // 1. Direct array of challenges
    // 2. Object with 'data' property containing challenges
    // 3. Object with 'challenges' property
    // 4. Object with 'result' property containing challenges
    let challenges: any[];
    
    if (Array.isArray(data)) {
        challenges = data;
    } else if (data.data && Array.isArray(data.data)) {
        challenges = data.data;
    } else if (data.challenges && Array.isArray(data.challenges)) {
        challenges = data.challenges;
    } else if (data.result && Array.isArray(data.result)) {
        challenges = data.result;
    } else {
        throw new Error('Invalid GzCTF response format - expected array of challenges or object with data/challenges/result property');
    }
    
    return challenges.map((challenge: any, index: number) => {
        // GzCTF uses various field names depending on version
        const id = challenge.id || challenge.challengeId || challenge.Id || index + 1;
        const name = challenge.title || challenge.name || challenge.challengeName || `Challenge ${index + 1}`;
        const category = challenge.category || challenge.type || challenge.categoryName || 'misc';
        
        // GzCTF can have different point calculation methods
        const points = challenge.originalScore || 
                      challenge.minScore || 
                      challenge.points || 
                      challenge.score || 
                      challenge.value || 
                      challenge.baseScore || 0;
        
        const solves = challenge.acceptedCount || 
                      challenge.solvedCount || 
                      challenge.solved || 
                      challenge.solves || 
                      challenge.submissionCount || 0;
        
        const solved = challenge.isSolved || 
                      challenge.solved_by_me || 
                      challenge.solved || 
                      challenge.status === 'solved' ||
                      challenge.isAccepted || false;
        
        // Tags can be in different formats
        let tags: string[] = [];
        if (challenge.tags && Array.isArray(challenge.tags)) {
            tags = challenge.tags.map((tag: any) => 
                typeof tag === 'string' ? tag : (tag.name || tag.value || String(tag))
            );
        } else if (challenge.hints && Array.isArray(challenge.hints)) {
            tags = challenge.hints;
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
