import express, { Response, Router } from "express";
import { EventModel } from "../../Database/connect";
import { AuthenticatedRequest, checkAuth, deleteEvents, reqToForm, updateOrDeleteEvents } from "../utils";
import { eventSchema } from "../../Database/eventSchema";

const router: Router = express.Router()

router.get("/events", checkAuth, async (req, res) => {
    const events = await EventModel.find().exec();
    res.render('admin-events', { events });
});

router.get("/event/new", checkAuth, async (req, res) => {
    const event = new EventModel()
    const id = (await event.save()).id
    return res.redirect("/admin/event/" + id)
});

router.get("/event/:id", checkAuth, async (req, res) => {
    const id = req.params.id;
    if (id) {
        const event = await EventModel.findById(id).exec().catch();
        if (event) {
            return res.render('event-form', {
                event,
                eventSchema,
                isAdmin: true
            });
        }
    }
    res.send("ok")
});

router.post("/event/:id?", checkAuth, async (req: AuthenticatedRequest, res: Response) => {
    await updateOrDeleteEvents(req);
    return res.redirect("/admin/events");
});

router.post("/event/:id/delete", checkAuth, async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;
    if (id) {
        await deleteEvents(id)
    }
    return res.redirect("/admin/events");
});

export default router
