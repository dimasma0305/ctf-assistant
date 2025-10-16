# Trakteer Integration

This module integrates Trakteer API with the Discord bot to automatically post notifications when someone supports you on Trakteer.

## Features

- **Automatic notifications**: Get Discord notifications when you receive new supports on Trakteer
- **Real-time updates**: Checks for new supports every 5 minutes
- **Rich embeds**: Beautiful Discord embeds showing supporter info, message, amount, and payment method
- **Easy setup**: Simple slash commands to configure and manage the integration

## Commands

### `/trakteer setup`
Set up Trakteer integration for your server.

**Required Parameters:**
- `channel`: The text channel where Trakteer notifications will be posted
- `api_key`: Your Trakteer API key (get it from https://trakteer.id/settings/integrations)

**Permissions Required:** Administrator

**Example:**
```
/trakteer setup channel:#donations api_key:trapi-xxx
```

### `/trakteer status`
Check the current status of Trakteer integration.

Shows:
- Whether the integration is active
- Configured notification channel
- Current Trakteer balance
- Last check time

### `/trakteer disable`
Disable Trakteer integration for the server.

**Permissions Required:** Administrator

## How It Works

1. **Setup**: Administrator runs `/trakteer setup` with a channel and API key
2. **Validation**: The bot validates the API key by making a test request
3. **Monitoring**: Every 5 minutes, the bot checks for new supports via Trakteer API
4. **Notification**: When new supports are detected, the bot posts them to the configured channel

## API Integration

The bot uses the following Trakteer API endpoints:

- `GET /v1/public/current-balance` - Get current balance (used for status checks)
- `GET /v1/public/supports?include=payment_method,order_id` - Get support history

### API Headers
```javascript
{
  "key": "YOUR_API_KEY",
  "Accept": "application/json",
  "X-Requested-With": "XMLHttpRequest"
}
```

## Database Schema

The integration stores configuration in MongoDB:

```typescript
{
  guild_id: string,           // Discord server ID
  channel_id: string,         // Channel for notifications
  api_key: string,            // Trakteer API key
  is_active: boolean,         // Whether integration is active
  last_checked: Date,         // Last time API was checked
  last_support_id: string,    // Order ID of last processed support
  created_at: Date,
  updated_at: Date
}
```

## Notification Format

When a new support is received, the bot sends an embed with:

- 🎉 Title: "New Trakteer Support!"
- Supporter name (or "Anonymous")
- Support message
- Amount (in Rupiah)
- Quantity and unit name (e.g., "2x Kopi")
- Payment method (if available)
- Status indicator (✅ success, ⏳ pending, ❌ failed, 🔄 refund)
- Timestamp

## Cron Job

The Trakteer monitoring runs as a cron job (`trakteerCron.ts`):

- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- **Timezone**: Asia/Singapore
- **Startup**: Also runs 10 seconds after bot startup

## Getting Your API Key

1. Go to https://trakteer.id
2. Navigate to Settings → Integrations → Public API
3. Copy your API key (starts with `trapi-`)
4. Use it in the `/trakteer setup` command

## Security Notes

- API keys are stored securely in MongoDB
- Only administrators can set up or modify the integration
- Setup command responses are ephemeral (only visible to the user)
- API key validation is performed before saving

## Error Handling

The integration includes comprehensive error handling:

- Invalid API keys are rejected during setup
- Failed API requests are logged but don't crash the bot
- Missing channels are skipped silently
- Network errors are caught and logged

## Development

### Files Structure

```
src/
├── Commands/Public/Trakteer/
│   ├── trakteer.ts       # Main command definition
│   ├── setup.ts          # Setup subcommand
│   ├── status.ts         # Status subcommand
│   └── disable.ts        # Disable subcommand
├── Database/
│   ├── trakteerSchema.ts # MongoDB schema
│   └── connect.ts        # Updated with TrakteerModel
└── Events/Client/
    └── trakteerCron.ts   # Cron job for periodic checks
```

### Testing

To test the integration:

1. Set up a test Trakteer account
2. Get your API key
3. Run `/trakteer setup` in a test Discord server
4. Make a test support on Trakteer
5. Wait up to 5 minutes for the notification

## Troubleshooting

**No notifications appearing:**
- Check `/trakteer status` to verify integration is active
- Ensure the bot has permission to send messages in the configured channel
- Verify API key is valid
- Check bot logs for errors

**API key validation fails:**
- Ensure you copied the full API key including the `trapi-` prefix
- Check that your API key is active on Trakteer
- Verify you have an active Trakteer account

**Duplicate notifications:**
- The bot uses `order_id` to track which supports have been sent
- If database is reset, old supports may be re-sent
- This is expected behavior after database resets

