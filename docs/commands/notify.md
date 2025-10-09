# Notify Commands Reference

Complete reference for the Notify (formerly Mabar) notification system commands.

## Command Overview

| Command | Permission | Description |
|---------|------------|-------------|
| `/notify register` | Mabar Manager | Register channel for CTF notifications |
| `/notify unregister` | Mabar Manager | Unregister channel from notifications |
| `/notify list` | Mabar Manager, Gas Mabar | List all registered notification channels |

## Overview

The Notify system allows you to register Discord channels to receive automated notifications about CTF activities, including:
- **Weekly Reminders**: Regular updates about upcoming CTFs (Fridays at 8 AM SGT)
- **CTF Announcements**: New CTF event scheduling notifications
- **Solve Updates**: Challenge solve notifications
- **Event Created**: Discord scheduled event creation notifications
- **All Events**: Subscribe to all notification types

---

## Commands

### `/notify register [channel] [event_type]`

Register a Discord channel to receive automated CTF notifications.

**Syntax:**
```
/notify register [channel:<channel>] [event_type:<type>]
```

**Parameters:**
- `channel` (optional): The channel to register
  - Type: Text Channel
  - Default: Current channel
  - Must be a valid text channel
- `event_type` (optional): Type of notifications to receive
  - Default: `weekly_reminder`
  - Choices:
    - `weekly_reminder` - Weekly CTF reminders (Fridays 8 AM SGT)
    - `ctf_announcement` - New CTF schedule notifications
    - `solve_update` - Challenge solve notifications
    - `event_created` - Discord event creation notifications
    - `all` - All notification types

**Required Permissions:**
- User: `Mabar Manager` role
- Bot: `Send Messages`, `View Channel`

**Examples:**
```
# Register current channel for weekly reminders
/notify register

# Register specific channel for weekly reminders
/notify register channel:#announcements

# Register for CTF announcements only
/notify register event_type:ctf_announcement

# Register for solve updates in a specific channel
/notify register channel:#solves event_type:solve_update

# Register for all notification types
/notify register channel:#ctf-feed event_type:all
```

**What it does:**
1. Validates the target channel is a text channel
2. Checks if channel is already registered
3. If already registered:
   - Updates event subscription types (adds new types to existing ones)
   - Reactivates if previously deactivated
4. If not registered:
   - Creates new registration in database
   - Sets up notification preferences
   - Saves registration metadata (registered by, timestamp)
5. Confirms registration with details

**Use Cases:**
- Set up dedicated announcement channels for CTF updates
- Receive weekly reminders about upcoming competitions
- Get notified when team members solve challenges
- Create separate channels for different notification types
- Centralize all CTF notifications in one feed channel

**Important Notes:**
- Channels can be registered multiple times with different event types
- Using `event_type:all` subscribes to all four notification types
- Weekly reminders are sent every Friday at 8:00 AM Singapore Time (SGT)
- You can update subscriptions by running register again on the same channel
- Channel registration persists even if bot restarts

**Response Format:**
```
✅ Successfully registered #channel-name to receive CTF mabar notifications!

📢 Subscribed to:
• weekly reminder
• ctf announcement

📅 Weekly reminders will be sent every Friday at 8 AM (SGT)
```

---

### `/notify unregister [channel]`

Unregister a channel from receiving CTF notifications.

**Syntax:**
```
/notify unregister [channel:<channel>]
```

**Parameters:**
- `channel` (optional): The channel to unregister
  - Type: Text Channel
  - Default: Current channel
  - Must be a currently registered channel

**Required Permissions:**
- User: `Mabar Manager` role
- Bot: N/A (no special permissions needed)

**Examples:**
```
# Unregister current channel
/notify unregister

# Unregister specific channel
/notify unregister channel:#announcements

# Unregister old CTF feed channel
/notify unregister channel:#old-ctf-feed
```

**What it does:**
1. Validates the target channel exists
2. Searches for channel registration in database
3. Checks if channel is currently active
4. Performs soft delete (marks as inactive, preserves history)
5. Confirms unregistration
6. Logs the action for audit purposes

**Use Cases:**
- Stop notifications in retired channels
- Temporarily disable notifications for a channel
- Clean up old registration configurations
- Reorganize notification channels

**Important Notes:**
- This performs a "soft delete" - registration data is preserved but marked inactive
- Channel can be re-registered later using `/notify register`
- Existing scheduled notifications will no longer be sent
- Does NOT delete the Discord channel itself, only unregisters it from notifications

**Error Messages:**
- `⚠️ Channel #channel-name is not registered for notifications!` - Channel was never registered
- `⚠️ Channel #channel-name is already inactive!` - Channel was already unregistered
- `❌ Please specify a valid text channel!` - Invalid channel provided

**Response Format:**
```
✅ Successfully unregistered #channel-name from CTF mabar notifications!

This channel will no longer receive automated CTF mabar updates.
```

---

### `/notify list`

View all registered notification channels in the current server.

**Syntax:**
```
/notify list
```

**Parameters:**
None

**Required Permissions:**
- User: `Mabar Manager` or `Gas Mabar` role
- Bot: `Embed Links`

**Examples:**
```
# List all registered channels
/notify list
```

**What it does:**
1. Retrieves all channel registrations for the current server
2. Fetches Discord channel information for each registration
3. Calculates notification statistics
4. Formats data into an organized embed
5. Shows active and inactive registrations
6. Displays notification history

**Displayed Information:**
For each registered channel:
- **Channel**: Mention link (or strikethrough if deleted)
- **Status**: Active (✅) or Inactive (❌)
- **Event Types**: Comma-separated list of subscribed notifications
- **Registered By**: User who created the registration
- **Registered On**: Date of registration
- **Notifications Sent**: Total count (if available)
- **Last Sent**: Date of last notification (if any)

**Use Cases:**
- Audit notification channel configurations
- Review which channels receive what notifications
- Check notification delivery statistics
- Identify inactive or deleted channels
- Verify registration setup after configuration changes

**Important Notes:**
- Shows all registrations, both active and inactive
- Deleted channels are displayed with strikethrough text
- Results are sorted by creation date (newest first)
- Statistics may not be available for newly registered channels
- Command response is ephemeral (only visible to you)

**Empty State Response:**
```
📭 No channels are registered for mabar notifications in this server.

Use `/notify register` to register a channel!
```

**Response Format (with registrations):**
```
📢 Registered Mabar Notification Channels

Found 3 registered channel(s) in this server

#announcements
Status: ✅ Active
Event Types: weekly reminder, ctf announcement
Registered By: @username
Registered On: Jan 15, 2024
Notifications Sent: 12
Last Sent: Feb 9

#solves
Status: ✅ Active
Event Types: solve update
Registered By: @admin
Registered On: Jan 20, 2024
Notifications Sent: 45
Last Sent: Feb 8

~~#old-feed~~ (deleted)
Status: ❌ Inactive
Event Types: all
Registered By: @username
Registered On: Dec 1, 2023
```

---

## Notification Types Explained

### Weekly Reminder
- **Schedule**: Every Friday at 8:00 AM Singapore Time (SGT)
- **Content**: Upcoming CTFs for the next 7 days
- **Purpose**: Help teams plan their week
- **Format**: Embed with CTF list, dates, and CTFTime links

### CTF Announcement
- **Trigger**: When a new CTF is scheduled via `/ctftime schedule`
- **Content**: CTF details, signup information, channel links
- **Purpose**: Notify team about new opportunities
- **Format**: Embed with event details and role mention

### Solve Update
- **Trigger**: When a challenge is marked as solved
- **Content**: Challenge name, category, solver(s)
- **Purpose**: Celebrate team achievements
- **Format**: Embed with congratulations and solver mentions

### Event Created
- **Trigger**: When a Discord scheduled event is created
- **Content**: Event details, start time, description
- **Purpose**: Keep team informed about scheduled activities
- **Format**: Embed with event information

---

## Permission Roles

### Mabar Manager
- Full access to all notify commands
- Can register and unregister channels
- Can view notification statistics
- Typically assigned to team administrators

### Gas Mabar
- Can view registered channels (`/notify list`)
- Cannot modify registrations
- Suitable for team coordinators

### Everyone
- Cannot access notify commands
- Will receive notifications in registered channels
- Can see notification messages

---

## Common Workflows

### Setting Up Notification System

1. **Create dedicated channels**:
   - `#ctf-announcements` for CTF schedules
   - `#weekly-reminders` for Friday updates
   - `#solves` for challenge completions

2. **Register channels**:
   ```
   /notify register channel:#ctf-announcements event_type:ctf_announcement
   /notify register channel:#weekly-reminders event_type:weekly_reminder
   /notify register channel:#solves event_type:solve_update
   ```

3. **Verify setup**:
   ```
   /notify list
   ```

4. **Test notifications**:
   - Wait for next Friday for weekly reminders
   - Schedule a test CTF for announcement test
   - Mark a challenge solved for solve update test

### Updating Notification Preferences

To add more notification types to an existing channel:
```
# Channel already registered for weekly_reminder
# Add ctf_announcement without losing weekly_reminder
/notify register channel:#feed event_type:ctf_announcement
```

The bot will merge the event types automatically.

### Reorganizing Notification Channels

1. **Unregister old channels**:
   ```
   /notify unregister channel:#old-announcements
   /notify unregister channel:#old-feed
   ```

2. **Register new channels**:
   ```
   /notify register channel:#new-ctf-hub event_type:all
   ```

3. **Verify changes**:
   ```
   /notify list
   ```

---

## Troubleshooting

### "Permission Denied" Error
- Verify you have `Mabar Manager` role
- Check role hierarchy (your role should be properly assigned)
- Contact server administrator for role assignment

### Notifications Not Received
1. **Check registration status**:
   ```
   /notify list
   ```
2. **Verify channel is active** (✅ Active status)
3. **Check event type subscription** matches the expected notification
4. **Ensure bot has permissions** in the channel:
   - View Channel
   - Send Messages
   - Embed Links
5. **Wait for next scheduled time** (weekly reminders only send on Fridays)

### Channel Shows as "deleted"
- Channel was deleted from Discord but registration remains
- Unregister the deleted channel to clean up:
  ```
  /notify unregister channel:#deleted-channel-name
  ```

### Cannot Register Channel
- Ensure you're selecting a **text channel**, not voice/category/forum
- Check bot has access to view and send messages in the channel
- Verify channel exists and you have permission to access it

### Duplicate Notifications
- Channel may be registered multiple times with overlapping event types
- Review with `/notify list`
- Unregister and re-register with correct event types

---

## Best Practices

1. **Separate Channels by Purpose**: 
   - Don't mix all notifications in one channel
   - Use dedicated channels for different notification types
   - Makes it easier for team members to follow relevant updates

2. **Use Descriptive Channel Names**:
   - `#ctf-announcements` instead of `#general`
   - `#weekly-ctf-reminders` instead of `#reminders`
   - Clear names help team understand channel purpose

3. **Register with Specific Event Types**:
   - Avoid using `event_type:all` unless you want a complete feed
   - Targeted notifications reduce noise
   - Team members can subscribe to channels matching their interests

4. **Regular Audits**:
   - Run `/notify list` monthly to review configurations
   - Clean up inactive or deleted channels
   - Update registrations as team needs change

5. **Document Your Setup**:
   - Keep notes on which channels receive what notifications
   - Share notification schedule with team
   - Include notification info in channel topics/descriptions

6. **Test Before Going Live**:
   - Register a test channel first
   - Verify notifications arrive as expected
   - Adjust event types based on team feedback

7. **Timezone Awareness**:
   - Weekly reminders are sent at 8 AM SGT
   - Convert to your team's timezone for planning
   - Consider team members in different timezones

---

## Database Schema

Notification registrations are stored with the following data:

- `guild_id`: Discord server ID
- `channel_id`: Discord channel ID
- `guild_name`: Server name (for reference)
- `channel_name`: Channel name (for reference)
- `is_active`: Active/inactive status
- `registered_by`: User ID who created registration
- `event_types`: Array of subscribed notification types
- `created_at`: Registration timestamp
- `updated_at`: Last modification timestamp
- `last_notification_sent`: Timestamp of last notification
- `notification_count`: Total notifications sent

This data is used for notification delivery, statistics, and audit purposes.

---

For more information, visit the [main documentation](../README.md) or [CTFTime Commands](ctftime.md).

