# Clean Commands Reference

Complete reference for message cleanup utility commands.

## Command Overview

| Command | Permission | Description |
|---------|------------|-------------|
| `/clean all` | Manage Messages, Manage Roles | Delete recent messages in current channel |
| `/clean username` | Manage Messages, Manage Roles | Delete messages from specific user |

## Overview

The Clean system provides administrative utilities for cleaning up Discord channels by removing messages in bulk. These commands help maintain organized channels and remove unwanted content quickly.

**⚠️ Warning**: Message deletion is **permanent** and **cannot be undone**. Use these commands carefully.

---

## Commands

### `/clean all [limit]`

Delete all recent messages in the current channel.

**Syntax:**
```
/clean all [limit:<number>]
```

**Parameters:**
- `limit` (optional): Maximum number of messages to delete
  - Type: Integer
  - Default: 10
  - Range: Typically 1-100 (Discord API limits)

**Required Permissions:**
- User: `Manage Messages` **AND** `Manage Roles` permissions
- Bot: `Manage Messages`, `Read Message History`

**Examples:**
```
# Delete last 10 messages (default)
/clean all

# Delete last 25 messages
/clean all limit:25

# Delete last 50 messages
/clean all limit:50

# Delete last 100 messages
/clean all limit:100
```

**What it does:**
1. Validates user has required permissions
2. Fetches specified number of recent messages
3. Iterates through and deletes each message
4. Confirms deletion via ephemeral reply
5. Only affects the current channel

**Use Cases:**
- Clean up spam or clutter
- Remove old announcements
- Clear test messages
- Reset channel for new purpose
- Remove irrelevant discussions

**Important Notes:**
- ⚠️ **Permanent action - cannot be undone**
- Only deletes messages in the current channel
- Cannot delete messages older than 14 days (Discord limitation)
- Deleted messages are not archived
- Bot's own messages are also deleted
- Command confirmation message is ephemeral (auto-hidden)

**Limitations:**
- Discord rate limits apply (may be slow for large counts)
- Very old messages (>14 days) require different method
- Cannot delete pinned messages in some cases
- Channel webhooks messages may behave differently

**Response Format:**
```
Messages removed successfully.
```

---

### `/clean username <username> [limit]`

Delete messages from a specific user across accessible channels.

**Syntax:**
```
/clean username <username:<user>> [limit:<number>]
```

**Parameters:**
- `username` (required): User whose messages to delete
  - Type: User mention/selection
  - Select from Discord user picker
- `limit` (optional): Number of recent messages to check per channel
  - Type: Integer
  - Default: 10
  - Searches this many recent messages in each channel

**Required Permissions:**
- User: `Manage Messages` **AND** `Manage Roles` permissions
- Bot: `Manage Messages`, `Read Message History` (in all channels)

**Examples:**
```
# Delete last 10 messages from user
/clean username username:@spammer

# Delete last 50 messages from user
/clean username username:@oldaccount limit:50

# Remove messages from departed member
/clean username username:@former-member limit:25
```

**What it does:**
1. Validates user has required permissions
2. Fetches all channels in the server
3. For each text-based channel:
   - Fetches specified number of recent messages
   - Filters messages by target username
   - Deletes matching messages
4. Confirms deletion via ephemeral reply

**Use Cases:**
- Remove spam from a user across server
- Clean up after spam bot
- Remove messages from compromised account
- Delete content from banned user
- Clean up test messages from specific account

**Important Notes:**
- ⚠️ **Permanent action - cannot be undone**
- Affects **ALL channels** bot can access
- Only checks recent messages (per limit parameter)
- Cannot delete messages older than 14 days
- Does not distinguish between channels (global operation)
- May take time if server has many channels

**Scope:**
- Searches across entire server
- All channels bot has access to
- All message types (text, embeds, attachments)
- Respects channel permissions

**Safety Considerations:**
- **Very powerful command** - use with caution
- Affects all channels simultaneously
- Cannot target specific channels
- No preview or confirmation dialog
- Consider backing up important channels first

**Response Format:**
```
Messages removed successfully.
```

---

## Permission Roles

### Manage Messages
- Required Discord permission
- Allows deleting any message in channel
- Usually given to moderators
- Necessary for both commands

### Manage Roles
- Additional required Discord permission
- Provides extra authorization layer
- Typically administrator-level permission
- Prevents accidental misuse

### Bot Requirements
- Bot needs `Manage Messages` in all channels
- Bot needs `Read Message History` to fetch messages
- Bot role should be positioned appropriately
- Permissions vary per channel based on overwrites

---

## Common Workflows

### Cleaning Up After Spam

1. **Identify spam channel**
2. **Use username command** to remove spammer's messages:
   ```
   /clean username username:@spammer limit:100
   ```
3. **Ban the user** if necessary
4. **Verify cleanup** by checking channels

### Resetting a Channel

1. **Remove recent discussion**:
   ```
   /clean all limit:50
   ```
2. **Post new announcement** or rules
3. **Pin important messages**

### Removing Test Content

1. **During development/testing**:
   ```
   /clean all limit:20
   ```
2. **Or target specific test account**:
   ```
   /clean username username:@testbot limit:30
   ```

---

## Troubleshooting

### "Permission Denied" Error
- Verify you have both `Manage Messages` **AND** `Manage Roles`
- Check bot has required permissions in channel
- Ensure your role is positioned correctly in hierarchy
- Contact server administrator for permission assignment

### Not All Messages Deleted
- Messages older than 14 days cannot be bulk deleted (Discord limitation)
- Some messages may be protected (system messages, etc.)
- Rate limits may cause delays
- Pinned messages may require special handling

### Command Times Out
- Too many messages to delete in time limit
- Reduce limit parameter
- Try in smaller batches
- Check bot's API rate limit status

### Bot Cannot Delete Certain Messages
- Messages from users higher in role hierarchy
- System messages (joins, boosts, etc.)
- Messages in channels bot lacks access to
- Webhook messages (in some cases)

### Username Command Affects Wrong Channels
- Command operates across all channels by design
- Use `/clean all` in specific channel instead
- Consider more targeted moderation approach
- No way to limit to specific channels with this command

---

## Best Practices

1. **Double-Check Before Running**:
   - Verify you're in the correct channel
   - Confirm the right user is selected
   - Check the limit parameter
   - Remember deletions are permanent

2. **Start with Small Limits**:
   - Test with `limit:5` or `limit:10` first
   - Verify expected behavior
   - Scale up if needed
   - Prevents mass accidental deletion

3. **Communicate with Team**:
   - Announce before bulk deletions
   - Warn about message removal
   - Give chance to save important content
   - Document cleanup actions

4. **Use Sparingly**:
   - Regular message cleanup not always necessary
   - Discord archives automatically after inactivity
   - Consider if deletion is truly needed
   - Preserve important historical context

5. **Archive Important Channels First**:
   - Export message logs if needed
   - Save important discussions
   - Screenshot critical content
   - Cannot recover after deletion

6. **Prefer Channel-Specific Operations**:
   - Use `/clean all` in specific channel
   - Avoid server-wide username cleaning unless necessary
   - More controlled and safer
   - Easier to verify results

7. **Monitor Rate Limits**:
   - Large operations may hit Discord rate limits
   - Bot may slow down or pause
   - Allow time between bulk operations
   - Don't spam clean commands

---

## Alternative Approaches

### For Old Messages (>14 days)
- Manual deletion (one by one)
- Discord's native search and delete
- Third-party archival bots
- Channel cloning and deletion

### For Selective Cleaning
- Use Discord's built-in search
- Right-click → Delete Message
- Bulk select with Discord UI
- User-based filtering in Discord

### For Archival
- Export messages before deletion
- Use Discord data export feature
- Third-party message loggers
- Manual screenshot/copy important content

---

## Safety Guidelines

⚠️ **Critical Safety Information**:

1. **No Confirmation Dialog**: Commands execute immediately
2. **No Undo Function**: Deletions are permanent
3. **Server-Wide Scope**: Username command affects all channels
4. **Bulk Operations**: Can delete large amounts quickly
5. **Irreversible**: Cannot recover deleted messages

**Before Using Clean Commands:**
- [ ] Verify correct channel/user
- [ ] Check limit parameter
- [ ] Warn team if needed
- [ ] Archive important content
- [ ] Confirm you want permanent deletion
- [ ] Have backup/recovery plan if available

---

## Discord Limitations

### 14-Day Rule
Discord API prevents bulk deletion of messages older than 14 days. For older messages:
- Must be deleted individually
- Use Discord's UI search
- Consider channel archival instead

### Rate Limits
Discord enforces rate limits on message deletion:
- ~5 deletions per second
- Bulk operations may be slow
- Bot handles rate limiting automatically
- Large operations take time

### Permission Requirements
- Bot cannot delete messages from users with higher roles
- Cannot delete in channels bot cannot access
- Cannot delete system messages
- Cannot delete messages in locked threads (sometimes)

---

For more information, visit the [main documentation](../README.md) or [Troubleshooting Guide](../README.md#troubleshooting).

