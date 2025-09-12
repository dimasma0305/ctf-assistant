export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    name?: string;
    content: string;
}

// AI conversation memory with TTL
interface UserMemory {
    messages: ChatMessage[];
    lastAccessed: number;
}

export const memory: Record<string, UserMemory> = {};
const ONE_HOUR = 60 * 60 * 1000;


// --- Memory Cleanup ---
function cleanupInactiveMemory() {
    const now = Date.now();
    let clearedCount = 0;
    for (const userId in memory) {
        if (now - memory[userId].lastAccessed > ONE_HOUR) {
            delete memory[userId];
            clearedCount++;
        }
    }
    if (clearedCount > 0) {
        console.log(`🧹 Cleared conversation memory for ${clearedCount} inactive user(s).`);
    }
}

// Run cleanup every 30 minutes
setInterval(cleanupInactiveMemory, ONE_HOUR / 2);
// --- End Memory Cleanup ---
