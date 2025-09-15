#!/usr/bin/env bun
/**
 * Database Population Script for CTF Assistant
 * 
 * This script populates the database with sample data including:
 * - CTF Events
 * - Challenges
 * - CTF Cache entries
 * - Sample solves
 * - Sample messages
 * 
 * Usage: bun run scripts/populate-db.ts [--clear] [--help]
 */

import { connect, EventModel, ChallengeModel, solveModel, MessageModel, CTFCacheModel } from '../src/Database/connect.ts';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface PopulateOptions {
    clearData?: boolean;
    verbose?: boolean;
}

class DatabasePopulator {
    private options: PopulateOptions;

    constructor(options: PopulateOptions = {}) {
        this.options = { verbose: true, ...options };
    }

    private log(message: string) {
        if (this.options.verbose) {
            console.log(`🔧 ${message}`);
        }
    }

    private error(message: string) {
        console.error(`❌ ${message}`);
    }

    private success(message: string) {
        console.log(`✅ ${message}`);
    }

    async clearDatabase() {
        this.log('Clearing existing data...');
        
        await Promise.all([
            EventModel.deleteMany({}),
            ChallengeModel.deleteMany({}),
            solveModel.deleteMany({}),
            MessageModel.deleteMany({}),
            CTFCacheModel.deleteMany({})
        ]);
        
        this.success('Database cleared successfully');
    }

    async populateEvents() {
        this.log('Populating CTF Events...');
        
        const sampleEvents = [
            {
                _id: "67e5f1a2b3c4d5e6f7a8b9c1",
                organizer: "HackTheBox",
                description: "Premier cybersecurity competition featuring challenges in multiple categories",
                title: "HackTheBox University CTF 2024",
                url: "https://ctf.hackthebox.com",
                restrictions: ["Universitas"],
                format: ["jeopardy"],
                logo: "https://hackthebox.com/logo.png",
                timelines: [{
                    name: "Main Event",
                    discordEventId: "1234567890123456789",
                    startTime: new Date('2024-10-15T10:00:00Z'),
                    endTime: new Date('2024-10-17T18:00:00Z'),
                    location: "Online",
                    timezone: "WIB"
                }]
            },
            {
                _id: "67e5f1a2b3c4d5e6f7a8b9c2", 
                organizer: "PicoCTF",
                description: "Educational CTF designed for beginners and students",
                title: "PicoCTF 2024",
                url: "https://picoctf.org",
                restrictions: ["SMA", "SMK", "Universitas"],
                format: ["jeopardy"],
                logo: "https://picoctf.org/logo.png",
                timelines: [{
                    name: "Competition Period",
                    discordEventId: "1234567890123456790",
                    startTime: new Date('2024-09-01T00:00:00Z'),
                    endTime: new Date('2024-10-31T23:59:59Z'),
                    location: "Online",
                    timezone: "WIB"
                }]
            },
            {
                _id: "67e5f1a2b3c4d5e6f7a8b9c3",
                organizer: "COMPFEST",
                description: "Indonesia's largest student IT competition featuring CTF challenges",
                title: "COMPFEST 16 CTF",
                url: "https://compfest.id/ctf",
                restrictions: ["SMA", "SMK", "Universitas"],
                format: ["jeopardy", "attack & defense"],
                logo: "https://compfest.id/logo.png",
                timelines: [{
                    name: "Qualification Round",
                    discordEventId: "1234567890123456791",
                    startTime: new Date('2024-11-10T09:00:00Z'),
                    endTime: new Date('2024-11-10T21:00:00Z'),
                    location: "Online",
                    timezone: "WIB"
                }, {
                    name: "Final Round",
                    discordEventId: "1234567890123456792",
                    startTime: new Date('2024-11-24T08:00:00Z'),
                    endTime: new Date('2024-11-24T20:00:00Z'),
                    location: "Universitas Indonesia, Jakarta",
                    timezone: "WIB"
                }]
            }
        ];

        const events = await EventModel.insertMany(sampleEvents);
        this.success(`Created ${events.length} CTF events`);
        return events;
    }

    async populateChallenges(events: any[]) {
        this.log('Populating Challenges...');
        
        const challengeCategories = ['web', 'pwn', 'crypto', 'forensics', 'reverse', 'misc', 'osint'];
        const sampleChallenges = [];

        // Generate challenges for each event
        for (const event of events) {
            const eventChallenges = [
                // HackTheBox University CTF challenges
                ...(event.title.includes('HackTheBox') ? [
                    {
                        challenge_id: "htb_web_001",
                        name: "SQL Playground",
                        category: "web",
                        points: 100,
                        description: "Find the admin panel and extract sensitive information from this vulnerable web application.",
                        solves: 42,
                        tags: ["sql-injection", "authentication-bypass"],
                        ctf_id: event._id.toString(),
                        is_solved: false,
                        platform_data: {
                            difficulty: "easy",
                            author: "makelaris",
                            release_date: "2024-10-15"
                        }
                    },
                    {
                        challenge_id: "htb_crypto_001", 
                        name: "Ancient Cipher",
                        category: "crypto",
                        points: 150,
                        description: "Decrypt this ancient message using classical cryptography techniques.",
                        solves: 28,
                        tags: ["classical-crypto", "caesar-cipher"],
                        ctf_id: event._id.toString(),
                        is_solved: true,
                        platform_data: {
                            difficulty: "easy",
                            author: "crypto_master",
                            release_date: "2024-10-15"
                        }
                    },
                    {
                        challenge_id: "htb_pwn_001",
                        name: "Buffer Overflow Basics",
                        category: "pwn",
                        points: 200,
                        description: "Classic buffer overflow challenge. Get shell access to read the flag.",
                        solves: 15,
                        tags: ["buffer-overflow", "stack-smashing"],
                        ctf_id: event._id.toString(),
                        is_solved: false,
                        platform_data: {
                            difficulty: "medium",
                            author: "pwn_sensei",
                            release_date: "2024-10-15"
                        }
                    }
                ] : []),

                // PicoCTF challenges
                ...(event.title.includes('PicoCTF') ? [
                    {
                        challenge_id: "pico_web_beginner",
                        name: "Web Inspection",
                        category: "web", 
                        points: 50,
                        description: "Inspect this webpage to find hidden clues. Perfect for beginners!",
                        solves: 156,
                        tags: ["web-inspection", "html", "beginner"],
                        ctf_id: event._id.toString(),
                        is_solved: true,
                        platform_data: {
                            difficulty: "trivial",
                            hint: "Right-click and inspect element",
                            educational_notes: "This challenge teaches basic web inspection skills"
                        }
                    },
                    {
                        challenge_id: "pico_crypto_beginner",
                        name: "Caesar Salad",
                        category: "crypto",
                        points: 75,
                        description: "Julius Caesar would be proud of this encryption method.",
                        solves: 134,
                        tags: ["caesar-cipher", "rotation", "beginner"],
                        ctf_id: event._id.toString(),
                        is_solved: true,
                        platform_data: {
                            difficulty: "trivial",
                            hint: "Try different rotation values",
                            educational_notes: "Introduction to shift ciphers"
                        }
                    },
                    {
                        challenge_id: "pico_forensics_001",
                        name: "Hidden in Plain Sight", 
                        category: "forensics",
                        points: 100,
                        description: "Sometimes the most obvious place is the last place you look.",
                        solves: 89,
                        tags: ["steganography", "metadata", "image-analysis"],
                        ctf_id: event._id.toString(),
                        is_solved: false,
                        platform_data: {
                            difficulty: "easy",
                            file_type: "png",
                            educational_notes: "Learn about image metadata and steganography"
                        }
                    }
                ] : []),

                // COMPFEST challenges
                ...(event.title.includes('COMPFEST') ? [
                    {
                        challenge_id: "cf_web_advanced",
                        name: "Corporate Secrets",
                        category: "web",
                        points: 300,
                        description: "Infiltrate this corporate portal and extract confidential documents.",
                        solves: 12,
                        tags: ["advanced-sqli", "file-upload", "privilege-escalation"],
                        ctf_id: event._id.toString(),
                        is_solved: false,
                        platform_data: {
                            difficulty: "hard",
                            author: "compfest_team",
                            company_theme: "realistic-corporate-app"
                        }
                    },
                    {
                        challenge_id: "cf_reverse_001",
                        name: "Android Malware Analysis",
                        category: "reverse",
                        points: 250,
                        description: "Analyze this suspicious Android APK file and understand its malicious behavior.",
                        solves: 8,
                        tags: ["android", "malware", "apk-analysis"],
                        ctf_id: event._id.toString(),
                        is_solved: false,
                        platform_data: {
                            difficulty: "hard", 
                            file_type: "apk",
                            tools_needed: ["jadx", "adb", "frida"]
                        }
                    },
                    {
                        challenge_id: "cf_osint_001",
                        name: "Digital Detective",
                        category: "osint",
                        points: 175,
                        description: "Use open source intelligence to track down information about a mysterious individual.",
                        solves: 23,
                        tags: ["osint", "social-media", "geolocation"],
                        ctf_id: event._id.toString(),
                        is_solved: false,
                        platform_data: {
                            difficulty: "medium",
                            requires_external_tools: true,
                            warning: "Do not harass real individuals"
                        }
                    }
                ] : [])
            ];
            
            sampleChallenges.push(...eventChallenges);
        }

        const challenges = await ChallengeModel.insertMany(sampleChallenges);
        this.success(`Created ${challenges.length} challenges`);
        return challenges;
    }

    async populateCTFCache(events: any[]) {
        this.log('Populating CTF Cache...');
        
        const cacheEntries = events.map(event => ({
            ctf_id: event._id.toString(),
            title: event.title,
            weight: Math.floor(Math.random() * 100) + 20, // Random weight 20-119
            start: event.timelines[0]?.startTime || new Date(),
            finish: event.timelines[event.timelines.length - 1]?.endTime || new Date(),
            participants: Math.floor(Math.random() * 500) + 50, // Random participants 50-549
            organizers: [{
                id: Math.floor(Math.random() * 10000),
                name: event.organizer
            }],
            description: event.description,
            url: event.url,
            logo: event.logo,
            format: event.format[0],
            location: event.timelines[0]?.location || "Online",
            onsite: event.timelines[0]?.location !== "Online",
            restrictions: event.restrictions.join(', '),
            duration: {
                hours: Math.floor((new Date(event.timelines[0]?.endTime).getTime() - new Date(event.timelines[0]?.startTime).getTime()) / (1000 * 60 * 60)),
                days: Math.floor((new Date(event.timelines[0]?.endTime).getTime() - new Date(event.timelines[0]?.startTime).getTime()) / (1000 * 60 * 60 * 24))
            },
            cached_at: new Date(),
            last_updated: new Date()
        }));

        const cacheObjects = await CTFCacheModel.insertMany(cacheEntries);
        this.success(`Created ${cacheObjects.length} CTF cache entries`);
        return cacheObjects;
    }

    async populateSolves(challenges: any[]) {
        this.log('Populating Sample Solves...');
        
        // Sample Discord user IDs
        const sampleUsers = [
            "123456789012345678", // user1
            "234567890123456789", // user2  
            "345678901234567890", // user3
            "456789012345678901", // user4
            "567890123456789012"  // user5
        ];

        const sampleSolves = [];
        
        // Create solves for some challenges (particularly easier ones)
        const solvedChallenges = challenges.filter(c => c.is_solved || c.points <= 100);
        
        for (const challenge of solvedChallenges) {
            const numSolvers = Math.min(Math.floor(Math.random() * 3) + 1, sampleUsers.length);
            const solvers = sampleUsers.slice(0, numSolvers);
            
            const solve = {
                ctf_id: challenge.ctf_id,
                users: solvers,
                challenge_ref: challenge._id,
                challenge: challenge.name,
                category: challenge.category,
                solved_at: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)) // Random time in last week
            };
            
            sampleSolves.push(solve);
        }

        if (sampleSolves.length > 0) {
            const solves = await solveModel.insertMany(sampleSolves);
            this.success(`Created ${solves.length} solve records`);
            return solves;
        } else {
            this.log('No solves to create');
            return [];
        }
    }

    async populateMessages(events: any[]) {
        this.log('Populating Sample Messages...');
        
        const sampleMessages = events.map((event, index) => ({
            ctfEventId: event._id.toString(),
            messageId: `1234567890123456${790 + index}`,
            channelId: "987654321098765432",
            guildId: "876543210987654321",
            expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Expire in 24 hours
        }));

        const messages = await MessageModel.insertMany(sampleMessages);
        this.success(`Created ${messages.length} message records`);
        return messages;
    }

    async populateAll() {
        try {
            this.log('Starting database population...');
            
            if (this.options.clearData) {
                await this.clearDatabase();
            }

            // Populate in dependency order
            const events = await this.populateEvents();
            const challenges = await this.populateChallenges(events);
            const cacheEntries = await this.populateCTFCache(events);
            const solves = await this.populateSolves(challenges);
            const messages = await this.populateMessages(events);

            this.success('Database population completed successfully!');
            this.log('\n📊 Summary:');
            this.log(`   Events: ${events.length}`);
            this.log(`   Challenges: ${challenges.length}`);
            this.log(`   Cache Entries: ${cacheEntries.length}`);
            this.log(`   Solves: ${solves.length}`);
            this.log(`   Messages: ${messages.length}`);

        } catch (error) {
            this.error(`Population failed: ${error}`);
            throw error;
        }
    }
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
CTF Assistant Database Population Script

Usage: bun run scripts/populate-db.ts [options]

Options:
  --clear     Clear existing data before populating
  --help, -h  Show this help message

Examples:
  bun run scripts/populate-db.ts              # Populate with existing data
  bun run scripts/populate-db.ts --clear      # Clear and populate fresh data
        `);
        process.exit(0);
    }

    const options: PopulateOptions = {
        clearData: args.includes('--clear'),
        verbose: true
    };

    try {
        // Connect to database
        console.log('🔌 Connecting to database...');
        await connect();
        console.log('✅ Database connected successfully');

        // Run population
        const populator = new DatabasePopulator(options);
        await populator.populateAll();
        
        console.log('\n🎉 All done! Your database is now populated with sample data.');
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    } finally {
        // Close database connection
        process.exit(0);
    }
}

// Run if called directly
if (import.meta.main) {
    main();
}

export default DatabasePopulator;
