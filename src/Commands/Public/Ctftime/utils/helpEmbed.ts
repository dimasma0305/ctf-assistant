import { EmbedBuilder } from "discord.js";

/**
 * Creates a help embed with all CTFTime command information
 * @returns EmbedBuilder instance with help information
 */
export function createCTFTimeHelpEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("🏁 CTFTime Commands Help")
        .setDescription("Complete guide to all CTFTime bot commands for managing CTF events")
        .setColor(0x00AE86)
        .addFields(
            {
                name: "📋 `/ctftime current`",
                value: "**Display currently running CTFs**\n" +
                       "• Shows all CTF events that are currently active\n" +
                       "• Includes event details like format, location, weight, and notes\n" +
                       "• Displays event thumbnails and direct links to CTFTime",
                inline: false
            },
            {
                name: "🔮 `/ctftime upcoming [days]`",
                value: "**Display upcoming CTF events**\n" +
                       "• `days` (optional): Number of days to look ahead (1-100, default: 5)\n" +
                       "• Shows future CTF events with full details\n" +
                       "• Helps plan ahead for upcoming competitions",
                inline: false
            },
            {
                name: "📅 `/ctftime schedule <id> [options]`",
                value: "**Schedule a CTF event with role management**\n" +
                       "• `id` (required): CTF event ID from ctftime.org\n" +
                       "• `is_dummie` (optional): Create a test/dummy CTF event\n" +
                       "• `private` (optional): Make the CTF event private\n" +
                       "• `password` (optional): Set password for private events\n" +
                       "• Creates roles, channels, and reaction-based signup system",
                inline: false
            },
            {
                name: "🗑️ `/ctftime delete [id] [title]`",
                value: "**Delete all CTF-related Discord resources**\n" +
                       "• `id` (optional): Delete by CTF event ID\n" +
                       "• `title` (optional): Delete by CTF title\n" +
                       "• If no parameters provided, uses current channel's CTF\n" +
                       "• Removes roles, channels, and scheduled events\n" +
                       "• ⚠️ **Warning**: This action is permanent!",
                inline: false
            },
            {
                name: "📦 `/ctftime archive <id>`",
                value: "**Archive a completed CTF event**\n" +
                       "• `id` (required): CTF event ID to archive\n" +
                       "• Moves CTF data to archived state\n" +
                       "• Preserves historical data while cleaning active lists",
                inline: false
            },
            {
                name: "🔄 `/ctftime rebind <id> [options]`",
                value: "**Recreate role assignment system for a CTF**\n" +
                       "• `id` (required): CTF event ID to rebind\n" +
                       "• `is_dummie` (optional): Rebind as dummy event\n" +
                       "• `day` (optional): Set closure time in days (default: 1)\n" +
                       "• Useful when role assignment messages break\n" +
                       "• Reassigns roles to users who previously reacted",
                inline: false
            }
        )
        .addFields(
            {
                name: "💡 **Usage Tips**",
                value: "• Use `/ctftime upcoming 7` to see events for the next week\n" +
                       "• Schedule events early to give team members time to sign up\n" +
                       "• Use dummy events for testing without affecting real data\n" +
                       "• Private events are great for internal team competitions",
                inline: false
            }
        )
        .setFooter({ 
            text: "CTF Assistant Bot • Use these commands responsibly",
            iconURL: "https://tcp1p.team/favicon.ico" 
        })
        .setTimestamp();
}
