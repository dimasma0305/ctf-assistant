# CTFTime Commands Reference

Complete reference for all CTFTime-related commands in the CTF Assistant Bot.

## Command Overview

| Command | Permission | Description |
|---------|------------|-------------|
| `/ctftime current` | Everyone | Display currently running CTFs |
| `/ctftime upcoming` | Everyone | Display upcoming CTF events |
| `/ctftime help` | Everyone | Show help information |
| `/ctftime schedule` | Managers | Schedule a CTF event |
| `/ctftime delete` | Mabar Manager | Delete CTF resources |
| `/ctftime archive` | Mabar Manager | Archive a CTF event |
| `/ctftime rebind` | Mabar Manager | Recreate role assignment system |

## Viewing Commands (Public)

These commands are available to all server members.

### `/ctftime current`

Display all currently running CTF competitions.

**Syntax:**
```
/ctftime current
```

**What it does:**
- Queries CTFTime.org for active competitions
- Displays event details including:
  - Event name and CTFTime ID
  - Format (Jeopardy, Attack-Defense, etc.)
  - Location (Online/Onsite)
  - Weight (difficulty rating)
  - Event date/time
  - Direct link to CTFTime page

**Example Output:**
```
Event: DiceCTF 2024
ID: 2584
Format: Jeopardy
Location: Online
Weight: 50.00
Date: Feb 3, 2024 - Feb 5, 2024
Link: https://ctftime.org/event/2584
```

**Use Cases:**
- Check what CTFs are happening right now
- Find last-minute competitions to join
- Verify if a scheduled CTF has started

---

### `/ctftime upcoming [days]`

Display upcoming CTF events within a specified timeframe.

**Syntax:**
```
/ctftime upcoming [days:number]
```

**Parameters:**
- `days` (optional): Number of days to look ahead
  - Range: 1-100
  - Default: 5

**Examples:**
```
/ctftime upcoming
/ctftime upcoming days:7
/ctftime upcoming days:30
```

**What it does:**
- Fetches upcoming CTF events from CTFTime.org
- Filters to show only online events
- Displays events in chronological order
- Shows comprehensive event information

**Use Cases:**
- Plan your team's CTF schedule for the week/month
- Discover new competitions to participate in
- Coordinate with team members on which CTFs to join

---

### `/ctftime help`

Display comprehensive help information for all CTFTime commands.

**Syntax:**
```
/ctftime help
```

**What it does:**
- Shows an embedded message with all command documentation
- Includes permission requirements
- Provides command examples
- Offers troubleshooting tips
- Links to full documentation

---

## Management Commands (Restricted)

These commands require specific roles to execute.

### `/ctftime schedule <id> [options]`

Schedule a CTF event with automatic Discord server setup.

**Syntax:**
```
/ctftime schedule id:<ctftime_id> [is_dummie:boolean] [private:boolean] [password:string]
```

**Parameters:**
- `id` (required): CTF event ID from CTFTime.org
  - Find it in the URL: `ctftime.org/event/2584` → ID is `2584`
- `is_dummie` (optional): Create a test/dummy event
  - Default: `false`
- `private` (optional): Make the CTF private
  - Default: `false`
  - Requires `password` parameter
- `password` (optional): Password for private events
  - Required if `private` is `true`

**Required Permissions:**
- User: `Mabar Manager` or `Gas Mabar` role
- Bot: `Manage Roles`, `Manage Channels`, `Manage Events`

**Examples:**
```
# Basic scheduling
/ctftime schedule id:2584

# Create a test event
/ctftime schedule id:2584 is_dummie:true

# Schedule a private event
/ctftime schedule id:2584 private:true password:tcp1p2024
```

**What it does:**
1. Fetches event information from CTFTime.org
2. Creates a dedicated role for the CTF (named after the event)
3. Creates a text channel for team coordination
4. Creates a Discord scheduled event
5. Posts a reaction message for role assignment
6. Saves event data to the database
7. Notifies team members via the "CTF Waiting Role"

**Automated Setup:**
- **Role Creation**: Creates a role named after the CTF title
- **Channel Creation**: Creates a channel with a sanitized name
- **Reaction System**: Posts a message with checkmark reaction for signup
- **Auto-Assignment**: Users who react get the CTF role automatically
- **Scheduled Event**: Creates a Discord event with start/end times

**Use Cases:**
- Schedule team participation in upcoming CTFs
- Test bot functionality with dummy events
- Create private internal CTF competitions

**Important Notes:**
- Private events MUST include a password
- The bot role must be higher than created roles in the hierarchy
- Event data is saved to MongoDB for tracking
- Dummy events skip database storage

---

### `/ctftime delete [id] [title]`

Delete all Discord resources associated with a CTF event.

**Syntax:**
```
/ctftime delete [id:<ctftime_id>] [title:<event_title>]
```

**Parameters:**
- `id` (optional): CTF event ID from CTFTime.org
- `title` (optional): Exact CTF event title
- If both omitted: Uses the current channel's CTF

**Required Permissions:**
- User: `Mabar Manager` role
- Bot: `Manage Roles`, `Manage Channels`, `Manage Events`

**Examples:**
```
# Delete by ID
/ctftime delete id:2584

# Delete by title
/ctftime delete title:DiceCTF 2024

# Delete current channel's CTF
/ctftime delete
```

**What it does:**
1. Identifies the CTF to delete (by ID, title, or channel)
2. Removes the associated role
3. Deletes the CTF channel
4. Removes the scheduled Discord event
5. Confirms deletion to the user

**Resources Removed:**
- CTF-specific role
- CTF text channel
- Discord scheduled event
- Reaction messages (deleted with channel)

**Use Cases:**
- Clean up after CTF completion
- Remove incorrectly scheduled events
- Free up roles/channels for new events

**Important Notes:**
- ⚠️ This action is PERMANENT and cannot be undone
- Database records are NOT deleted (for history)
- User messages in the channel will be lost
- Team members will lose the CTF role

---

### `/ctftime archive <id>`

Archive a completed CTF event while preserving data.

**Syntax:**
```
/ctftime archive id:<ctftime_id>
```

**Parameters:**
- `id` (required): CTF event ID to archive

**Required Permissions:**
- User: `Mabar Manager` role
- Bot: `Manage Channels`

**Examples:**
```
/ctftime archive id:2584
```

**What it does:**
1. Fetches event information
2. Marks the event as archived in the system
3. Moves/renames associated resources
4. Preserves historical data

**Use Cases:**
- Clean up completed CTFs while keeping records
- Organize past events for reference
- Maintain server cleanliness without losing data

**Important Notes:**
- Archived events retain their database entries
- Useful for maintaining CTF participation history
- Less destructive than `/ctftime delete`

---

### `/ctftime rebind <id> [options]`

Recreate the role assignment system for a CTF event.

**Syntax:**
```
/ctftime rebind id:<ctftime_id> [is_dummie:boolean] [day:number]
```

**Parameters:**
- `id` (required): CTF event ID to rebind
- `is_dummie` (optional): Rebind as a dummy event
  - Default: `false`
- `day` (optional): Set closure time in days
  - Default: 1
  - Determines when role assignment closes

**Required Permissions:**
- User: `Mabar Manager` role
- Bot: `Manage Roles`, `Send Messages`

**Examples:**
```
# Basic rebind
/ctftime rebind id:2584

# Rebind with custom closure time
/ctftime rebind id:2584 day:2

# Rebind a dummy event
/ctftime rebind id:test is_dummie:true
```

**What it does:**
1. Fetches event information
2. Creates a new role assignment message
3. Re-assigns roles to users who previously reacted
4. Sets up reaction listeners for new signups

**Use Cases:**
- Fix broken role assignment messages (deleted/corrupted)
- Adjust closure time for late signups
- Recover from Discord API issues
- Reset the signup system without deleting everything

**Important Notes:**
- Preserves existing role assignments
- Users who already have the role will keep it
- Creates a new reaction message
- Useful alternative to full deletion/recreation

---

## Permission Roles

### Mabar Manager
- Full access to all CTFTime commands
- Can schedule, delete, archive, and rebind events
- Typically assigned to team leaders/administrators

### Gas Mabar
- Can schedule CTF events
- Cannot delete or modify existing events
- Suitable for trusted team members

### Everyone
- Can view current and upcoming CTFs
- Can access help information
- Can react to signup messages

---

## Common Workflows

### Scheduling a New CTF

1. Find the CTF on CTFTime.org and note the ID
2. Schedule the event:
   ```
   /ctftime schedule id:2584
   ```
3. Announce the event to your team
4. Team members react to the signup message
5. Bot automatically assigns roles

### Managing an Active CTF

1. Team coordinates in the dedicated channel
2. Use the role to @mention all participants
3. Share writeups and collaboration notes
4. Track progress throughout the event

### Cleaning Up After a CTF

Option 1: Archive (preserves data)
```
/ctftime archive id:2584
```

Option 2: Delete (removes everything)
```
/ctftime delete id:2584
```

### Fixing Broken Role Assignment

If the reaction message stops working:
```
/ctftime rebind id:2584
```

This creates a new message and restores functionality.

---

## Troubleshooting

### "Permission Denied" Error
- Verify you have `Mabar Manager` or `Gas Mabar` role
- Check bot permissions in server settings
- Ensure bot role is positioned correctly in role hierarchy

### "Invalid CTF ID" Error
- Verify the ID from CTFTime.org URL
- Ensure the event exists on CTFTime
- Try using the event title instead: `/ctftime delete title:EventName`

### "Private Event Without Password" Error
- Private events require a password parameter
- Use: `/ctftime schedule id:2584 private:true password:yourpass`

### Role Assignment Not Working
- Use `/ctftime rebind` to recreate the system
- Check bot has "Manage Roles" permission
- Verify bot role is higher than CTF role in hierarchy

### Channel/Role Creation Failed
- Ensure bot has required permissions:
  - Manage Roles
  - Manage Channels
  - Manage Events
- Check server's role/channel limits
- Verify bot has Administrator permission or specific permissions

---

## Best Practices

1. **Schedule Early**: Give team members time to sign up
2. **Use Dummy Events**: Test functionality before real events
3. **Clean Up Regularly**: Archive/delete old CTFs weekly
4. **Set Clear Permissions**: Only give manager roles to trusted members
5. **Monitor Signups**: Check reaction messages for participant count
6. **Use Private Events**: For internal team competitions or practice
7. **Rebind Don't Delete**: Try rebinding before deleting broken events

---

## API Integration

The bot integrates with CTFTime.org API to fetch event data. If CTFTime.org is down, scheduling commands may fail. In this case:
- Wait for CTFTime.org to recover
- Use `is_dummie:true` for testing/practice events
- Contact bot maintainers if issues persist

---

For more information, visit the [main documentation](../README.md) or contact the TCP1P team.

