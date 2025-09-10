import express from "express";
import client from "./client";
import { MyClient } from "./Model/client";
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { EventModel, solveModel } from "./Database/connect";
import session from "express-session";
import flash from "connect-flash";
import { AuthenticatedRequest, reqToForm, sanitizeEvents as getSanitizeEvents, updateOrDeleteEvents } from "./Server/utils";
import admin from "./Server/routers/admin";
import { eventSchema } from "./Database/eventSchema";

client.guilds.fetch();

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
app.use(express.static('static')); // Serve static files
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
    res.render('pages/auth/login', { error });
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
            return res.render('pages/ctf/event-form', {
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
    res.render('pages/dashboard', { user });
});

// Data management route
app.get("/data", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).session.user;
    res.render('pages/ctf/data', { user });
});

// Settings route
app.get("/settings", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).session.user;
    res.render('pages/settings', { user });
});

// Profile route
app.get("/profile", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).session.user;
    res.render('pages/profile', { user });
});

// Logout route
app.get("/logout", (req, res) => {
    (req as AuthenticatedRequest).session.destroy(() => {
        res.redirect('/login');
    });
});

// API Routes for dashboard data
app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
        const totalEvents = await EventModel.countDocuments();
        const totalSolves = await solveModel.countDocuments();
        
        // Calculate active events (events that are currently running)
        const now = new Date();
        const events = await EventModel.find();
        const activeEvents = events.filter(event => {
            const timeline = (event as any).timelines?.[0];
            if (!timeline) return false;
            const start = timeline.startTime;
            const end = timeline.endTime;
            return start && end && new Date(start) <= now && new Date(end) >= now;
        }).length;
        
        // Calculate team members (unique users from solves)
        const uniqueUsers = await solveModel.distinct('users');
        const teamMembers = uniqueUsers.length;
        
        const stats = {
            totalEvents,
            totalSolves,
            activeEvents,
            teamMembers
        };
        
        res.json(stats);
    } catch (error) {
        console.error('❌ Failed to fetch dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

app.get("/api/dashboard/solves-chart", requireAuth, async (req, res) => {
    try {
        // Chart data for last 7 days (solve counts per day)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentSolves = await solveModel.find({
            createdAt: { $gte: sevenDaysAgo }
        } as any).lean();
        
        const labels = [];
        const values = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);
            
            const solveCount = recentSolves.filter(solve => {
                const solveDate = new Date((solve as any).createdAt || date);
                return solveDate >= date && solveDate < nextDate;
            }).length;
            
            labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
            values.push(solveCount);
        }
        
        res.json({ labels, values });
    } catch (error) {
        console.error('❌ Failed to fetch solves chart data:', error);
        res.status(500).json({ error: 'Failed to fetch solves chart data' });
    }
});

app.get("/api/dashboard/category-chart", requireAuth, async (req, res) => {
    try {
        // Get challenge categories from solves (this is a mock implementation)
        // In a real system, you'd have categories stored with challenges
        const solves = await solveModel.find().lean();
        
        // Extract categories from challenge names (heuristic approach)
        const categoryMap = new Map();
        solves.forEach(solve => {
            // Try to extract category from challenge name (common patterns)
            const challengeName = (solve.challenge || '').toLowerCase();
            let category = 'Misc';
            
            if (challengeName.includes('web') || challengeName.includes('http')) category = 'Web';
            else if (challengeName.includes('pwn') || challengeName.includes('buffer')) category = 'Pwn';
            else if (challengeName.includes('crypto') || challengeName.includes('cipher')) category = 'Crypto';
            else if (challengeName.includes('reverse') || challengeName.includes('rev')) category = 'Reverse';
            else if (challengeName.includes('forensic') || challengeName.includes('steg')) category = 'Forensics';
            else if (challengeName.includes('osint') || challengeName.includes('recon')) category = 'OSINT';
            
            categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
        });
        
        const labels = Array.from(categoryMap.keys());
        const values = Array.from(categoryMap.values());
        
        res.json({ labels, values });
    } catch (error) {
        console.error('❌ Failed to fetch category chart data:', error);
        res.status(500).json({ error: 'Failed to fetch category chart data' });
    }
});

app.get("/api/dashboard/recent-events", requireAuth, async (req, res) => {
    try {
        const events = await EventModel.find().sort({ createdAt: -1 }).limit(10).lean();
        
        const recentEvents = events.map(event => {
            const firstTimeline = (event as any).timelines?.[0];
            const startTime = firstTimeline?.startTime;
            const endTime = firstTimeline?.endTime;
            const now = new Date();
            
            let status = 'upcoming';
            if (startTime && endTime) {
                if (new Date() < new Date(startTime)) {
                    status = 'upcoming';
                } else if (new Date() > new Date(endTime)) {
                    status = 'completed';
                } else {
                    status = 'active';
                }
            }
            
            return {
                id: event._id,
                title: event.title,
                organizer: (event as any).organizer || 'Unknown',
                startTime: startTime || new Date(),
                status
            };
        });
        
        res.json(recentEvents);
    } catch (error) {
        console.error('❌ Failed to fetch recent events:', error);
        res.status(500).json({ error: 'Failed to fetch recent events' });
    }
});

app.get("/api/dashboard/latest-solves", requireAuth, async (req, res) => {
    try {
        const solves = await solveModel.find().sort({ createdAt: -1 }).limit(10).lean();
        
        const latestSolves = solves.map(solve => {
            // Try to extract category from challenge name (heuristic approach)
            const challengeName = (solve.challenge || '').toLowerCase();
            let category = 'Misc';
            
            if (challengeName.includes('web') || challengeName.includes('http')) category = 'Web';
            else if (challengeName.includes('pwn') || challengeName.includes('buffer')) category = 'Pwn';
            else if (challengeName.includes('crypto') || challengeName.includes('cipher')) category = 'Crypto';
            else if (challengeName.includes('reverse') || challengeName.includes('rev')) category = 'Reverse';
            else if (challengeName.includes('forensic') || challengeName.includes('steg')) category = 'Forensics';
            else if (challengeName.includes('osint') || challengeName.includes('recon')) category = 'OSINT';
            
            return {
                id: solve._id,
                challengeName: solve.challenge,
                category: category,
                points: 100, // Mock points value since we don't store points
                timestamp: (solve as any).createdAt || new Date(),
                users: solve.users,
                ctf_id: solve.ctf_id
            };
        });
        
        res.json(latestSolves);
    } catch (error) {
        console.error('❌ Failed to fetch latest solves:', error);
        res.status(500).json({ error: 'Failed to fetch latest solves' });
    }
});

// API route for CTF events data
app.get("/api/ctf-events", requireAuth, async (req, res) => {
    try {
        const events = await EventModel.find().sort({ createdAt: -1 });
        
        // Get solve counts for each event
        const eventSolveCounts = await solveModel.aggregate([
            { $group: { _id: '$ctf_id', count: { $sum: 1 } } }
        ]);
        const solveCountMap = new Map(eventSolveCounts.map(item => [item._id, item.count]));
        
        const sanitizedEvents = events.map(event => {
            // Get the first timeline entry for dates (assuming main event timeline)
            const firstTimeline = (event as any).timelines?.[0];
            const startTime = firstTimeline?.startTime;
            const endTime = firstTimeline?.endTime;
            
            // Find CTFtime ID from the event data or URL
            const ctftimeId = (event as any).url ? 
                (event as any).url.match(/\/event\/(\d+)\//)?.[1] || 
                (event as any).ctftime_id || 
                event._id.toString() : 
                event._id.toString();
            
            return {
                id: event._id,
                ctftime_id: ctftimeId,
                title: event.title,
                organizer: (event as any).organizer || 'Unknown',
                start_date: startTime || new Date(),
                finish_date: endTime || new Date(),
                status: !startTime ? 'upcoming' : 
                       new Date() < new Date(startTime) ? 'upcoming' : 
                       new Date() > new Date(endTime || startTime) ? 'completed' : 'active',
                solves: solveCountMap.get(ctftimeId) || 0,
                url: (event as any).url || '',
                description: (event as any).description || ''
            };
        });
        
        console.log(`📊 Found ${events.length} events with solve data`);
        res.json(sanitizedEvents);
    } catch (error) {
        console.error('❌ Failed to fetch events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// Debug API route to check raw events in database
app.get("/api/debug/events", requireAuth, async (req, res) => {
    try {
        const events = await EventModel.find().lean();
        res.json({
            count: events.length,
            events: events.map(event => ({
                _id: event._id,
                title: event.title,
                organizer: event.organizer,
                timelines: event.timelines
            }))
        });
    } catch (error) {
        console.error('❌ Failed to fetch debug events:', error);
        res.status(500).json({ error: 'Failed to fetch debug events' });
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

// API route for individual event details
app.get("/api/events/:id", requireAuth, async (req, res): Promise<void> => {
    try {
        const event = await EventModel.findById(req.params.id);
        if (!event) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }
        
        const firstTimeline = (event as any).timelines?.[0];
        const eventData = {
            id: event._id,
            title: event.title,
            organizer: (event as any).organizer || 'Unknown',
            description: (event as any).description || '',
            url: (event as any).url || '',
            start_date: firstTimeline?.startTime || new Date(),
            finish_date: firstTimeline?.endTime || new Date(),
            format: (event as any).format || [],
            logo: (event as any).logo || ''
        };
        
        res.json(eventData);
    } catch (error) {
        console.error('❌ Failed to fetch event details:', error);
        res.status(500).json({ error: 'Failed to fetch event details' });
    }
});

// API route for event solves
app.get("/api/events/:id/solves", requireAuth, async (req, res): Promise<void> => {
    try {
        const event = await EventModel.findById(req.params.id);
        if (!event) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }
        
        // Find CTFtime ID from the event
        const ctftimeId = (event as any).url ? 
            (event as any).url.match(/\/event\/(\d+)\//)?.[1] || 
            (event as any).ctftime_id || 
            event._id.toString() : 
            event._id.toString();
            
        const solves = await solveModel.find({ ctf_id: ctftimeId }).sort({ createdAt: -1 });
        
        const formattedSolves = solves.map(solve => ({
            id: solve._id,
            challenge: solve.challenge,
            users: solve.users,
            createdAt: (solve as any).createdAt || new Date(),
            ctf_id: solve.ctf_id
        }));
        
        res.json(formattedSolves);
    } catch (error) {
        console.error('❌ Failed to fetch event solves:', error);
        res.status(500).json({ error: 'Failed to fetch event solves' });
    }
});

// API route for all solves
app.get("/api/solves", requireAuth, async (req, res): Promise<void> => {
    try {
        const { ctf_id, challenge, user, limit = 50 } = req.query;
        
        // Build filter query
        let filter: any = {};
        if (ctf_id) filter.ctf_id = ctf_id;
        if (challenge) filter.challenge = new RegExp(challenge as string, 'i');
        if (user) filter.users = { $in: [user] };
        
        const solves = await solveModel.find(filter)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit as string))
            .lean();
            
        res.json(solves);
    } catch (error) {
        console.error('❌ Failed to fetch solves:', error);
        res.status(500).json({ error: 'Failed to fetch solves' });
    }
});

// API route for creating solve (for web interface)
app.post("/api/solves", requireAuth, async (req, res): Promise<void> => {
    try {
        const { challenge, ctf_id, users } = req.body;
        
        if (!challenge || !ctf_id || !users || !Array.isArray(users)) {
            res.status(400).json({ error: 'Missing required fields: challenge, ctf_id, users' });
            return;
        }
        
        const existingSolve = await solveModel.findOne({ challenge, ctf_id });
        if (existingSolve) {
            existingSolve.users = users;
            await existingSolve.save();
            res.json({ success: true, solve: existingSolve, updated: true });
        } else {
            const newSolve = new solveModel({ challenge, ctf_id, users });
            await newSolve.save();
            res.json({ success: true, solve: newSolve, created: true });
        }
    } catch (error) {
        console.error('❌ Failed to create solve:', error);
        res.status(500).json({ error: 'Failed to create solve' });
    }
});

// API route for deleting solve
app.delete("/api/solves/:id", requireAuth, async (req, res): Promise<void> => {
    try {
        const solve = await solveModel.findByIdAndDelete(req.params.id);
        if (!solve) {
            res.status(404).json({ error: 'Solve not found' });
            return;
        }
        res.json({ success: true, message: 'Solve deleted successfully' });
    } catch (error) {
        console.error('❌ Failed to delete solve:', error);
        res.status(500).json({ error: 'Failed to delete solve' });
    }
});

// API route for exporting data
app.post("/api/export-data", requireAuth, async (req, res) => {
    try {
        const events = await EventModel.find();
        const solves = await solveModel.find();
        
        const exportData = {
            exportDate: new Date().toISOString(),
            events: events,
            solves: solves,
            statistics: {
                totalEvents: events.length,
                totalSolves: solves.length,
                uniqueCtfIds: [...new Set(solves.map(s => s.ctf_id))].length,
                uniqueUsers: [...new Set(solves.flatMap(s => s.users))].length
            }
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="ctf-data.json"');
        res.json(exportData);
    } catch (error) {
        console.error('❌ Failed to export data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Session scheduler status endpoint  
app.get("/session-status", async (req, res) => {
    // Check if request wants JSON (API call) or HTML (web page)
    const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
    
    if (acceptsJson) {
        // Return JSON for API calls
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
            return;
        } catch (error) {
            console.error('Error getting session status:', error);
            res.status(500).json({ 
                error: 'Internal server error',
                timestamp: new Date().toISOString()
            });
            return;
        }
    }
    
    // Return HTML page for browser visits
    try {
        res.render('pages/session-status');
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
