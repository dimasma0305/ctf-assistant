# Database Scripts

This directory contains utility scripts for managing the CTF Assistant database.

## populate-db.ts

A comprehensive script to populate your database with realistic sample data for development and testing.

### Features

- 🏆 **CTF Events**: Creates sample CTF competitions from popular organizers (HackTheBox, PicoCTF, COMPFEST)
- 🎯 **Challenges**: Generates realistic challenges across multiple categories (web, crypto, pwn, forensics, etc.)
- 💾 **CTF Cache**: Populates cache entries with event metadata
- 🏅 **Sample Solves**: Creates solve records for completed challenges
- 💬 **Messages**: Adds Discord message tracking data

### Usage

```bash
# Populate database (keeps existing data)
bun run populate-db

# Or use the npm script
npm run populate-db

# Clear existing data and populate fresh
bun run populate-db:clean

# Or directly with arguments
bun run scripts/populate-db.ts --clear

# Show help
bun run scripts/populate-db.ts --help
```

### Sample Data Includes

#### CTF Events (3 events)
- **HackTheBox University CTF 2024** - Advanced jeopardy-style competition
- **PicoCTF 2024** - Educational CTF for beginners and students  
- **COMPFEST 16 CTF** - Indonesian student competition with qualification and final rounds

#### Challenges (9 challenges total)
- **Web Exploitation**: SQL injection, authentication bypass, corporate infiltration
- **Cryptography**: Classical ciphers, Caesar cipher variations
- **Binary Exploitation**: Buffer overflow challenges
- **Forensics**: Image steganography and metadata analysis
- **Reverse Engineering**: Android malware analysis
- **OSINT**: Open source intelligence gathering
- **Miscellaneous**: Beginner-friendly inspection challenges

### Database Models Populated

| Model | Description | Sample Count |
|-------|-------------|--------------|
| `Event` | CTF competition events | 3 |
| `Challenge` | Individual challenges | 9 |
| `CTFCache` | Cached event metadata | 3 |
| `Solve` | User solve records | Variable (based on solved challenges) |
| `Message` | Discord message tracking | 3 |

### Environment Requirements

Make sure your `.env` file contains:
```
MONGO_URI=mongodb://localhost:27017/ctf-assistant
```

### Output Example

```
🔌 Connecting to database...
✅ Database connected successfully
🔧 Clearing existing data...
✅ Database cleared successfully
🔧 Populating CTF Events...
✅ Created 3 CTF events
🔧 Populating Challenges...
✅ Created 9 challenges
🔧 Populating CTF Cache...
✅ Created 3 CTF cache entries
🔧 Populating Sample Solves...
✅ Created 4 solve records
🔧 Populating Sample Messages...
✅ Created 3 message records
✅ Database population completed successfully!

📊 Summary:
   Events: 3
   Challenges: 9
   Cache Entries: 3
   Solves: 4
   Messages: 3

🎉 All done! Your database is now populated with sample data.
```

### Customization

To add your own sample data, modify the arrays in the `populate-db.ts` file:
- `sampleEvents` - Add more CTF events
- `challengeCategories` - Expand challenge categories  
- `sampleUsers` - Add Discord user IDs for solve records
- Challenge generation logic in `populateChallenges()` method

### Safety Features

- ⚠️ **Clear confirmation**: `--clear` flag required to delete existing data
- 🔄 **Atomic operations**: All-or-nothing approach to data insertion
- 📊 **Detailed logging**: Verbose output shows exactly what's being created
- 🛡️ **Error handling**: Graceful failure with meaningful error messages
