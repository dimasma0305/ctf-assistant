import express from "express";
import client from "./client";
import { MyClient } from "./Model/client";
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { EventModel } from "./Database/connect";
import session from "express-session";
import flash from "connect-flash";
import { AuthenticatedRequest, reqToForm, sanitizeEvents as getSanitizeEvents, updateOrDeleteEvents } from "./Server/utils";
import admin from "./Server/routers/admin";
import { eventSchema } from "./Database/eventSchema";

client.guilds.fetch();

// Parse username:password from environment variable
// Format: CREDENTIALS="username:password"
// Example: CREDENTIALS="admin:mySecurePassword123"
const parseCredentials = (credentials: string) => {
    const parts = credentials.split(':');
    
    if (parts.length !== 2) {
        console.warn('⚠️  CREDENTIALS format should be "username:password". Using defaults.');
        return {
            username: "admin",
            password: "password"
        };
    }
    
    const [username, password] = parts;
    
    if (!username || !password) {
        console.warn('⚠️  Username or password is empty in CREDENTIALS. Using defaults.');
        return {
            username: username || "admin",
            password: password || "password"
        };
    }
    
    return { username, password };
};

const user = parseCredentials(process.env.CREDENTIALS || "admin:password");
console.log(`🔐 Web panel credentials: ${user.username}:${'*'.repeat(user.password.length)}`);

client.on('messageCreate', _ => {
    return;
});

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SECRET || crypto.randomUUID(),
    resave: false,
    saveUninitialized: true
}));
app.use(flash());
app.use("/admin", admin);

app.set('view engine', 'ejs');
app.set('views', './views');

app.get("/", async (req, res) => {
    // Check if user is logged in, redirect to dashboard, otherwise show login
    if ((req as AuthenticatedRequest).session.user) {
        return res.redirect('/dashboard');
    }
    res.redirect('/login');
});

app.get("/login", (req, res) => {
    const error = req.flash('error');
    res.render('login', { error });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (username === user.username && password === user.password) {
        (req as AuthenticatedRequest).session.user = username;
        res.redirect('/dashboard');
    } else {
        req.flash('error', 'Invalid username or password.');
        res.redirect('/login');
    }
});

app.get("/event/:id", async (req, res) => {
    const id = req.params.id;
    if (id) {
        const event = await EventModel.findById(id).exec().catch();
        if (event) {
            return res.render('event-form', {
                event,
                eventSchema,
                isAdmin: false
            });
        }
    }
    res.send("ok");
});

app.post("/event/:id", async (req, res) => {
    await updateOrDeleteEvents(req);
    return res.redirect("/event/" + req.params.id);
});

// Middleware to check authentication
function requireAuth(req: any, res: any, next: any) {
    if ((req as AuthenticatedRequest).session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Dashboard route
app.get("/dashboard", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).session.user;
    res.render('dashboard', { user });
});

// Data management route
app.get("/data", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).session.user;
    res.render('data', { user });
});

// Settings route
app.get("/settings", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).session.user;
    res.render('settings', { user });
});

// Profile route
app.get("/profile", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).session.user;
    res.render('profile', { user });
});

// Logout route
app.get("/logout", (req, res) => {
    (req as AuthenticatedRequest).session.destroy(() => {
        res.redirect('/login');
    });
});

// API Routes for dashboard data
app.get("/api/dashboard-stats", requireAuth, async (req, res) => {
    try {
        const totalEvents = await EventModel.countDocuments();
        const myClient = client as MyClient;
        
        const stats = {
            totalEvents,
            totalSolves: 0, // TODO: Get from solveModel
            activeEvents: 0, // TODO: Calculate active events
            botOnline: client.isReady(),
            recentActivity: [], // TODO: Get recent activity
            chartData: [] // TODO: Get chart data for last 7 days
        };
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// API route for CTF events data
app.get("/api/ctf-events", requireAuth, async (req, res) => {
    try {
        const events = await EventModel.find().sort({ createdAt: -1 });
        const sanitizedEvents = events.map(event => ({
            id: event._id,
            title: event.title,
            organizer: (event as any).organizer,
            start_date: (event as any).startDate || (event as any).start,
            finish_date: (event as any).endDate || (event as any).finish,
            status: new Date() < new Date((event as any).startDate || (event as any).start) ? 'upcoming' : 
                   new Date() > new Date((event as any).endDate || (event as any).finish) ? 'completed' : 'active',
            solves: 0, // TODO: Get solve count for each event
            url: (event as any).url
        }));
        
        res.json(sanitizedEvents);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// API route for profile data
app.get("/api/profile", requireAuth, async (req, res) => {
    try {
        const user = (req as AuthenticatedRequest).session.user;
        // TODO: Get actual profile data from database
        const profileData = {
            displayName: user,
            email: '',
            bio: '',
            timezone: 'UTC',
            theme: 'light',
            notifications: {
                emailSolves: false,
                emailEvents: false,
                discordDM: false
            },
            privacy: {
                showEmail: false,
                showStats: true,
                showActivity: true
            },
            stats: {
                totalSolves: 0,
                eventsParticipated: 0,
                challengesCreated: 0,
                successRate: 0
            },
            recentActivity: []
        };
        
        res.json(profileData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile data' });
    }
});

// API route for saving settings
app.post("/api/settings", requireAuth, async (req, res) => {
    try {
        // TODO: Save settings to database
        console.log('Settings to save:', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// API route for saving profile
app.post("/api/profile", requireAuth, async (req, res) => {
    try {
        // TODO: Save profile to database
        console.log('Profile to save:', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

// API route for changing password
app.post("/api/change-password", requireAuth, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        // Verify current password
        if (currentPassword !== user.password) {
            res.status(400).json({ error: 'Current password is incorrect' });
            return;
        }
        
        // TODO: Hash the password before storing in production
        // For now, just update the in-memory user object
        user.password = newPassword;
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// API route for testing webhook
app.post("/api/test-webhook", requireAuth, async (req, res) => {
    try {
        const { webhookUrl } = req.body;
        // TODO: Implement webhook testing
        console.log('Testing webhook:', webhookUrl);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Webhook test failed' });
    }
});

// API route for exporting data
app.post("/api/export-data", requireAuth, async (req, res) => {
    try {
        const events = await EventModel.find();
        const exportData = {
            exportDate: new Date().toISOString(),
            events: events,
            // TODO: Add solve data and other relevant data
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="ctf-data.json"');
        res.json(exportData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Session scheduler status endpoint
app.get("/session-status", async (req, res) => {
    try {
        const myClient = client as MyClient;
        
        if (!myClient.sessionScheduler) {
            res.status(500).json({ 
                error: "Session scheduler not initialized",
                timestamp: new Date().toISOString()
            });
            return;
        }

        const status = myClient.sessionScheduler.getStatus();
        const sessionInfo = myClient.sessionScheduler.getSessionInfo();
        
        const response = {
            bot: {
                isReady: client.isReady(),
                status: client.isReady() ? 'online' : 'offline',
                uptime: client.uptime ? Math.floor(client.uptime / 1000) : null,
                user: client.user ? {
                    id: client.user.id,
                    username: client.user.username,
                    tag: client.user.tag
                } : null
            },
            sessionScheduler: {
                ...status,
                sessionInfo: sessionInfo ? {
                    resetTime: sessionInfo.resetTime.toISOString(),
                    remainingSessions: sessionInfo.remainingSessions,
                    totalSessions: sessionInfo.totalSessions,
                    timeUntilReset: sessionInfo.resetTime.getTime() - Date.now()
                } : null
            },
            timestamp: new Date().toISOString()
        };
        
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint with session awareness
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

app.listen(3000, "0.0.0.0", () => {
    console.log("🌐 Web server running @ http://localhost:3000");
    console.log("📊 Session status: http://localhost:3000/session-status");
    console.log("🏥 Health check: http://localhost:3000/health");
});
