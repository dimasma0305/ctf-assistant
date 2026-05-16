import cron from "node-cron";
import { ActivityType } from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import { loadBotState, distillBotState, distillDiary } from "../../Services/AI/botState";

let botStateCronInitialized = false;

async function refreshPresence(client: MyClient) {
    try {
        const state = await loadBotState();
        const text = state.activity?.trim() || state.mood?.trim() || 'lagi nongkrong';
        // Custom activity type — shows up as "<bot> [text]" in member list.
        client.user?.setPresence({
            activities: [{ name: text.slice(0, 128), type: ActivityType.Custom, state: text.slice(0, 128) }],
            status: state.energy < 25 ? 'idle' : 'online',
        });
    } catch (error) {
        console.error('[BotStateCron] failed to refresh presence:', error);
    }
}

export const event: Event = {
    name: "ready",
    once: true,
    async execute(client: MyClient) {
        if (botStateCronInitialized) return;
        botStateCronInitialized = true;

        console.log('🧠 Loading bot-state cron jobs...');

        // Initial state distillation a few seconds after startup so the first
        // chat turn already has fresh state instead of stale-from-disk values.
        setTimeout(async () => {
            await distillBotState();
            await refreshPresence(client);
        }, 8000);

        // State refresh every 30 minutes — updates mood/energy/focus/activity
        // based on recent server activity + circadian time-of-day.
        cron.schedule('*/30 * * * *', async () => {
            await distillBotState();
            await refreshPresence(client);
        }, { scheduled: true, timezone: 'Asia/Jakarta' });

        // Presence-only refresh every 5 minutes so the visible status feels
        // alive even between full state distillations (caches don't go stale).
        cron.schedule('*/5 * * * *', async () => {
            await refreshPresence(client);
        }, { scheduled: true, timezone: 'Asia/Jakarta' });

        // Daily diary consolidation at 3 AM Jakarta time.
        cron.schedule('0 3 * * *', async () => {
            await distillDiary();
        }, { scheduled: true, timezone: 'Asia/Jakarta' });

        console.log('✅ Bot-state cron jobs loaded');
    },
};
