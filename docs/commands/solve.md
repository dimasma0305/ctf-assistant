# Solve Commands Reference

Complete reference for challenge tracking and solve management commands.

## Command Overview

| Command | Permission | Description |
|---------|------------|-------------|
| `/solve init` | Everyone | Initialize challenges from CTF platform JSON |
| `/solve challenge` | Everyone | Mark a challenge as solved |
| `/solve delete` | Server Owner | Delete a challenge solve record |
| `/solve list` | Everyone | List all solved challenges |
| `/solve leaderboard` | Everyone | Show solve leaderboard |
| `/solve refresh` | Everyone | Refresh challenge status from platform |

## Overview

The Solve system helps teams track CTF challenge progress by:
- Importing challenges from CTF platforms automatically
- Creating dedicated threads for each challenge
- Marking challenges as solved with solver attribution
- Maintaining solve statistics and leaderboards
- Providing visual status indicators (❌ unsolved, ✅ solved)

---

## Commands

### `/solve init [fetch_command] [json_file]`

Initialize CTF challenges from platform JSON data, creating threads for organization.

**Syntax:**
```
/solve init [fetch_command:<string>] [json_file:<attachment>]
```

**Parameters:**
- `fetch_command` (optional): JavaScript fetch command for auto-updates
  - Type: String
  - Purpose: Enables automatic challenge list refresh every 5 minutes
  - Format: Valid JavaScript fetch() code returning challenge JSON
- `json_file` (optional): JSON file containing challenge data
  - Type: File attachment (.json or .txt)
  - Alternative to manual modal input
  - Faster for large challenge sets

**Required Permissions:**
- User: Standard member
- Bot: `Create Public Threads`, `Send Messages`, `Embed Links`

**Examples:**
```
# Initialize with file upload
/solve init json_file:challenges.json

# Initialize with auto-update fetch command
/solve init fetch_command:fetch('https://ctf.example.com/api/challenges').then(r=>r.json())

# Initialize with both (file takes priority)
/solve init json_file:challs.json fetch_command:fetch('https://api.example.com/challs')

# Initialize with modal (no parameters)
/solve init
```

**What it does:**
1. Accepts challenge data via three methods (priority order):
   - Uploaded JSON file
   - Fetch command execution
   - Manual modal input
2. Parses and validates JSON structure
3. Creates a thread for each challenge with format: `❌ [Category] ChallengeName`
4. Stores challenge metadata in database
5. If fetch command provided, saves it for automatic 5-minute updates
6. Marks all challenges as unsolved initially

**Expected JSON Format:**
```json
{
  "challenges": [
    {
      "name": "EasyPwn",
      "category": "Pwn",
      "points": 100,
      "description": "Buffer overflow challenge",
      "solved": false
    },
    {
      "name": "CryptoBasic",
      "category": "Crypto",
      "points": 150,
      "description": "RSA challenge"
    }
  ]
}
```

Or flat array:
```json
[
  {
    "name": "WebExploit",
    "category": "Web",
    "points": 200
  }
]
```

**Supported Platforms:**
- CTFd (standard format)
- rCTF
- CTFx
- Custom platforms (with compatible JSON)

**Use Cases:**
- Start a new CTF with automated challenge tracking
- Import challenges from CTF platform at event start
- Enable auto-sync for platforms with APIs
- Organize team collaboration with per-challenge threads

**Important Notes:**
- Must be run in a CTF event channel (configured via `/ctftime schedule`)
- Creates one thread per challenge in the current channel
- Fetch command runs every 5 minutes if provided
- JSON validation errors will show specific format issues
- Existing challenges are updated, not duplicated
- Auto-update only fetches new challenges, doesn't delete removed ones

**Fetch Command Tips:**
```javascript
// CTFd API
fetch('https://ctf.example.com/api/v1/challenges', {
  headers: {'Authorization': 'Token YOUR_TOKEN'}
}).then(r=>r.json())

// Public API
fetch('https://api.ctf.example.com/challenges').then(r=>r.json())

// With error handling
fetch('https://ctf.example.com/challs').then(r=>r.json()).catch(e=>null)
```

**Response Format:**
```
✅ Successfully initialized 45 challenges!

Created threads:
❌ [Web] SQLi Basics
❌ [Pwn] Buffer Overflow 101
❌ [Crypto] RSA Challenge
... (and 42 more)

🔄 Auto-update enabled: Challenges will refresh every 5 minutes
```

---

### `/solve challenge [players]`

Mark a challenge as solved and attribute it to team members.

**Syntax:**
```
/solve challenge [players:<mentions>]
```

**Parameters:**
- `players` (optional): Team members who solved the challenge
  - Type: String (user mentions)
  - Format: `@user1 @user2 @user3`
  - Default: Command executor if not specified
  - Multiple users can be mentioned

**Required Permissions:**
- User: Standard member
- Bot: `Manage Threads`, `Send Messages`, `Embed Links`

**Examples:**
```
# Mark as solved by yourself
/solve challenge

# Mark as solved by specific users
/solve challenge players:@alice @bob

# Mark as solved by team
/solve challenge players:@alice @bob @charlie @dave
```

**What it does:**
1. Extracts challenge info from current thread name
2. Parses mentioned users (or uses command executor)
3. Creates/updates solve record in database
4. Marks challenge as solved
5. Updates thread name from `❌` to `✅`
6. Posts congratulations embed in main channel
7. Posts status update embed in the thread
8. Updates leaderboard statistics

**Use Cases:**
- Record who solved each challenge
- Track team contribution and collaboration
- Update challenge status visually
- Generate accurate solve statistics
- Enable leaderboard tracking

**Important Notes:**
- **Must be used inside a challenge thread** (created by `/solve init`)
- Thread name format must be: `[Category] ChallengeName`
- Users are stored in database for statistics
- Can be run multiple times to update solver list
- All mentioned users get credit in leaderboards
- Non-mentioned users keep their previous credits

**Response Format (in thread):**
```
🎉 Challenge Solved!

This challenge has been marked as solved by @alice @bob
```

**Response Format (in main channel):**
```
Congratulations!

Congratulations to @alice @bob for solving the [Web] challenge SQLi Basics!
```

---

### `/solve delete`

Delete a challenge solve record and mark it as unsolved.

**Syntax:**
```
/solve delete
```

**Parameters:**
None

**Required Permissions:**
- User: **Server Owner only**
- Bot: `Manage Threads`, `Send Messages`

**Examples:**
```
# Delete solve for current challenge
/solve delete
```

**What it does:**
1. Verifies user is server owner
2. Extracts challenge info from thread
3. Finds and deletes solve record from database
4. Updates thread name from `✅` back to `❌`
5. Posts revocation notification in thread
6. Updates leaderboard statistics

**Use Cases:**
- Correct mistaken solve marks
- Remove false positive solves
- Reset challenge status for testing
- Fix data entry errors

**Important Notes:**
- **Restricted to server owner for safety**
- Must be run inside the challenge thread
- Permanently deletes the solve record
- Cannot be undone (must re-mark if mistake)
- Does NOT delete the challenge or thread itself
- Removes all associated solver attributions

**Error Messages:**
- `Only the server owner can delete solve lists.` - Non-owner attempted deletion
- `This command can only be used in a thread.` - Not executed in thread
- `This challenge solve does not exist.` - Challenge was never marked solved

**Response Format:**
```
↩️ Challenge Solve Revoked

The solve status for this challenge has been revoked by @admin
```

---

### `/solve list`

Display all solved challenges organized by category.

**Syntax:**
```
/solve list
```

**Parameters:**
None

**Required Permissions:**
- User: Standard member
- Bot: `Send Messages`, `Embed Links`

**Examples:**
```
# List all solves for current CTF
/solve list
```

**What it does:**
1. Retrieves all solve records for current CTF
2. Groups solves by challenge category
3. Sorts categories alphabetically
4. Formats with challenge names and solvers
5. Displays in embedded message
6. Shows user mentions for each solve

**Use Cases:**
- Review team progress during CTF
- See which challenges are completed
- Identify who solved what
- Generate progress reports
- Plan remaining challenge attempts

**Important Notes:**
- Must be run in a CTF event channel
- Shows only solves for the current CTF
- Categories are sorted alphabetically
- Challenges listed in solve order within categories
- Shows "No solved challenges found" if none marked
- Legacy challenges (pre-category system) show under "Legacy"

**Response Format:**
```
Solved Challenges!

[Web]
• SQLi Basics solved by @alice, @bob
• XSS Challenge solved by @charlie
• CSRF Token Bypass solved by @alice

[Pwn]
• Buffer Overflow 101 solved by @dave, @eve
• Format String Bug solved by @dave

[Crypto]
• RSA Factoring solved by @frank, @alice, @bob

[Forensics]
• Hidden Message solved by @eve

Total: 7 challenges solved
```

**Empty State:**
```
Solved Challenges!

No solved challenges found.
```

---

### `/solve leaderboard [global] [limit] [auto_update]`

Display solve leaderboard with fair scoring system.

**Syntax:**
```
/solve leaderboard [global:<boolean>] [limit:<number>] [auto_update:<boolean>]
```

**Parameters:**
- `global` (optional): Show global leaderboard across all CTFs
  - Type: Boolean
  - Default: `true`
  - `true` = all CTFs, `false` = current CTF only
- `limit` (optional): Number of top players to display
  - Type: Integer
  - Range: 1-25
  - Default: 10
- `auto_update` (optional): Enable hourly automatic updates
  - Type: Boolean
  - Default: `false`
  - Updates leaderboard message every hour

**Required Permissions:**
- User: Standard member
- Bot: `Send Messages`, `Embed Links`

**Examples:**
```
# Show global leaderboard (top 10)
/solve leaderboard

# Show current CTF leaderboard
/solve leaderboard global:false

# Show top 20 globally
/solve leaderboard limit:20

# Show top 15 with auto-updates
/solve leaderboard limit:15 auto_update:true

# Show current CTF top 5 with auto-updates
/solve leaderboard global:false limit:5 auto_update:true
```

**What it does:**
1. Retrieves solve data (global or CTF-specific)
2. Calculates scores using fair scoring system
3. Ranks players by total score
4. Formats leaderboard embed with rankings
5. If auto-update enabled:
   - Tracks message for updates
   - Refreshes every hour automatically
   - Only updates if data changes
6. Shows rank, player, score, and solve count

**Scoring System:**
- Points distributed based on first bloods and solve count
- Earlier solves worth more points
- Collaborative solves split points among contributors
- Fair algorithm prevents gaming the system
- See `FairScoringSystem` for detailed algorithm

**Use Cases:**
- Track individual player performance
- Gamify CTF participation
- Recognize top performers
- Monitor team-wide progress
- Create competitive environment
- Display live rankings in dedicated channel

**Important Notes:**
- Global leaderboard includes all historical CTFs
- CTF-specific requires command to be in CTF event channel
- Auto-update creates minimal API load (only on changes)
- Leaderboard updates immediately when challenges solved
- Score calculation is retroactive for all historical solves
- Multiple auto-update leaderboards can exist simultaneously

**Response Format:**
```
🏆 Global CTF Leaderboard

Top 10 Players Worldwide

🥇 1. @alice - 2,450 points (18 solves)
🥈 2. @bob - 2,100 points (15 solves)
🥉 3. @charlie - 1,980 points (14 solves)
4. @dave - 1,750 points (12 solves)
5. @eve - 1,620 points (13 solves)
6. @frank - 1,450 points (10 solves)
7. @grace - 1,320 points (9 solves)
8. @henry - 1,180 points (8 solves)
9. @ivy - 1,050 points (7 solves)
10. @jack - 920 points (6 solves)

Last Updated: Feb 9, 2024 10:30 AM
🔄 Auto-update: Enabled (hourly)
```

**Empty State:**
```
🏆 CTF Leaderboard

No solves recorded yet. Be the first to solve a challenge!
```

---

### `/solve refresh`

Manually refresh challenge data from CTF platform using saved fetch command.

**Syntax:**
```
/solve refresh
```

**Parameters:**
None

**Required Permissions:**
- User: Standard member
- Bot: `Create Public Threads`, `Send Messages`

**Examples:**
```
# Refresh challenges from platform
/solve refresh
```

**What it does:**
1. Retrieves saved fetch command for current CTF
2. Executes fetch to get latest challenge data
3. Compares with existing challenges
4. Creates threads for new challenges
5. Updates existing challenge metadata
6. Reports changes to user

**Use Cases:**
- Manually sync when new challenges released
- Verify auto-update is working
- Force immediate refresh after platform update
- Check for new challenge additions

**Important Notes:**
- Requires fetch command to have been set during `/solve init`
- Only works if auto-update was configured
- Safe to run multiple times (idempotent)
- Does not delete challenges removed from platform
- Updates happen automatically every 5 minutes anyway

**Error Messages:**
- `No fetch command configured for this CTF.` - Init was run without fetch command
- `Fetch command execution failed.` - Network error or invalid command
- `This channel does not have a valid CTF event associated with it.` - Not in CTF channel

**Response Format:**
```
🔄 Challenge Refresh Complete

Added: 3 new challenges
Updated: 5 existing challenges
Total: 48 challenges tracked

New challenges:
❌ [Web] Advanced XSS
❌ [Pwn] Heap Exploitation
❌ [Misc] Hidden Flag
```

---

## Permission Roles

### Everyone
- Can use all solve commands (except delete)
- Can mark challenges as solved
- Can view leaderboards and lists
- Can initialize challenges

### Server Owner
- Full access to all commands
- Can delete solve records
- Can correct mistakes
- Ultimate authority on solve data

---

## Common Workflows

### Starting a New CTF

1. **Schedule the CTF**:
   ```
   /ctftime schedule id:2584
   ```

2. **Initialize challenges**:
   ```
   /solve init json_file:challenges.json
   ```
   Or with auto-sync:
   ```
   /solve init fetch_command:fetch('https://ctf.example.com/api/challenges').then(r=>r.json())
   ```

3. **Verify setup**:
   ```
   /solve list
   ```

4. **Create leaderboard**:
   ```
   /solve leaderboard global:false auto_update:true
   ```

### During a CTF

1. **Work on challenges** in respective threads
2. **Mark solves** when completed:
   ```
   /solve challenge players:@solver1 @solver2
   ```
3. **Check progress**:
   ```
   /solve list
   ```
4. **View standings**:
   ```
   /solve leaderboard global:false
   ```

### After a CTF

1. **Review final standings**:
   ```
   /solve leaderboard global:false limit:25
   ```
2. **Archive the CTF**:
   ```
   /ctftime archive id:2584
   ```

---

## Troubleshooting

### Cannot Initialize Challenges
- Verify JSON format matches expected structure
- Check that you're in a valid CTF event channel
- Ensure bot has permission to create threads
- Try with smaller JSON file to test
- Validate JSON syntax using online validator

### Challenge Not Marked as Solved
- Must be in the challenge's thread
- Thread name must follow format: `❌ [Category] Name`
- Check bot has `Manage Threads` permission
- Verify you're mentioning users correctly with `@`

### Leaderboard Shows Wrong Scores
- Scores are calculated from all solve records
- Collaborative solves split points
- Check `/solve list` to verify solve attributions
- Scores update in real-time, refresh may be cached

### Auto-Update Not Working
- Verify fetch command was provided during init
- Check fetch command returns valid JSON
- Test fetch command in browser console first
- Review bot console logs for errors
- Ensure platform API is accessible

### Threads Not Created
- Bot needs `Create Public Threads` permission
- Channel must allow thread creation
- Check channel isn't at thread limit
- Verify bot role has necessary permissions

---

## Best Practices

1. **Use Descriptive Challenge Names**: 
   - Include category in thread name
   - Keep names concise but clear
   - Follow consistent naming convention

2. **Attribution is Important**:
   - Always mention all contributors
   - Give credit where due
   - Update solve if you forgot someone

3. **Organize by Category**:
   - JSON should include accurate categories
   - Helps with progress tracking
   - Makes `/solve list` more readable

4. **Enable Auto-Update for Long CTFs**:
   - Especially useful for multi-day events
   - Reduces manual work
   - Catches new challenges immediately

5. **Use Threads Effectively**:
   - Discuss solutions in respective threads
   - Share hints and progress
   - Keep main channel clean

6. **Regular Leaderboard Updates**:
   - Post leaderboard periodically
   - Motivates team participation
   - Tracks individual contributions

7. **Clean Data Entry**:
   - Double-check JSON format
   - Test with small subset first
   - Validate before importing large lists

---

## JSON Import Examples

### CTFd Export
```json
{
  "challenges": [
    {
      "id": 1,
      "name": "Welcome",
      "category": "Misc",
      "value": 10,
      "description": "Welcome challenge",
      "solves": 150
    }
  ]
}
```

### rCTF Export
```json
[
  {
    "name": "sanity-check",
    "category": "misc",
    "points": 1,
    "description": "Welcome to the CTF!"
  }
]
```

### Custom Format
```json
{
  "challenges": [
    {
      "title": "EasyCrypto",
      "cat": "Cryptography",
      "pts": 100
    }
  ]
}
```

**Note**: The bot attempts to parse various formats. Ensure your JSON includes at minimum: `name` and `category` fields.

---

For more information, visit the [main documentation](../README.md) or [CTFTime Commands](ctftime.md).

