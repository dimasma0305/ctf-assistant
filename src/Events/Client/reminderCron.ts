import cron from "node-cron";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import { deliverDueReminders } from "../../Services/AI/reminders";

let reminderCronInitialized = false;

export const event: Event = {
    name: "ready",
    once: true,
    async execute(client: MyClient) {
        if (reminderCronInitialized) return;
        reminderCronInitialized = true;

        console.log('⏰ Loading reminder cron job...');

        // Once-a-minute scan for due reminders. Cron timezone is Asia/Jakarta
        // to match the rest of the bot — but `delivered=false AND dueAt<=now`
        // is timezone-agnostic since dueAt is stored UTC, so the cron's
        // schedule TZ only affects *when this scheduler ticks*, not the
        // semantics of the comparison.
        cron.schedule('* * * * *', async () => {
            try {
                await deliverDueReminders(client);
            } catch (error) {
                console.error('[ReminderCron] tick failed:', error);
            }
        }, { scheduled: true, timezone: 'Asia/Jakarta' });

        // Also fire once a few seconds after boot to catch anything that came
        // due while the bot was offline.
        setTimeout(() => {
            deliverDueReminders(client).catch((error) => {
                console.error('[ReminderCron] startup catch-up failed:', error);
            });
        }, 5000);

        console.log('✅ Reminder cron job loaded');
    },
};
