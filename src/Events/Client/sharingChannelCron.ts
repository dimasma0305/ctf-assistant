import cron from "node-cron";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import { cleanSharingChannels } from "../../Services/Moderation/sharingChannelCleaner";

let cronInit = false;

/**
 * Sharing-channel cleanup cron — runs every 30 minutes (Asia/Jakarta TZ).
 *
 * Admins designate sharing channels by inserting into
 * `db.sharingchannelconfigs`. Each pass scans configured channels for chat
 * messages (no attachment / embed / URL / long-text / pinned status) and
 * bulk-deletes them. Newly-posted messages are exempt via a `gracePeriodMin`
 * (default 30 min) so users have time to post a discussion burst before
 * pruning kicks in.
 */
export const event: Event = {
    name: "ready",
    once: true,
    async execute(client: MyClient) {
        if (cronInit) return;
        cronInit = true;

        console.log('🧹 Loading sharing-channel cleanup cron...');

        // Every 30 minutes on the half-hour mark in Asia/Jakarta.
        cron.schedule('*/30 * * * *', async () => {
            try {
                await cleanSharingChannels(client);
            } catch (error) {
                console.error('[SharingChannelCron] tick failed:', error);
            }
        }, { scheduled: true, timezone: 'Asia/Jakarta' });

        // Catch-up run shortly after boot so we don't have to wait up to 30
        // minutes for the first sweep after a deploy.
        setTimeout(() => {
            cleanSharingChannels(client).catch((error) => {
                console.error('[SharingChannelCron] startup sweep failed:', error);
            });
        }, 8000);

        console.log('✅ Sharing-channel cleanup cron loaded (every 30 min Jakarta)');
    },
};
