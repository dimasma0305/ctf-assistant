import express, { Response, Router } from "express";
import { EventModel } from "../../Database/connect";
import { AuthenticatedRequest, checkAuth, deleteEvent, reqToForm, updateEvent } from "../utils";

const router: Router = express.Router()

router.get("/events", checkAuth, async (req, res) => {
    const events = await EventModel.find().exec();
    res.render('admin-events', { events });
});

router.get("/event/new", checkAuth, async(req, res) => {
    const event  = new EventModel()
    const id = (await event.save()).id
    return res.redirect("/admin/event/"+id)
});

router.get("/event/:id", checkAuth, async (req, res) => {
    const id = req.params.id;
    if (id) {
        const event = await EventModel.findById(id).exec().catch();
        if (event) {
            return res.render('event-form', { event, isAdmin: true });
        }
    }
    res.send("ok")
});

router.post("/event/:id?", checkAuth, async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;
    const form = await reqToForm(req);
    if (form) {
        if (id) {
            await updateEvent(id, form);
        } else {
            await EventModel.create(form);
        }
    }
    return res.redirect("/admin/events");
});

router.post("/event/:id/delete", checkAuth, async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;
    if (id) {
        await deleteEvent(id)
    }
    return res.redirect("/admin/events");
});

export default router
