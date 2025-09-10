import express from "express";
import client from "./client";
import { MyClient } from "./Model/client";
import bodyParser from 'body-parser';
import crypto from 'crypto';
import session from "express-session";
import flash from "connect-flash";

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
app.use(express.static('public')); // Serve all static files and HTML from public
app.use(session({
    secret: process.env.SECRET || crypto.randomUUID(),
    resave: false,
    saveUninitialized: true
}));
app.use(flash());

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
