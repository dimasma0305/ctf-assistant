import type { RequestHandler } from "express";

interface RateLimitOptions {
    windowMs: number;
    max: number;
    namespace: string;
    maxTrackedClients?: number;
}

interface Bucket {
    count: number;
    resetAt: number;
}

function positiveInteger(value: number, fallback: number): number {
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * Small, bounded per-process limiter. This deployment runs one API replica;
 * move the same policy to Redis/Traefik before horizontally scaling it.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
    const windowMs = positiveInteger(options.windowMs, 60_000);
    const max = positiveInteger(options.max, 60);
    const maxTrackedClients = positiveInteger(options.maxTrackedClients ?? 10_000, 10_000);
    const buckets = new Map<string, Bucket>();

    const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of buckets) {
            if (bucket.resetAt <= now) buckets.delete(key);
        }
    }, Math.min(windowMs, 60_000));
    cleanup.unref?.();

    return (req, res, next) => {
        const now = Date.now();
        const client = req.ip || req.socket.remoteAddress || "unknown";
        const key = `${options.namespace}:${client}`;
        let bucket = buckets.get(key);

        if (!bucket || bucket.resetAt <= now) {
            if (!bucket && buckets.size >= maxTrackedClients) {
                const oldest = buckets.keys().next().value as string | undefined;
                if (oldest) buckets.delete(oldest);
            }
            bucket = { count: 0, resetAt: now + windowMs };
        } else {
            buckets.delete(key);
        }

        bucket.count++;
        buckets.set(key, bucket);

        const remaining = Math.max(0, max - bucket.count);
        const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        res.set("RateLimit-Limit", String(max));
        res.set("RateLimit-Remaining", String(remaining));
        res.set("RateLimit-Reset", String(resetSeconds));

        if (bucket.count > max) {
            res.set("Retry-After", String(resetSeconds));
            res.status(429).json({ error: "Too many requests", retryAfterSeconds: resetSeconds });
            return;
        }

        next();
    };
}
