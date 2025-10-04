// Generic challenge interface for different platforms
export interface ParsedChallenge {
    id: string | number;
    name: string;
    category: string;
    points: number;
    solves: number;
    solved: boolean;
    description?: string;
    tags?: string[];
}

// Helper function to validate and sanitize parsed challenge data
export function validateAndSanitizeChallenge(challenge: any, index: number): ParsedChallenge {
    // Ensure required fields have valid values
    const id = challenge.id || index + 1;
    const name = String(challenge.name || `Challenge ${index + 1}`).trim();
    const category = String(challenge.category || 'misc').toLowerCase().trim();
    const points = Math.max(0, parseInt(String(challenge.points || 0)) || 0);
    const solves = Math.max(0, parseInt(String(challenge.solves || 0)) || 0);
    const solved = Boolean(challenge.solved);
    const description = challenge.description ? String(challenge.description).trim() : undefined;
    const tags = Array.isArray(challenge.tags) ? challenge.tags.filter((tag: any) => tag && String(tag).trim()) : [];
    
    // Validate that name is not empty
    if (!name || name === `Challenge ${index + 1}` && !challenge.name) {
        throw new Error(`Challenge at index ${index} has no valid name`);
    }
    
    return {
        id,
        name,
        category,
        points,
        solves,
        solved,
        description,
        tags
    };
}
