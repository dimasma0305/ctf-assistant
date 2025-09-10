import express, { Response, Router } from "express";
import path from "path";
import { EventModel } from "../Database/connect";
import { AuthenticatedRequest, checkAuth, deleteEvents, reqToForm, updateOrDeleteEvents } from "../utils";

const router: Router = express.Router()

router.get("/events", checkAuth, async (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'admin-events.html'));
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
            // For now, redirect to admin events list - we can create a separate admin event form page later
            return res.redirect('/admin/events');
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
