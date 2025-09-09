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

const user = {
    username: process.env.USERNAME || "admin",
    password: process.env.PASSWORD || "password"
};

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

app.get("/", async (_, res) => {
    const sanitizedEvents = await getSanitizeEvents()
    res.render("event-list", { events: sanitizedEvents });
});

app.get("/login", (req, res) => {
    const error = req.flash('error');
    res.render('login', { error });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (username === user.username && password === user.password) {
        (req as AuthenticatedRequest).session.user = username;
        res.redirect('/admin/events');
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
