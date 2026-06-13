import express from "express";
import cors from "cors";
import compression from "compression";
import bodyParser from 'body-parser';
import client from "../src/client";
import { MyClient } from "../src/Model/client";
import { getCachedUserScores } from './services/dataService';

// Import route handlers
import scoreboardRoutes from './routes/scoreboard';
import profileRoutes from './routes/profiles';
import ctfRoutes from './routes/ctfs';
import certificateRoutes from './routes/certificates';

const app = express();

/**
 * Gzip responses — scoreboard/CTF JSON (repeated metadata + per-entry arrays)
 * compresses ~5-10x. Registered first so it wraps all route responses.
 */
app.use(compression());

/**
 * CORS Configuration
 */
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

/**
 * Middleware Configuration
 */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public', { index: 'index.html' }));

/**
 * Health Check Endpoint
 */
app.get("/health", (req, res) => {
    const myClient = client as MyClient;
    const isHealthy = client.isReady() || (myClient.sessionScheduler?.isWaitingForSessionReset() === true);
    
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        bot: {
            ready: client.isReady(),
            waitingForSessionReset: myClient.sessionScheduler?.isWaitingForSessionReset() || false
        },
        timestamp: new Date().toISOString()
    });
});

/**
 * Cache-Control for GET reads. Lets browsers (and any CDN/proxy) serve a result
 * for a few seconds and revalidate in the background instead of recomputing on
 * every navigation/tab-switch. Data here is already cached server-side and only
 * changes on new solves, so short TTLs are safe. Express's default (weak) ETag
 * still yields cheap 304s; we deliberately don't touch it.
 */
app.use((req, res, next) => {
    if (req.method === 'GET') {
        if (req.path.startsWith('/api/profile') || req.path.startsWith('/api/certificates')) {
            // User-scoped — keep private so shared caches don't store it.
            res.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
        } else if (req.path.startsWith('/api/scoreboard') || req.path.startsWith('/api/ctfs')) {
            res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
        }
    }
    next();
});

/**
 * Route Handlers
 */
app.use("/api/scoreboard", scoreboardRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/ctfs", ctfRoutes);
app.use("/api/certificates", certificateRoutes);

// Ensure client guilds are fetched (only after client is ready)
// This will be called from the client ready event handler

/**
 * Start Server
 */
app.listen(3000, "0.0.0.0", async () => {
    console.log("🌐 Web server running @ http://localhost:3000");
    
    // Optional: Warm up cache on startup for better initial response times
    if (process.env.WARM_CACHE_ON_STARTUP === 'true') {
        console.log("🔥 Starting cache warm-up...");
        try {
            await getCachedUserScores(); // Warm up global scores
            console.log("🔥 Cache warm-up completed successfully");
        } catch (error: any) {
            console.log("⚠️  Cache warm-up failed:", error.message);
        }
    }
});
