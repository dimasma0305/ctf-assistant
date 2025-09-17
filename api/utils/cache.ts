/**
 * Memory Cache System
 * 
 * A simple in-memory cache implementation with TTL support and performance tracking.
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number; // Time to live in milliseconds
}

export class MemoryCache {
    private cache = new Map<string, CacheEntry<any>>();
    private defaultTTL = 10 * 60 * 1000; // 10 minutes default
    private hitCount = 0;
    private missCount = 0;

    /**
     * Store data in cache with optional TTL
     */
    set<T>(key: string, data: T, ttl?: number): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttl || this.defaultTTL
        });
    }

    /**
     * Retrieve data from cache
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Check if key exists in cache (non-expired)
     */
    has(key: string): boolean {
        return this.get(key) !== null;
    }

    /**
     * Delete a cache entry
     */
    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                expiredEntries++;
            } else {
                validEntries++;
            }
        }

        return {
            totalEntries: this.cache.size,
            validEntries,
            expiredEntries,
            hitRate: this.hitCount / (this.hitCount + this.missCount) || 0
        };
    }

    /**
     * Get data from cache with performance tracking
     */
    getCached<T>(key: string): T | null {
        const result = this.get<T>(key);
        if (result !== null) {
            this.hitCount++;
        } else {
            this.missCount++;
        }
        return result;
    }

    /**
     * Remove expired entries
     */
    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Start automatic cleanup process
     */
    startCleanupProcess(intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout {
        return setInterval(() => {
            this.cleanup();
        }, intervalMs);
    }
}

// Create and export global cache instance
export const cache = new MemoryCache();

// Start automatic cleanup
cache.startCleanupProcess();
