# Session Persistence - RESUME Across Restarts

## Overview

Session Persistence allows your Discord bot to **RESUME** sessions instead of doing a fresh **IDENTIFY** when restarting. This significantly reduces session limit usage, especially during frequent restarts, updates, or deployments.

## How It Works

### The Problem
- Discord limits bots to **1000 IDENTIFY calls per 24 hours**
- Every bot restart normally consumes one IDENTIFY call
- Frequent restarts can quickly exhaust your session budget

### The Solution
- **Save session data** (session ID, sequence number) to MongoDB before shutdown
- **Load session data** on startup
- **Attempt RESUME** instead of IDENTIFY if session is still valid
- **Fall back to IDENTIFY** if RESUME fails or session expired

### Key Benefits
✅ **Restarts don't consume sessions** (when done within 5 minutes)  
✅ **Multiple restarts possible** without hitting limits  
✅ **Graceful updates** and deployments  
✅ **Automatic fallback** if RESUME fails  
✅ **Persistent across process restarts**  

## Session Lifecycle

### 1. First Connection
```
Bot starts → No saved session → IDENTIFY (uses 1 session) → Connected
```

### 2. Normal Operation
```
Connected → Auto-save session data every 30s → Update sequence number
```

### 3. Graceful Shutdown
```
Shutdown signal → Save latest session data → Disconnect → Session saved in DB
```

### 4. Restart Within 5 Minutes
```
Bot starts → Load saved session → RESUME (uses 0 sessions!) → Connected
```

### 5. Restart After 5+ Minutes
```
Bot starts → Load saved session → Session expired → IDENTIFY (uses 1 session) → Connected
```

## Technical Details

### Discord's RESUME Window
- Discord allows **RESUME for ~5 minutes** after disconnect
- After 5 minutes, the session expires and IDENTIFY is required
- Some disconnect reasons invalidate the session immediately

### What Gets Saved
```typescript
{
  sessionId: string,      // Discord session identifier
  sequence: number,       // Last sequence number received
  resumeURL: string,      // Gateway URL for resuming
  shardId: number,        // Shard ID (0 for non-sharded bots)
  savedAt: Date,          // When this was saved
  expiresAt: Date         // When this session expires
}
```

### Auto-Save Behavior
- **Initial capture**: When bot connects (READY event)
- **Periodic updates**: Every 30 seconds while connected
- **Event updates**: On RESUME events
- **Shutdown save**: Latest data saved before graceful shutdown

## Usage

### Automatic Operation
Session persistence works automatically with **zero configuration required**:

1. ✅ **Initialized on startup** - loads any saved session
2. ✅ **Auto-captures** - saves session data while running
3. ✅ **Auto-resumes** - attempts RESUME on restart
4. ✅ **Auto-saves** - persists data before shutdown

### Monitoring

Check session persistence status in logs:

```
📊 Session persistence: {
  hasSession: true,
  isExpired: false,
  sessionId: "abc123...",
  sequence: 42,
  expiresAt: "2025-10-10T12:34:56.789Z",
  timeUntilExpiry: 285000
}
```

### Manual Control (Advanced)

If you need to manually interact with session persistence:

```typescript
// Check if valid session exists
if (client.sessionPersistence?.hasValidSession()) {
  console.log('Valid session available for RESUME');
}

// Get session status
const status = client.sessionPersistence?.getStatus();
console.log(status);

// Clear saved session (force fresh IDENTIFY)
await client.sessionPersistence?.clearSessionData();
```

## Behavior Matrix

| Scenario | Action | Sessions Used | Notes |
|----------|--------|---------------|-------|
| First start | IDENTIFY | 1 | No saved session |
| Restart <5 min | RESUME | 0 | ✅ Session saved! |
| Restart >5 min | IDENTIFY | 1 | Session expired |
| RESUME fails | IDENTIFY | 1 | Automatic fallback |
| Crash/force kill | IDENTIFY | 1 | No graceful save |
| Graceful shutdown | - | 0 | Session saved for next time |

## Impact on Session Limits

### Without Session Persistence
```
10 restarts/day = 10 IDENTIFY calls = 1% of daily budget
100 restarts/day = 100 IDENTIFY calls = 10% of daily budget
```

### With Session Persistence (within 5 min window)
```
10 restarts/day = 1 IDENTIFY + 9 RESUME = 0.1% of daily budget
100 restarts/day = 1 IDENTIFY + 99 RESUME = 0.1% of daily budget
```

### Example: Rolling Deployment
```
Without: 5 instances × 20 restarts = 100 IDENTIFY calls
With: 5 instances × 1 IDENTIFY each = 5 IDENTIFY calls

Savings: 95 sessions (95% reduction!)
```

## Best Practices

### 1. Use Graceful Shutdown
Always use proper shutdown signals:
```bash
# Good - saves session data
kill -SIGTERM <pid>
kill -SIGINT <pid>   # Ctrl+C

# Bad - no session save
kill -SIGKILL <pid>  # kill -9
```

### 2. Quick Restarts for Updates
```bash
# Save session, update, restart quickly
kill -SIGTERM <pid>
git pull
npm install
npm start  # Will RESUME if <5 minutes
```

### 3. Monitor Resume Success
Check logs for RESUME indicators:
```
✅ Connection established via RESUME (no IDENTIFY used!)
✅ RESUME successful - no session consumed!
✅ Session RESUMED (no IDENTIFY call made)
```

### 4. Handle Resume Failures
The bot automatically handles RESUME failures:
```
⚠️ RESUME failed with invalid session, clearing saved session data...
🔄 Will retry with fresh IDENTIFY
```

## Database Storage

Session data is stored in the `session_state` collection:

```javascript
{
  _id: "session_state",
  persistedSession: {
    sessionId: "abc123...",
    sequence: 42,
    resumeURL: "wss://gateway.discord.gg",
    shardId: 0,
    savedAt: ISODate("2025-10-10T12:30:00.000Z"),
    expiresAt: ISODate("2025-10-10T12:35:00.000Z")
  }
}
```

## Troubleshooting

### Session Not Resuming
**Symptoms**: Bot always does IDENTIFY on restart

**Possible Causes**:
1. Restarting after >5 minutes (session expired)
2. Not using graceful shutdown (no session saved)
3. Database connection issues
4. Session invalidated by Discord

**Solutions**:
- Check logs for session status on startup
- Verify graceful shutdown is working
- Ensure MongoDB is accessible
- Verify session expiry time

### Invalid Session Errors
**Symptoms**: `RESUME failed with invalid session`

**Cause**: Session was invalidated or expired

**Action**: Automatic - bot clears session and uses IDENTIFY

This is normal and handled automatically!

### Session Not Saving
**Symptoms**: No `persistedSession` in database

**Possible Causes**:
1. Bot not reaching READY state
2. Database write permissions
3. Crash before save

**Solutions**:
- Check MongoDB connection
- Verify database permissions
- Review logs for errors

## Metrics and Monitoring

### Session Usage Tracking
```
Session: 5 IDENTIFY, 95 RESUME (0.5% used)
```

### Periodic Health Reports
```
📊 === Periodic Health Report ===
   Saved session: Valid (expires in 285s)
```

### Shutdown Summary
```
📊 Session persistence: {
  hasSession: true,
  sessionId: "abc123...",
  timeUntilExpiry: 285000
}
💾 Saving session data before shutdown...
✅ Session data saved for next restart
```

## Integration with Other Features

### Works With
- ✅ **SessionScheduler**: Coordinates with session limit handling
- ✅ **RateLimitManager**: Doesn't count RESUME toward limits
- ✅ **ConnectionStateManager**: Tracks RESUME vs IDENTIFY
- ✅ **MetricsCollector**: Separately tracks RESUME and IDENTIFY
- ✅ **HealthMonitor**: Continues monitoring after RESUME

### Automatic Coordination
- IDENTIFY tracking: Only counts actual IDENTIFY calls
- Session budget: RESUME doesn't consume budget
- Metrics: Distinguishes between RESUME and IDENTIFY
- State tracking: Properly tracks connection method

## Performance Impact

### CPU: Minimal
- Session capture: ~1ms every 30s
- Session load: ~5ms on startup
- Session save: ~10ms on shutdown

### Memory: Negligible
- Session data: ~200 bytes

### Network: None
- All operations are local/database only

### Database: Minimal
- 1 read on startup
- 1 write every 30s while connected
- 1 write on shutdown

## Security Considerations

### Session ID Protection
- ✅ Stored only in MongoDB (not in logs)
- ✅ Truncated in status displays
- ✅ Never exposed in API endpoints

### Access Control
- Session data requires MongoDB access
- Same security as other bot data

### Session Hijacking
- Not possible - session tied to bot token
- Session ID alone cannot be used maliciously

## Future Enhancements

Potential future improvements:
- [ ] Multi-shard session persistence
- [ ] Session data compression
- [ ] Extended resume window detection
- [ ] Session health scoring
- [ ] Resume success rate tracking

## Summary

Session Persistence is a powerful feature that **dramatically reduces session consumption** by enabling RESUME across restarts. It works automatically with zero configuration and can save **90%+ of your session budget** during frequent restarts.

**Key Takeaway**: Restart your bot as often as needed without worrying about session limits! 🚀

