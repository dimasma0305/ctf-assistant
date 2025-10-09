# CTF Assistant Bot

A comprehensive Discord bot designed for CTF (Capture The Flag) teams to manage competitions, coordinate team activities, and track events from CTFTime.org.

[![Documentation](https://img.shields.io/badge/docs-available-brightgreen)](https://dimasma0305.github.io/ctf-assistant)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Bot-7289DA?logo=discord&logoColor=white)](https://discord.com)

## Features

- 🏁 **CTFTime Integration**: Automatically fetch and schedule CTF events from CTFTime.org
- 👥 **Role Management**: Automated role assignment with reaction-based signup system
- 📅 **Event Scheduling**: Create Discord scheduled events for upcoming CTFs
- 💬 **Channel Organization**: Automatically create dedicated channels for each CTF
- 🔒 **Private Events**: Support for internal team competitions with password protection
- 🎮 **Team Activities**: Notification system for team coordination and updates
- 📊 **Event Tracking**: Monitor current and upcoming CTF competitions
- 🗄️ **Database Integration**: MongoDB integration for persistent data storage

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) or Node.js 18+
- MongoDB database
- Discord Bot Token with appropriate permissions

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

### Development Mode

Run with auto-reload:
```bash
bun dev
# or
npm run dev
```

## Documentation

📚 **[Full Documentation](https://dimasma0305.github.io/ctf-assistant)** - Comprehensive guide with examples and troubleshooting

Quick links:
- [CTFTime Commands](https://dimasma0305.github.io/ctf-assistant/commands/ctftime/)
- [Setup Guide](https://dimasma0305.github.io/ctf-assistant/#setup-guide)
- [Troubleshooting](https://dimasma0305.github.io/ctf-assistant/#troubleshooting)
- [Contributing](docs/CONTRIBUTING.md)

## Commands Overview

### CTFTime Commands

Manage external CTF competition participation.

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/ctftime current` | Display currently running CTFs | Everyone |
| `/ctftime upcoming [days]` | Show upcoming CTF events | Everyone |
| `/ctftime schedule <id>` | Schedule a CTF event | Managers |
| `/ctftime delete [id]` | Delete CTF resources | Managers |
| `/ctftime archive <id>` | Archive a CTF event | Managers |
| `/ctftime rebind <id>` | Fix role assignment system | Managers |
| `/ctftime help` | Show help information | Everyone |

### Notify Commands

Automated notification system for CTF updates.

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/notify register [channel] [event_type]` | Register channel for notifications | Mabar Manager |
| `/notify unregister [channel]` | Unregister from notifications | Mabar Manager |
| `/notify list` | View registered notification channels | Managers |

### Solve Commands

Challenge tracking and team leaderboards.

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/solve init` | Initialize challenges from platform JSON | Everyone |
| `/solve challenge [players]` | Mark challenge as solved | Everyone |
| `/solve delete` | Delete solve record | Server Owner |
| `/solve list` | List all solved challenges | Everyone |
| `/solve leaderboard` | Display solve leaderboard | Everyone |
| `/solve refresh` | Refresh challenges from platform | Everyone |

### Event Commands

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/event gen` | Generate event registration form link | Manage Events |

### Clean Commands

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/clean all [limit]` | Delete recent messages in channel | Manage Messages |
| `/clean username <user> [limit]` | Delete messages from specific user | Manage Messages |

### CTFEvent Commands

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/ctfevent role` | Create challenge author role assignment | Everyone |
| `/ctfevent rebind <id>` | Rebind role listeners to message | Everyone |

### Utility Commands

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/ping` | Check bot status | Everyone |
| `/join` | Join CTF event (in development) | Everyone |
| `/mencari` | Team recruitment utilities | Manage Roles |

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
GUILD_ID=your_discord_guild_id

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/ctf-assistant

# Optional Configuration
NODE_ENV=production
```

### Required Discord Permissions

The bot requires these permissions:
- Manage Roles
- Manage Channels
- Manage Events
- Send Messages
- Embed Links
- Add Reactions
- Read Message History

### Required Discord Roles

Create these roles in your Discord server:
- **Mabar Manager**: Full bot administration
- **Gas Mabar**: Can schedule CTF events
- **CTF Waiting Role**: Auto-assigned to CTF participants

## Development

### Project Structure

```
ctf-assistant/
├── src/
│   ├── Commands/          # Slash commands
│   │   ├── Public/        # Public commands (CTFTime, Notify)
│   │   └── ...
│   ├── Events/            # Discord event handlers
│   ├── Functions/         # Utility functions
│   ├── Database/          # MongoDB schemas
│   └── Model/             # TypeScript interfaces
├── docs/                  # Documentation
├── scripts/               # Utility scripts
└── index.ts              # Entry point
```

### Building Documentation

```bash
# Install documentation dependencies
pip install -r docs/requirements.txt

# Serve documentation locally
npm run docs:serve

# Build documentation
npm run docs:build

# Deploy to GitHub Pages
npm run docs:deploy
```

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed documentation guidelines.

### Database Scripts

```bash
# Populate database with sample data
npm run populate-db

# Clear and repopulate database
npm run populate-db:clean
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### Common Issues

**Bot not responding to commands:**
- Verify the bot is online and has proper permissions
- Check slash commands are registered (restart bot if needed)

**Permission denied errors:**
- Ensure user has required roles (Mabar Manager or Gas Mabar)
- Verify bot permissions in server settings

**CTF scheduling fails:**
- Verify the CTF ID from CTFTime.org is correct
- Check bot has "Manage Roles" and "Manage Channels" permissions

For more troubleshooting help, see the [documentation](https://dimasma0305.github.io/ctf-assistant/#troubleshooting).

## Technology Stack

- **Runtime**: Bun / Node.js
- **Language**: TypeScript
- **Framework**: Discord.js v14
- **Database**: MongoDB with Mongoose
- **Documentation**: MkDocs Material
- **CI/CD**: GitHub Actions

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://dimasma0305.github.io/ctf-assistant)
- 🐛 [Issue Tracker](https://github.com/dimasma0305/ctf-assistant/issues)
- 💬 Discord: Join TCP1P server
- 🌐 Website: [https://tcp1p.team](https://tcp1p.team)

## Acknowledgments

- Built for the CTF community by [TCP1P](https://tcp1p.team)
- Powered by [CTFTime.org](https://ctftime.org) API
- Uses [Discord.js](https://discord.js.org)

---

Made with ❤️ by the TCP1P team for CTF teams worldwide.

