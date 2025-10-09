# CTFEvent Commands Reference

Complete reference for CTF event-specific role management commands.

## Command Overview

| Command | Permission | Description |
|---------|------------|-------------|
| `/ctfevent role` | Everyone | Create challenge author role assignment message |
| `/ctfevent rebind` | Everyone | Rebind reaction role listeners to existing message |

## Overview

The CTFEvent system provides role management specifically for internal TCP1P CTF events. These commands help assign roles to challenge authors and manage role-based permissions for event organization.

**Note**: These commands are designed for **organizing your own CTF events**, not participating in external CTFs.

---

## Commands

### `/ctfevent role`

Create a role assignment message for CTF challenge authors to claim their categories.

**Syntax:**
```
/ctfevent role
```

**Parameters:**
None

**Required Permissions:**
- User: Standard member
- Bot: `Send Messages`, `Embed Links`, `Manage Roles`, `Add Reactions`

**Examples:**
```
# Create role assignment message
/ctfevent role
```

**What it does:**
1. Creates an embed message with available challenge categories
2. Adds reaction emojis for each category
3. Sets up reaction event listeners
4. Assigns roles when users react
5. Removes roles when users unreact

**Default Categories:**
The system typically includes roles for:
- Web challenges
- Cryptography challenges
- Binary exploitation (Pwn)
- Reverse engineering
- Forensics
- Miscellaneous challenges

**Use Cases:**
- Set up role selection for internal CTF event organization
- Allow challenge authors to self-assign category roles
- Manage permissions for challenge author channels
- Organize team by challenge category expertise

**Important Notes:**
- Creates roles if they don't exist
- Reactions trigger automatic role assignment
- Works with existing Discord roles
- Message remains active permanently
- Users can select multiple categories
- Indonesian language by default (TCP1P specific)

**Response Format:**
```
TCP1P Event Role

Silahkan untuk mengambil role sesuai challenge yang ingin di buat
pada ctf event kali ini ya teman-teman!

🌐 Web - React untuk web challenges
🔐 Crypto - React untuk crypto challenges
💾 Pwn - React untuk pwn challenges
🔍 Reverse Engineering - React untuk RE challenges
🔬 Forensics - React untuk forensics challenges
⚙️ Misc - React untuk misc challenges
```

---

### `/ctfevent rebind <id>`

Rebind reaction role listeners to an existing role assignment message.

**Syntax:**
```
/ctfevent rebind id:<message_id>
```

**Parameters:**
- `id` (required): Message ID of the role assignment message
  - Type: String (Discord message ID)
  - Must be a message in the current channel
  - Original message created by `/ctfevent role`

**Required Permissions:**
- User: Standard member
- Bot: `Manage Roles`, `Add Reactions`, `Read Message History`

**Examples:**
```
# Rebind role listeners to message
/ctfevent rebind id:1234567890123456789
```

**What it does:**
1. Fetches the specified message
2. Re-assigns all users who previously reacted
3. Reattaches event listeners for future reactions
4. Ensures role assignment system works again
5. Processes existing reactions

**Use Cases:**
- Fix broken role assignment after bot restart
- Restore role system without recreating message
- Repair event listeners after updates
- Maintain existing reaction history

**Important Notes:**
- Must be used in the same channel as the message
- Message must exist and be accessible
- Re-processes all existing reactions
- Useful after bot downtime or restarts
- Does not create new message

**Getting Message ID:**
1. Enable Developer Mode in Discord settings
2. Right-click the role assignment message
3. Select "Copy ID"
4. Use ID in command

**Response Format:**
```
(Command deletes its own reply after execution)
```

---

## Permission Roles

### Everyone
- Can use both commands
- Can create role assignment messages
- Can rebind existing messages
- Democratic system for role management

### Bot Requirements
- Needs `Manage Roles` to assign/remove roles
- Bot role must be higher than assigned roles in hierarchy
- Needs `Add Reactions` for reaction-based system
- Needs `Read Message History` for rebind function

---

## Common Workflows

### Setting Up Internal CTF Event

1. **Create event channels** for each category:
   - `#web-challenges`
   - `#crypto-challenges`
   - `#pwn-challenges`
   - etc.

2. **Post role assignment** in announcement channel:
   ```
   /ctfevent role
   ```

3. **Challenge authors react** to claim their categories

4. **Grant channel permissions** based on roles

### Fixing Role Assignment After Bot Restart

1. **Find role assignment message** in channel

2. **Copy message ID**:
   - Right-click message
   - "Copy ID"

3. **Rebind role listeners**:
   ```
   /ctfevent rebind id:1234567890123456789
   ```

4. **Verify** by testing reactions

---

## Troubleshooting

### Roles Not Being Assigned
- Check bot has `Manage Roles` permission
- Verify bot role is higher than assigned roles
- Ensure bot hasn't been restarted (use rebind if needed)
- Check role permissions in server settings

### Rebind Command Not Working
- Verify message ID is correct
- Ensure message is in the current channel
- Check bot can access the message
- Message must be from the bot itself

### Cannot Find Message ID
- Enable Developer Mode in Discord
- User Settings → Advanced → Developer Mode
- Right-click message → Copy ID
- Must be a message, not a channel or user ID

### Wrong Roles Being Assigned
- Reaction emojis must match configured mapping
- Check role names match expected categories
- Verify no conflicting role assignment bots
- Review role configuration in code

---

## Best Practices

1. **Post in Dedicated Channel**:
   - Use announcement or role channel
   - Pin the role assignment message
   - Keep channel clean (only role message)

2. **Test Before Event**:
   - Test with personal account
   - Verify all category roles work
   - Check permission inheritance

3. **Rebind After Bot Updates**:
   - Run rebind after bot restart
   - Verify role system after deployments
   - Keep message ID documented

4. **Clear Role Names**:
   - Use descriptive role names
   - Match challenge categories exactly
   - Consistent naming across channels

5. **Document for Team**:
   - Explain role system to authors
   - Share instructions for claiming roles
   - Include in event welcome messages

---

## Technical Details

### Reaction-Role Mapping

The system maps emoji reactions to Discord roles:

```
🌐 → Web Role
🔐 → Crypto Role
💾 → Pwn Role
🔍 → Reverse Engineering Role
🔬 → Forensics Role
⚙️ → Misc Role
```

### Event Listeners

The bot maintains event listeners that:
- Detect when users add reactions
- Assign corresponding roles immediately
- Detect when users remove reactions
- Remove corresponding roles

### Persistence

- Event listeners are in-memory
- Lost on bot restart (requires rebind)
- Message and reactions persist in Discord
- Role assignments remain even if bot offline

---

## Differences from `/ctftime` Commands

| Feature | `/ctfevent` | `/ctftime` |
|---------|-------------|------------|
| **Purpose** | Organizing your CTF | Participating in external CTFs |
| **Roles** | Challenge author categories | CTF participant roles |
| **Use Case** | Internal event setup | External competition management |
| **Permissions** | Category-based | Event participation |

---

## Related Commands

- [`/ctftime schedule`](ctftime.md#ctftime-schedule) - Schedule external CTF participation
- [`/ctftime rebind`](ctftime.md#ctftime-rebind) - Rebind participant role system
- [`/notify register`](notify.md#notify-register) - Set up event notifications

---

For more information, visit the [main documentation](../README.md) or [CTFTime Commands](ctftime.md).

