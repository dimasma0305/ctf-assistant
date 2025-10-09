# Event Commands Reference

Complete reference for CTF event form generation commands.

## Command Overview

| Command | Permission | Description |
|---------|------------|-------------|
| `/event gen` | Manage Events | Generate CTF event registration form link |

## Overview

The Event system provides a web-based form interface for creating and managing CTF events through an external portal. This allows team members to submit CTF event details through a user-friendly form that integrates with the bot's database.

---

## Commands

### `/event gen`

Generate a unique link to the CTF event registration form.

**Syntax:**
```
/event gen
```

**Parameters:**
None

**Required Permissions:**
- User: `Manage Events` permission
- Bot: `Send Messages`

**Examples:**
```
# Generate event form link
/event gen
```

**What it does:**
1. Creates a new event record in the database
2. Generates a unique event ID
3. Constructs a public URL to the event form
4. Returns the link for sharing
5. Form can be filled out via web browser

**Generated URL Format:**
```
https://assistant.1pc.tf/event/[unique-id]
```

**Use Cases:**
- Create CTF events via user-friendly web interface
- Allow non-technical members to submit event details
- Pre-fill event information before scheduling
- Collect event details asynchronously
- Share form with team members for collaborative input

**Important Notes:**
- Link is unique per generation (each `/event gen` creates new ID)
- Form data is stored in the database
- Forms can be accessed by anyone with the link
- Event data can be used later for bot commands
- URL is ephemeral - only visible to command executor

**Web Form Features:**
The generated form typically includes fields for:
- Event name and title
- Organizer information
- Event description
- Timeline and schedule
- Event URL and resources
- Format (Jeopardy, Attack-Defense, etc.)
- Restrictions and requirements

**Response Format:**
```
https://assistant.1pc.tf/event/65abc123def456789
```

---

## Permission Roles

### Manage Events
- Discord permission required to generate forms
- Typically assigned to:
  - Server administrators
  - Event coordinators
  - Team leaders
- Ensures only authorized members create event entries

### Everyone
- Can fill out forms if they have the link
- Cannot generate new form links
- Forms are publicly accessible once created

---

## Common Workflows

### Creating a CTF Event via Form

1. **Generate form link**:
   ```
   /event gen
   ```

2. **Share link with team member responsible for details**:
   - Copy the generated URL
   - Send via DM or private channel
   - Team member fills out form with event details

3. **Form data is saved to database automatically**

4. **Use the event data** in other bot commands or dashboards

### Quick Event Registration

1. **Generate link**:
   ```
   /event gen
   ```

2. **Open link in browser**

3. **Fill out event details**:
   - Title, organizer, description
   - Start/end dates
   - Format and restrictions
   - Event URLs

4. **Submit form**

5. **Event data is now available** in the bot's system

---

## Troubleshooting

### "Permission Denied" Error
- Verify you have `Manage Events` permission in Discord
- Check with server administrator
- Ensure bot has registered the permission correctly

### Form Link Not Working
- Verify the PUBLIC_URL environment variable is configured
- Check that the web interface is running
- Ensure the URL is copied completely
- Try generating a new link

### Form Data Not Appearing
- Check database connection is active
- Verify form was submitted successfully
- Look for confirmation message on form submission
- Review bot console logs for database errors

### Cannot Access Form Page
- Ensure the web service (UI) is running
- Check if URL includes the full path with event ID
- Verify no firewall blocking the PUBLIC_URL domain
- Try a different browser or clear cache

---

## Best Practices

1. **Keep Links Private for Internal Events**:
   - Don't share publicly if event is internal
   - Use Discord DMs or private channels
   - Consider access controls for sensitive data

2. **Generate Fresh Links**:
   - Each form submission should use a new link
   - Don't reuse links for different events
   - Old links may have stale data

3. **Verify Form Submission**:
   - Check database after submission
   - Confirm data appears correctly
   - Re-submit if issues occur

4. **Coordinate with Team**:
   - Assign form filling to knowledgeable member
   - Include all necessary event details
   - Double-check information before submitting

5. **Use for Complex Events**:
   - Form is easier than command parameters for detailed events
   - Better for events with lots of metadata
   - Useful when information isn't readily available

---

## Technical Details

### Environment Configuration

The command relies on the `PUBLIC_URL` environment variable:

```env
PUBLIC_URL=https://assistant.1pc.tf/
```

This URL should point to the running web UI service that hosts the event forms.

### Database Schema

Event records are stored in the `EventModel` with fields:
- Unique event ID
- Title and organizer
- Description
- Timelines (array of schedule entries)
- Format and restrictions
- URLs and resources
- Timestamps

### Integration Points

- **Web UI**: Renders the form interface
- **Database**: Stores event submissions
- **Bot Commands**: Can reference stored events
- **API**: Provides data for dashboards

---

## Future Enhancements

Potential improvements to the event system:

- **Edit Links**: Generate links to edit existing events
- **Preview**: Show event details before final submission
- **Templates**: Pre-fill common event types
- **Validation**: Real-time form validation
- **Notifications**: Alert when forms are submitted
- **Authentication**: Restrict form access to team members

---

For more information, visit the [main documentation](../README.md) or [CTFTime Commands](ctftime.md).

