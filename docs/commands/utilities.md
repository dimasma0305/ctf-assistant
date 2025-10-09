# Utility Commands Reference

Complete reference for miscellaneous utility and helper commands.

## Command Overview

| Command | Permission | Description |
|---------|------------|-------------|
| `/ping` | Everyone | Check bot latency and responsiveness |
| `/join` | Everyone | Join CTF event (placeholder) |
| `/mencari` | Manage Roles, Manage Channels | Team recruitment utilities |
| `/send` | Admin | Send messages via bot (utility) |
| `/logger` | Admin | Logging and monitoring utilities |

## Overview

Utility commands provide various helper functions for bot management, diagnostics, team coordination, and administrative tasks.

---

## Basic Commands

### `/ping`

Check if the bot is online and responsive.

**Syntax:**
```
/ping
```

**Parameters:**
None

**Required Permissions:**
- User: None (everyone can use)
- Bot: `Send Messages`

**Examples:**
```
# Check bot status
/ping
```

**What it does:**
1. Receives ping command
2. Immediately responds with "pong"
3. Shows bot is online and processing commands
4. Response is ephemeral (only you see it)

**Use Cases:**
- Verify bot is online
- Test command responsiveness
- Check bot connection
- Quick status check

**Response Format:**
```
pong
```

**Important Notes:**
- Very simple diagnostic command
- Always ephemeral response
- No latency calculation shown
- Just confirms bot is alive

---

## Team Management Commands

### `/join`

Join a CTF event (functionality in development).

**Syntax:**
```
/join
```

**Parameters:**
TBD - Command structure under development

**Status:**
🚧 **Under Development** - Basic structure exists but implementation pending

**Expected Functionality:**
- Join CTF team or event
- Sign up for participation
- Register interest in CTF
- Add yourself to participant list

**Note**: This command appears to be a placeholder awaiting full implementation. Check with bot administrators for current status.

---

### `/mencari`

Team recruitment and searching utilities.

**Syntax:**
```
/mencari [subcommand]
```

**Subcommands:**
- `mencari` - Main recruitment function
- `poster` - Create recruitment poster/announcement

**Required Permissions:**
- User: `Manage Roles` **AND** `Manage Channels`
- Bot: `Send Messages`, `Embed Links`, `Manage Roles`

**Examples:**
```
# Post recruitment message (TBD)
/mencari mencari

# Create recruitment poster (TBD)
/mencari poster
```

**Status:**
🚧 **Partial Implementation** - Command structure exists, full features may be in development

**Expected Use Cases:**
- Post "looking for team" messages
- Create recruitment announcements
- Find team members for CTF
- Coordinate team formation

**Important Notes:**
- Requires elevated permissions
- Likely creates formatted recruitment posts
- May include team size, skills needed, etc.
- Check with administrators for full feature set

---

## Administrative Commands

### `/send`

Send messages through the bot (administrative utility).

**Syntax:**
```
/send [subcommand] [parameters]
```

**Subcommands:**
- Modal-based message sending
- Direct message composition

**Required Permissions:**
- User: Administrator
- Bot: `Send Messages`, `Embed Links`

**Status:**
🚧 **Administrative Tool** - Restricted access, full documentation pending

**Expected Functionality:**
- Send announcements as bot
- Post formatted messages
- Create embeds via bot
- Automated message distribution

**Use Cases:**
- Official announcements
- Formatted bot messages
- Scheduled posts
- Mass messaging

**Security:**
- Heavily restricted command
- Admin-only access
- Prevents impersonation
- Audit-logged usage

---

### `/logger`

Logging and monitoring utilities for bot activities.

**Syntax:**
```
/logger [subcommand]
```

**Subcommands:**
- `ctftime` - CTFTime-specific logging
- Additional logging functions

**Required Permissions:**
- User: Administrator
- Bot: `Send Messages`, `View Audit Log`

**Status:**
🚧 **Administrative Tool** - Internal monitoring system

**Expected Functionality:**
- Log bot activities
- Monitor command usage
- Track CTFTime API calls
- Debug and diagnostics
- Audit trail generation

**Use Cases:**
- Debugging bot issues
- Monitoring system health
- Tracking usage patterns
- Security auditing
- Performance monitoring

**Important Notes**:
- Internal tool for administrators
- Not for general use
- Helps maintain bot health
- Provides audit capabilities

---

## Permission Roles

### Everyone
- Can use `/ping`
- Can use `/join` (when implemented)
- Basic diagnostic access

### Manage Roles + Manage Channels
- Can use `/mencari` commands
- Team coordination features
- Recruitment management

### Administrator
- Can use `/send` commands
- Can use `/logger` commands
- Full system access
- Sensitive operations

---

## Common Workflows

### Checking Bot Status

**Simple check**:
```
/ping
```

**If no response:**
1. Check bot is online (green dot)
2. Verify bot permissions
3. Check Discord API status
4. Contact bot administrator

### Posting Recruitment Message

**Basic recruitment** (when fully implemented):
```
/mencari mencari
```

**Expected flow:**
1. Command opens modal or form
2. Fill in team details
3. Submit recruitment post
4. Post appears in channel
5. Users can respond

---

## Troubleshooting

### Bot Not Responding to `/ping`
- Check bot online status
- Verify bot has channel access
- Check Discord API status
- Restart bot if necessary
- Contact administrator

### Cannot Use `/mencari`
- Verify you have both `Manage Roles` and `Manage Channels`
- Check role hierarchy
- Confirm permissions in specific channel
- Contact server administrator

### Administrative Commands Not Available
- Verify you have administrator role
- Commands may be hidden if not authorized
- Check with server owner
- May require special role assignment

---

## Best Practices

1. **Use `/ping` for Quick Checks**:
   - Fast way to verify bot status
   - No side effects
   - Always safe to use

2. **Don't Spam Commands**:
   - Respect rate limits
   - One ping is enough
   - Wait for response

3. **Administrative Commands**:
   - Use responsibly
   - Document usage
   - Follow server policies
   - Log important actions

4. **Report Issues**:
   - If `/ping` fails, report to admins
   - Document error messages
   - Note time and context
   - Help debug problems

---

## Development Status

### Implemented
- ✅ `/ping` - Fully functional
- ✅ Basic command structure

### In Development
- 🚧 `/join` - Structure exists, awaiting implementation
- 🚧 `/mencari` - Partial functionality, features being added
- 🚧 `/send` - Administrative tool, documentation pending
- 🚧 `/logger` - Internal tool, full features TBD

### Future Enhancements
- Full `/join` implementation with team registration
- Complete `/mencari` recruitment system
- Enhanced logging capabilities
- Additional diagnostic commands
- Bot health monitoring dashboard

---

## Technical Details

### Latency Measurement

While `/ping` doesn't currently show latency, typical measurements include:
- **Command Processing**: Time from command to response
- **API Latency**: Discord API response time
- **Bot Latency**: Internal processing delay

**Good latency**: <100ms
**Acceptable**: 100-500ms
**Slow**: >500ms

### Command Registration

Utility commands are registered as slash commands with Discord's API. They appear in the command menu when typing `/`.

### Permissions Model

Commands use Discord's permission system:
- **Public**: Everyone can use
- **Moderation**: Require specific permissions
- **Administrative**: Require admin role

---

## Related Commands

- [`/ctftime`](ctftime.md) - CTF competition management
- [`/notify`](notify.md) - Notification system
- [`/solve`](solve.md) - Challenge tracking
- [`/clean`](clean.md) - Message cleanup utilities

---

## Getting Help

If you need assistance with utility commands:

1. **Check bot status** with `/ping`
2. **Review permissions** in server settings
3. **Contact administrators** for advanced features
4. **Report bugs** via GitHub issues
5. **Check documentation** for updates

---

## Version Information

Utility commands are part of the core bot functionality and are continuously updated. Check the [changelog](../README.md) for recent updates to utility features.

---

For more information, visit the [main documentation](../README.md) or specific command references.

