import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { Command } from "../../../Model/command";
const { ManageChannels } = PermissionFlagsBits;

/**
 * /sharing — admin CRUD for sharing-channel configurations.
 *
 * A "sharing channel" is auto-cleaned every 30 min by the bot: messages that
 * aren't sharing-shaped (no attachment/embed/URL/long-text/pinned) get pruned.
 * See `src/Services/Moderation/sharingChannelCleaner.ts` for the rule details.
 *
 * Gated by Discord's ManageChannels permission since this lives in a channel-
 * management space — admins who can configure channels can also configure
 * which ones get cleaned.
 */
export const command: Command = {
    data: new SlashCommandBuilder()
        .setName("sharing")
        .setDescription("Manage sharing-channel cleanup configs (add/remove/list/edit)")
        .setDefaultMemberPermissions(ManageChannels),
};
