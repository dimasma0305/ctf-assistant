import express from "express";
import client from "./client";
import bodyParser from 'body-parser';
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

app.listen(3000, "0.0.0.0", () => {
    console.log("serve @ http://localhost:3000");
});
