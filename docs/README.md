# CTF Assistant Bot Documentation

Welcome to the CTF Assistant Bot documentation! This bot helps CTF teams manage their Discord server by automating event scheduling, role management, and team coordination.

## Table of Contents

- [Getting Started](#getting-started)
- [Commands Reference](#commands-reference)
- [Setup Guide](#setup-guide)
- [Troubleshooting](#troubleshooting)
- [Examples](#examples)

## Getting Started

CTF Assistant Bot is a Discord bot designed to streamline CTF (Capture The Flag) competition management for cybersecurity teams. It integrates with CTFTime.org to automatically schedule events, create channels, manage roles, and coordinate team participation.

### Key Features

- **Automatic Event Scheduling**: Import CTF events directly from CTFTime.org
- **Role Management**: Automated role assignment with reaction-based signup
- **Channel Organization**: Creates dedicated channels for each CTF
- **Event Tracking**: Monitor current and upcoming CTF competitions
- **Team Coordination**: Private event support for internal competitions

## Commands Reference

The bot provides comprehensive command sets for different aspects of CTF management:

### CTFTime Commands

Manage external CTF competition participation. [Full Documentation →](commands/ctftime.md)

- `/ctftime current` - Display currently running CTFs
- `/ctftime upcoming [days]` - Display upcoming CTF events
- `/ctftime schedule <id>` - Schedule a CTF event
- `/ctftime delete [id] [title]` - Delete CTF-related resources
- `/ctftime archive <id>` - Archive a completed CTF
- `/ctftime rebind <id>` - Recreate role assignment system
- `/ctftime help` - Show help information

### Notify Commands

Automated notification system for CTF updates. [Full Documentation →](commands/notify.md)

- `/notify register [channel] [event_type]` - Register channel for notifications
- `/notify unregister [channel]` - Unregister from notifications
- `/notify list` - View all registered notification channels

**Notification Types**: Weekly reminders, CTF announcements, solve updates, event creation notifications

### Solve Commands

Challenge tracking and team leaderboards. [Full Documentation →](commands/solve.md)

- `/solve init [fetch_command] [json_file]` - Initialize challenges from platform JSON
- `/solve challenge [players]` - Mark challenge as solved
- `/solve delete` - Delete solve record (owner only)
- `/solve list` - List all solved challenges
- `/solve leaderboard [global] [limit] [auto_update]` - Display leaderboard
- `/solve refresh` - Refresh challenges from platform

**Features**: Automatic thread creation, solver attribution, fair scoring system, auto-sync

### Event Commands

CTF event form generation. [Full Documentation →](commands/event.md)

- `/event gen` - Generate event registration form link

**Use Case**: Create CTF events via web interface with detailed forms

### Clean Commands

Administrative message cleanup utilities. [Full Documentation →](commands/clean.md)

- `/clean all [limit]` - Delete recent messages in channel
- `/clean username <user> [limit]` - Delete messages from specific user

**⚠️ Warning**: Permanent deletion, use carefully

### CTFEvent Commands

Internal CTF event organization roles. [Full Documentation →](commands/ctfevent.md)

- `/ctfevent role` - Create challenge author role assignment
- `/ctfevent rebind <id>` - Rebind role listeners to message

**Purpose**: For organizing your own CTF events, not participating in external ones

### Utility Commands

Miscellaneous helper commands. [Full Documentation →](commands/utilities.md)

- `/ping` - Check bot status and responsiveness
- `/join` - Join CTF event (in development)
- `/mencari` - Team recruitment utilities
- `/send` - Admin message sending
- `/logger` - Logging and monitoring (admin)

## Setup Guide

### Prerequisites

- Node.js 18+ or Bun runtime
- Discord Bot Token
- MongoDB database
- Required Discord bot permissions:
  - Manage Roles
  - Manage Channels
  - Manage Events
  - Send Messages
  - Embed Links
  - Add Reactions

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/dimasma0305/ctf-assistant.git
   cd ctf-assistant
   ```

2. Install dependencies:
   ```bash
   bun install
   # or
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Start the bot:
   ```bash
   bun start
   # or
   npm start
   ```

### Configuration

Create a `.env` file with the following variables:

```env
DISCORD_TOKEN=your_discord_bot_token
MONGODB_URI=your_mongodb_connection_string
CLIENT_ID=your_discord_client_id
GUILD_ID=your_discord_guild_id
```

### Required Discord Roles

The bot requires these roles to be created in your Discord server:
- **Mabar Manager**: Full access to all bot commands
- **Gas Mabar**: Access to schedule CTF events
- **CTF Waiting Role**: Auto-assigned role for CTF participants

## Troubleshooting

### Common Issues

#### Bot Not Responding to Commands
- Verify the bot is online and has proper permissions
- Check that slash commands are registered (restart bot if needed)
- Ensure the bot role is higher than managed roles in role hierarchy

#### Permission Denied Errors
- Verify user has required roles (Mabar Manager or Gas Mabar)
- Check bot permissions in server settings
- Ensure bot has "Administrator" or specific permissions listed above

#### CTF Scheduling Fails
- Verify the CTF ID from CTFTime.org is correct
- Check that the bot has "Manage Roles" and "Manage Channels" permissions
- Ensure MongoDB connection is active

#### Role Assignment Not Working
- Use `/ctftime rebind` to regenerate the role assignment system
- Check that the bot role is positioned correctly in role hierarchy
- Verify "Manage Roles" permission is granted

### Getting Help

- Check the [Commands Reference](commands/ctftime.md) for detailed command usage
- Review error messages in the bot's console logs
- Visit the [GitHub Issues](https://github.com/dimasma0305/ctf-assistant/issues) page

## Examples

### Scheduling a CTF Event

1. Find the CTF event on CTFTime.org (e.g., `https://ctftime.org/event/2584`)
2. Use the event ID in the schedule command:
   ```
   /ctftime schedule id:2584
   ```
3. The bot will create:
   - A dedicated role for the CTF
   - A text channel for coordination
   - A scheduled event in Discord
   - A reaction message for signup

### Viewing Upcoming Events

To see CTF events for the next two weeks:
```
/ctftime upcoming days:14
```

### Cleaning Up After a CTF

After a CTF is completed, archive it:
```
/ctftime archive id:2584
```

Or delete all related resources:
```
/ctftime delete id:2584
```

### Testing with Dummy Events

Before scheduling a real CTF, test with a dummy event:
```
/ctftime schedule id:test-event is_dummie:true
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development

Run in development mode with auto-reload:
```bash
bun dev
# or
npm run dev
```

### Building Documentation

Build the documentation site:
```bash
bun run docs:build
# or
npm run docs:build
```

Serve documentation locally:
```bash
bun run docs:serve
# or
npm run docs:serve
```

## License

This project is licensed under the ISC License.

## Support

- GitHub: [dimasma0305/ctf-assistant](https://github.com/dimasma0305/ctf-assistant)
- Discord: Contact TCP1P team
- Website: [https://tcp1p.team](https://tcp1p.team)

---

Made with ❤️ by the TCP1P team for the CTF community.

