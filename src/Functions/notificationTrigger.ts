import { BaseGuildTextChannel, EmbedBuilder, Client } from "discord.js";
import { GuildChannelModel } from "../Database/connect";

/**
 * Trigger a notification to all channels subscribed to a specific event type
 * @param client - Discord client instance
 * @param eventType - Type of event to trigger (weekly_reminder, ctf_announcement, solve_update, event_created)
 * @param messageContent - Plain text message to send (optional)
 * @param embeds - Array of embeds to send (optional)
 * @returns Number of channels successfully notified
 */
export async function triggerNotification(
    client: Client,
    eventType: string,
    messageContent?: string,
    embeds?: EmbedBuilder[]
): Promise<number> {
    try {
        console.log(`🔔 Triggering notification for event type: ${eventType}`);
        
        // Fetch all active channels subscribed to this event type
        const registeredChannels = await GuildChannelModel.find({
            is_active: true,
            event_types: eventType
        });

        if (registeredChannels.length === 0) {
            console.log(`📭 No channels subscribed to ${eventType}`);
            return 0;
        }

        console.log(`📢 Found ${registeredChannels.length} channel(s) subscribed to ${eventType}`);

        let successCount = 0;

        // Send notifications to all subscribed channels
        for (const registration of registeredChannels) {
            try {
                // Fetch the guild and channel
                const guild = await client.guilds.fetch(registration.guild_id).catch(() => null);
                if (!guild) {
                    console.log(`⚠️ Guild not found: ${registration.guild_name} (${registration.guild_id})`);
                    continue;
                }

                const channel = await guild.channels.fetch(registration.channel_id).catch(() => null);
                if (!channel || !(channel instanceof BaseGuildTextChannel)) {
                    console.log(`⚠️ Channel not found: ${registration.channel_name} in ${registration.guild_name}`);
                    continue;
                }

                // Send the message
                if (messageContent) {
                    await channel.send(messageContent);
                }

                // Send embeds if provided
                if (embeds && embeds.length > 0) {
                    await channel.send({ embeds });
                }

                // Update tracking information
                registration.last_notification_sent = new Date();
                registration.last_event_type_triggered = eventType;
                registration.notification_count = (registration.notification_count || 0) + 1;
                registration.updated_at = new Date();
                await registration.save();

                successCount++;
                console.log(`✅ Sent ${eventType} notification to: ${guild.name} / ${channel.name} (#${registration.notification_count})`);
            } catch (error) {
                console.error(`❌ Error sending ${eventType} to ${registration.guild_name} / ${registration.channel_name}:`, error);
            }
        }

        console.log(`✅ Notification trigger completed: ${successCount}/${registeredChannels.length} channels notified`);
        return successCount;
    } catch (error) {
        console.error(`❌ Error in triggerNotification for ${eventType}:`, error);
        return 0;
    }
}

/**
 * Helper function to send CTF announcement notifications
 * @param client - Discord client instance
 * @param ctfName - Name of the CTF
 * @param ctfUrl - URL to the CTF
 * @param startDate - Start date of the CTF
 * @param embed - Optional embed with CTF details
 */
export async function sendCTFAnnouncement(
    client: Client,
    ctfName: string,
    ctfUrl: string,
    startDate: Date,
    embed?: EmbedBuilder
): Promise<number> {
    const message = `🎯 **New CTF Announced!**\n\n` +
                   `**${ctfName}**\n` +
                   `📅 Starts: ${startDate.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}\n` +
                   `🔗 ${ctfUrl}`;

    const embedsToSend = embed ? [embed] : undefined;
    return await triggerNotification(client, "ctf_announcement", message, embedsToSend);
}

/**
 * Helper function to send solve update notifications
 * @param client - Discord client instance
 * @param challengeName - Name of the challenge
 * @param ctfName - Name of the CTF
 * @param solverNames - Names of the solvers
 * @param points - Points earned
 */
export async function sendSolveUpdate(
    client: Client,
    challengeName: string,
    ctfName: string,
    solverNames: string[],
    points: number
): Promise<number> {
    const solversText = solverNames.length > 3 
        ? `${solverNames.slice(0, 3).join(', ')} and ${solverNames.length - 3} others`
        : solverNames.join(', ');

    const message = `🎉 **Challenge Solved!**\n\n` +
                   `**${challengeName}** in *${ctfName}*\n` +
                   `👥 Solved by: ${solversText}\n` +
                   `🏆 Points: ${points}`;

    return await triggerNotification(client, "solve_update", message);
}

/**
 * Helper function to send event created notifications
 * @param client - Discord client instance
 * @param eventName - Name of the event
 * @param eventDescription - Description of the event
 * @param embed - Optional embed with event details
 */
export async function sendEventCreated(
    client: Client,
    eventName: string,
    eventDescription: string,
    embed?: EmbedBuilder
): Promise<number> {
    const message = `📅 **New Event Created!**\n\n` +
                   `**${eventName}**\n` +
                   `${eventDescription}`;

    const embedsToSend = embed ? [embed] : undefined;
    return await triggerNotification(client, "event_created", message, embedsToSend);
}








