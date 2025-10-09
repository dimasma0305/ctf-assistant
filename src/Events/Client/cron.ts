import { APIEmbed, BaseGuildTextChannel, ChannelType } from "discord.js";
import { Event } from "../../Handlers/eventHandler"
import { MyClient } from "../../Model/client";
import cron from "node-cron"
import { getUpcommingOnlineEvent } from "../../Functions/ctftime-v2";
import { scheduleEmbedTemplate } from "../../Commands/Public/Ctftime/utils/event";
import { createCTFTimeHelpEmbed } from "../../Commands/Public/Ctftime/utils/helpEmbed";
import { openai } from "../../utils/openai";
import { GuildChannelModel } from "../../Database/connect";

// Template messages as fallback when OpenAI is unavailable
const mabarMessageTemplates = [
    "Haiii <@663394727688798231>! Yuk, besok kita mabar CTF lagi dong!",
    "Halo teman-teman! Besok ada mabar CTF kan nih, <@663394727688798231> jangan lupa prepare ya!",
    "Halo semua! 🌞 Ada mabar CTF besok? Ayo dong, <@663394727688798231> mabar...",
    "Heyyy <@663394727688798231>! Besok ada plan mabar CTF kan?!",
    "Besok kita mabar CTF ya <@663394727688798231> yaa!",
    "Hello! 🌼 Besok ada kesempatan mabar CTF lagi kan? <@663394727688798231>",
    "Aloha <@663394727688798231>! 🌺 Besok kita main CTF bareng lagi ya!?",
    "Yuk yuk yuk! 🎉 Besok mabar CTF, <@663394727688798231>",
    "Hai! Jangan lupa besok prepare mabar CTF, aku tunggu <@663394727688798231>!",
    "Besok jangan lupa mabar CTF, <@663394727688798231> ayo dim gasskan!",
    "Hey <@663394727688798231>! Siap-siap buat besok mabar CTF ya!",
    "Hola <@663394727688798231>! 🌟 Kita seru-seruan mabar CTF besok!",
    "Hey squad! Besok ada mabar CTF, siap-siap ya <@663394727688798231>!",
    "Oi <@663394727688798231>! Jangan lupa besok mabar CTF bareng kita!",
    "Cek-cek <@663394727688798231>! Siap-siap buat besok mabar CTF yuk!",
    "Besok ada mabar CTF nih, <@663394727688798231> siap-siap yaa!",
    "Hei <@663394727688798231>! Jangan lupa prepare buat mabar CTF besok!",
    "Hello team! 🌟 <@663394727688798231> yuk besok kita mabar CTF lagi!",
    "Ayo dong <@663394727688798231>, besok mabar CTF bareng lagi!",
    "Hi hi! 🌼 <@663394727688798231> jangan lupa besok kita mabar CTF!"
];


// Function to generate dynamic mabar messages using OpenAI with template fallback
async function generateMabarMessage(): Promise<string> {
    try {
        const completion = await openai.chat.completions.create({
            model: 'deepseek-reasoner',
            messages: [
                {
                    role: 'system',
                    content: 'You are Hackerika, an AI companion for the TCP1P Community. Generate a friendly, enthusiastic message in Indonesian to remind people about tomorrow\'s CTF competition (mabar CTF). The message should mention <@663394727688798231> and be casual, fun, and encouraging. Use varied greetings and expressions. Only return the message, nothing else. Use Indonesian language.'
                },
                {
                    role: 'user',
                    content: 'Generate a reminder message for tomorrow\'s CTF competition (mabar CTF) in Indonesian language'
                }
            ],
            max_tokens: 1000,
            temperature: 0.9,
            n: 1,
        });

        const aiMessage = completion.choices[0].message.content;
        if (aiMessage && aiMessage.trim().length > 0) {
            console.log('✅ Generated dynamic mabar message with OpenAI');
            return aiMessage;
        } else {
            throw new Error('Empty response from OpenAI');
        }
    } catch (error) {
        console.error('❌ Error generating mabar message with OpenAI:', error);
        
        // Check if it's a token limit error
        if (error instanceof Error && (
            error.message.includes('quota') || 
            error.message.includes('limit') || 
            error.message.includes('token') ||
            error.message.includes('rate')
        )) {
            console.log('🔄 OpenAI token/rate limit reached, using template fallback');
        } else {
            console.log('🔄 OpenAI unavailable, using template fallback');
        }
        
        // Fallback to random template message
        const randomTemplate = mabarMessageTemplates[Math.floor(Math.random() * mabarMessageTemplates.length)];
        console.log('📝 Using template message as fallback');
        return randomTemplate;
    }
}

export const event: Event = {
    name: "LoadCrontEvent",
    once: true,
    async execute(client: MyClient) {
        // Schedule the cron job to run every Friday at 8 AM Singapore time
        cron.schedule("0 8 * * 5", async() => {
            console.log("🕐 Running scheduled CTF notification job...");
            
            try {
                // Get all active registered channels from the database
                const registeredChannels = await GuildChannelModel.find({ is_active: true });
                
                if (registeredChannels.length === 0) {
                    console.log("📭 No active channels registered for notifications");
                    return;
                }

                console.log(`📢 Found ${registeredChannels.length} registered channel(s)`);

                // Generate dynamic message and fetch upcoming events
                const dynamicMessage = await generateMabarMessage();
                const events = await getUpcommingOnlineEvent(5);
                const embedsSend: Array<APIEmbed> = [];

                for (let i = 0; i < events.length; i++) {
                    const data = events[i];
                    embedsSend.push(scheduleEmbedTemplate({
                        ctfEvent: data,
                    }));
                }

                // Send messages to all registered channels that have weekly_reminder enabled
                for (const registration of registeredChannels) {
                    try {
                        // Check if this channel is subscribed to weekly_reminder events
                        const eventTypes = registration.event_types || ["weekly_reminder"];
                        if (!eventTypes.includes("weekly_reminder")) {
                            console.log(`⏭️ Skipping ${registration.guild_name} / ${registration.channel_name} - not subscribed to weekly_reminder`);
                            continue;
                        }

                        // Fetch the guild and channel
                        const guild = await client.guilds.fetch(registration.guild_id).catch(() => null);
                        if (!guild) {
                            console.log(`⚠️ Guild not found: ${registration.guild_name} (${registration.guild_id})`);
                            continue;
                        }

                        const channel = await guild.channels.fetch(registration.channel_id).catch(() => null);
                        if (!channel || !(channel instanceof BaseGuildTextChannel)) {
                            console.log(`⚠️ Channel not found or not a text channel: ${registration.channel_name} in ${registration.guild_name}`);
                            continue;
                        }

                        // Send the messages
                        await channel.send(dynamicMessage);
                        
                        if (embedsSend.length > 0) {
                            await channel.send("Ini ya mas daftar CTF minggu ini:");
                            await channel.send({ embeds: embedsSend });
                        } else {
                            await channel.send("Waduh ternyata nda ada CTF minggu ini :(");
                        }

                        // Send help message to guide participants
                        const helpEmbed = createCTFTimeHelpEmbed();
                        await channel.send("📖 **Panduan Penggunaan Bot CTF:**");
                        await channel.send({ embeds: [helpEmbed] });

                        // Update tracking information in the database
                        registration.last_notification_sent = new Date();
                        registration.last_event_type_triggered = "weekly_reminder";
                        registration.notification_count = (registration.notification_count || 0) + 1;
                        registration.updated_at = new Date();
                        await registration.save();

                        console.log(`✅ Sent notifications to: ${guild.name} / ${channel.name} (weekly_reminder #${registration.notification_count})`);
                    } catch (error) {
                        console.error(`❌ Error sending to ${registration.guild_name} / ${registration.channel_name}:`, error);
                    }
                }

                console.log("✅ Scheduled CTF notification job completed");
            } catch (error) {
                console.error("❌ Error in scheduled CTF notification job:", error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Singapore"
        });

        console.log("✅ CTF notification cron job loaded successfully");
    },
}
