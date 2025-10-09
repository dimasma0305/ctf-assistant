import { EmbedBuilder } from "discord.js";

/**
 * Creates a comprehensive help embed with all CTFTime command information,
 * including permission requirements, examples, and troubleshooting tips
 * @returns EmbedBuilder instance with detailed help information
 */
export function createCTFTimeHelpEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("🏁 CTFTime Commands - Complete Guide")
        .setDescription(
            "**Comprehensive documentation for CTFTime bot commands**\n\n" +
            "**Quick Reference:**\n" +
            "🔓 Public Commands: `current`, `upcoming`, `help`\n" +
            "🔒 Manager Commands: `schedule`, `delete`, `archive`, `rebind`\n\n" +
            "📚 [Full Documentation](https://github.com/dimasma0305/ctf-assistant/docs)"
        )
        .setColor(0x00AE86)
        .addFields(
            {
                name: "━━━━━━━━━━━━ 📖 Viewing Commands (Everyone) ━━━━━━━━━━━━",
                value: "\u200B",
                inline: false
            },
            {
                name: "📋 `/ctftime current`",
                value: "**Display currently running CTFs**\n" +
                       "Shows all CTF events that are currently active with full details.\n\n" +
                       "**Example:**\n" +
                       "```/ctftime current```\n" +
                       "**Permissions:** 🔓 Everyone\n" +
                       "**Details:** Displays event format, location, weight, notes, and CTFTime links",
                inline: false
            },
            {
                name: "🔮 `/ctftime upcoming [days]`",
                value: "**Display upcoming CTF events**\n" +
                       "Shows future CTF events within the specified time range.\n\n" +
                       "**Parameters:**\n" +
                       "• `days` (optional): Look ahead 1-100 days (default: 5)\n\n" +
                       "**Examples:**\n" +
                       "```/ctftime upcoming\n" +
                       "/ctftime upcoming days:7\n" +
                       "/ctftime upcoming days:30```\n" +
                       "**Permissions:** 🔓 Everyone",
                inline: false
            },
            {
                name: "━━━━━━━━━━━━ 🛠️ Management Commands (Managers) ━━━━━━━━━━━━",
                value: "\u200B",
                inline: false
            },
            {
                name: "📅 `/ctftime schedule <id> [options]`",
                value: "**Schedule a CTF event with automated setup**\n" +
                       "Creates roles, channels, scheduled events, and reaction-based signup system.\n\n" +
                       "**Parameters:**\n" +
                       "• `id` (required): CTF event ID from ctftime.org\n" +
                       "• `is_dummie` (optional): Create test/dummy event for practice\n" +
                       "• `private` (optional): Make the CTF private (requires password)\n" +
                       "• `password` (optional): Password for private events\n\n" +
                       "**Examples:**\n" +
                       "```/ctftime schedule id:2584\n" +
                       "/ctftime schedule id:2584 is_dummie:true\n" +
                       "/ctftime schedule id:2584 private:true password:secret123```\n" +
                       "**Permissions:** 🔒 Mabar Manager, Gas Mabar\n" +
                       "**Note:** Private events require a password to be set!",
                inline: false
            },
            {
                name: "🗑️ `/ctftime delete [id] [title]`",
                value: "**Delete all CTF-related Discord resources**\n" +
                       "Removes roles, channels, and scheduled events permanently.\n\n" +
                       "**Parameters:**\n" +
                       "• `id` (optional): Delete by CTF event ID\n" +
                       "• `title` (optional): Delete by exact CTF title\n" +
                       "• If no parameters: Uses current channel's CTF\n\n" +
                       "**Examples:**\n" +
                       "```/ctftime delete id:2584\n" +
                       "/ctftime delete title:DiceCTF 2024\n" +
                       "/ctftime delete```\n" +
                       "**Permissions:** 🔒 Mabar Manager\n" +
                       "**⚠️ Warning:** This action is permanent and cannot be undone!",
                inline: false
            },
            {
                name: "📦 `/ctftime archive <id>`",
                value: "**Archive a completed CTF event**\n" +
                       "Moves CTF to archived state while preserving historical data.\n\n" +
                       "**Parameters:**\n" +
                       "• `id` (required): CTF event ID to archive\n\n" +
                       "**Example:**\n" +
                       "```/ctftime archive id:2584```\n" +
                       "**Permissions:** 🔒 Mabar Manager\n" +
                       "**Use Case:** Clean up after CTF completion while keeping records",
                inline: false
            },
            {
                name: "🔄 `/ctftime rebind <id> [options]`",
                value: "**Recreate role assignment system for a CTF**\n" +
                       "Regenerates the role assignment message and reassigns roles.\n\n" +
                       "**Parameters:**\n" +
                       "• `id` (required): CTF event ID to rebind\n" +
                       "• `is_dummie` (optional): Rebind as dummy event\n" +
                       "• `day` (optional): Set closure time in days (default: 1)\n\n" +
                       "**Examples:**\n" +
                       "```/ctftime rebind id:2584\n" +
                       "/ctftime rebind id:2584 day:2```\n" +
                       "**Permissions:** 🔒 Mabar Manager\n" +
                       "**Use Case:** Fix broken role assignment messages or adjust closure time",
                inline: false
            }
        )
        .addFields(
            {
                name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                value: "\u200B",
                inline: false
            },
            {
                name: "🆘 Troubleshooting",
                value: "**Common Issues & Solutions:**\n\n" +
                       "**Permission Denied**\n" +
                       "→ Verify you have `Mabar Manager` or `Gas Mabar` role for management commands\n\n" +
                       "**Invalid CTF ID**\n" +
                       "→ Get the correct ID from the CTF's ctftime.org URL (e.g., ctftime.org/event/2584)\n\n" +
                       "**Private Event Without Password**\n" +
                       "→ Private events require the `password` parameter to be set\n\n" +
                       "**Channel/Role Creation Failed**\n" +
                       "→ Ensure bot has `Manage Roles` and `Manage Channels` permissions\n\n" +
                       "**Role Assignment Not Working**\n" +
                       "→ Use `/ctftime rebind` to regenerate the role assignment system",
                inline: false
            },
            {
                name: "💡 Best Practices & Tips",
                value: "• **Plan ahead:** Schedule CTFs early so team members can sign up in advance\n" +
                       "• **Test first:** Use `is_dummie:true` to test without affecting production data\n" +
                       "• **Private CTFs:** Use the private option with password for internal team events\n" +
                       "• **Check upcoming:** Run `/ctftime upcoming 7` weekly to plan participation\n" +
                       "• **Clean up:** Archive or delete old CTFs to keep your server organized\n" +
                       "• **Rebind when needed:** If role assignments break, rebind instead of deleting",
                inline: false
            }
        )
        .setFooter({ 
            text: "CTF Assistant Bot v1.0 • Made with ❤️ for CTF Teams • Full docs at github.com/dimasma0305/ctf-assistant",
            iconURL: "https://tcp1p.team/favicon.ico" 
        })
        .setTimestamp();
}
