import express from "express";
import client from "./client";
import bodyParser from 'body-parser';
import { EventModel } from "./Database/connect";
import session from "express-session";
import flash from "connect-flash";
import { AuthenticatedRequest, reqToForm, updateEvent } from "./Server/utils";
import admin from "./Server/routers/admin";

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
    const events = await EventModel.find().sort({ "timelines.startTime": 1 }).lean().exec();

    const sanitizedEvents = events.map(event => {
        const { _id, ...rest } = event;

        const sanitizedTimelines = rest.timelines.map(timeline => {
            const { _id, discordEventId, ...timelineRest } = timeline;
            return timelineRest;
        });
        return { ...rest, timelines: sanitizedTimelines };
    });

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
            return res.render('event-form', { event, isAdmin: false });
        }
    }
    res.send("ok");
});

app.post("/event/:id", async (req, res) => {
    const id = req.params.id;
    const form = await reqToForm(req);
    if (form){
        await updateEvent(id, form);
    }
    return res.redirect("/event/" + id);
});

app.listen(3000, "0.0.0.0", () => {
    console.log("serve @ http://localhost:3000");
});
