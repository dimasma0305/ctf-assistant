# Quick Start Guide

Get started with CTF Assistant Bot in minutes!

## For Users

### Adding the Bot to Your Server

1. **Invite the bot** using the invite link (contact TCP1P team)
2. **Create required roles** in your Discord server:
   - `Mabar Manager` - Full bot administration
   - `Gas Mabar` - Can schedule CTF events
   - `CTF Waiting Role` - Auto-assigned to participants
3. **Assign permissions** to the bot:
   - Manage Roles
   - Manage Channels
   - Manage Events
   - Send Messages
   - Embed Links
   - Add Reactions

### Your First CTF

1. **Check upcoming CTFs:**
   ```
   /ctftime upcoming days:7
   ```

2. **Find a CTF ID** on [CTFTime.org](https://ctftime.org/event/list/upcoming)
   - Example: `https://ctftime.org/event/2584` → ID is `2584`

3. **Schedule the CTF** (requires Mabar Manager or Gas Mabar role):
   ```
   /ctftime schedule id:2584
   ```

4. **Team members sign up** by reacting ✅ to the bot's message

5. **Coordinate** in the auto-created CTF channel

6. **After the CTF**, clean up:
   ```
   /ctftime archive id:2584
   ```

### Getting Help

View all commands and examples:
```
/ctftime help
```

---

## For Developers

### Setting Up Development Environment

1. **Clone the repository:**
   ```bash
   git clone https://github.com/dimasma0305/ctf-assistant.git
   cd ctf-assistant
   ```

2. **Install dependencies:**
   ```bash
   bun install
   # or npm install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials:
   # - DISCORD_TOKEN
   # - CLIENT_ID
   # - GUILD_ID
   # - MONGODB_URI
   ```

4. **Start MongoDB** (if running locally):
   ```bash
   docker-compose up -d
   # or start your MongoDB service
   ```

5. **Run the bot:**
   ```bash
   bun dev
   # or npm run dev
   ```

### Development Workflow

1. **Make changes** to the code
2. **Test locally** in a test Discord server
3. **Check for errors** in the console
4. **Commit changes** with clear messages
5. **Open a pull request** for review

### Working with Documentation

1. **Install docs dependencies:**
   ```bash
   pip install -r docs/requirements.txt
   ```

2. **Edit markdown files** in `docs/` directory

3. **Preview changes:**
   ```bash
   npm run docs:serve
   # Visit http://127.0.0.1:8000
   ```

4. **Build documentation:**
   ```bash
   npm run docs:build
   ```

### Database Population

Add sample data for testing:
```bash
npm run populate-db
```

Clear and repopulate:
```bash
npm run populate-db:clean
```

---

## For Administrators

### Initial Server Setup

1. **Create a Discord Application:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application"
   - Name it "CTF Assistant"

2. **Create a Bot:**
   - Go to "Bot" section
   - Click "Add Bot"
   - Enable these intents:
     - Presence Intent
     - Server Members Intent
     - Message Content Intent
   - Copy the bot token

3. **Get Client ID:**
   - Go to "OAuth2" → "General"
   - Copy the Client ID

4. **Generate Invite Link:**
   - Go to "OAuth2" → "URL Generator"
   - Select scopes:
     - `bot`
     - `applications.commands`
   - Select bot permissions:
     - Manage Roles
     - Manage Channels
     - Manage Events
     - Send Messages
     - Embed Links
     - Add Reactions
     - Read Message History
   - Copy the generated URL

5. **Invite Bot to Server:**
   - Open the generated URL
   - Select your server
   - Authorize

6. **Configure Roles:**
   - Create required roles in your server
   - Assign to appropriate team members
   - Ensure bot role is above managed roles

### MongoDB Setup

**Using Docker:**
```bash
docker run -d \
  --name ctf-assistant-mongo \
  -p 27017:27017 \
  -e MONGO_INITDB_DATABASE=ctf-assistant \
  mongo:latest
```

**Using MongoDB Atlas (Cloud):**
1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Whitelist your IP
5. Get connection string
6. Update `MONGODB_URI` in `.env`

### Hosting the Bot

**Option 1: VPS/Dedicated Server**
```bash
# Install Node.js/Bun
# Clone repository
# Configure .env
# Install dependencies
# Run with PM2 or systemd
pm2 start index.ts --name ctf-assistant
```

**Option 2: Docker**
```bash
docker build -t ctf-assistant .
docker run -d --env-file .env ctf-assistant
```

**Option 3: Cloud Platform**
- Deploy to Railway, Heroku, or similar
- Configure environment variables
- Set up MongoDB connection

---

## Common Tasks

### Updating the Bot

```bash
git pull origin main
bun install  # or npm install
bun start    # or npm start
```

### Backing Up Data

Export MongoDB data:
```bash
mongodump --uri="mongodb://localhost:27017/ctf-assistant" --out=backup/
```

Restore:
```bash
mongorestore --uri="mongodb://localhost:27017/ctf-assistant" backup/
```

### Monitoring

Check bot status:
- Discord server (bot should be online)
- Bot console logs
- MongoDB connection status

### Troubleshooting

**Bot offline:**
```bash
# Check if process is running
pm2 status  # if using PM2

# Check logs
pm2 logs ctf-assistant

# Restart
pm2 restart ctf-assistant
```

**Database connection issues:**
- Verify MongoDB is running
- Check `MONGODB_URI` in `.env`
- Test connection manually

**Commands not working:**
- Verify bot has required permissions
- Check role hierarchy
- Review console logs for errors

---

## Next Steps

- 📖 Read the [full documentation](README.md)
- 🔧 Check out [CTFTime commands](commands/ctftime.md)
- 🤝 Learn about [contributing](CONTRIBUTING.md)
- 🚀 Set up [GitHub Pages](setup-github-pages.md) for your docs

## Getting Help

- [Documentation](https://dimasma0305.github.io/ctf-assistant)
- [GitHub Issues](https://github.com/dimasma0305/ctf-assistant/issues)
- Discord: Contact TCP1P team
- Website: [https://tcp1p.team](https://tcp1p.team)

Happy hacking! 🎯

