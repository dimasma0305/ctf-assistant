import { config } from "dotenv";
import db from "./Database/connect";
config();

const { TOKEN, OPENAI_API_KEY } = process.env;

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
} from "discord.js";

import { MyClient } from "./Model/client";
import OpenAI from "openai";

const openai = new OpenAI({
  "apiKey": OPENAI_API_KEY
})

const {
  Guilds,
  GuildMembers,
  GuildMessages,
  GuildMessageReactions,
  MessageContent,
  DirectMessages,
} = GatewayIntentBits;

const { User, Message, GuildMember, Channel } = Partials;

const client = new Client({
  intents: [Guilds, GuildMembers, GuildMessages, GuildMessageReactions, MessageContent, DirectMessages],
  partials: [User, Message, GuildMember, Channel],
}) as MyClient;

client.events = new Collection();
client.commands = new Collection();
client.subCommands = new Collection();

if (!process.env.NODB){
  db.connect()
}
client.on(Events.Debug, (message) => {
    console.log(message)
})

client.login(TOKEN);

// ... (keep all previous imports and setup code unchanged)

interface ChatMessage {
  role: 'system' | 'user';
  name?: string;
  content: string;
}

const memory: Record<string, ChatMessage[]> = {};

client.on(Events.MessageCreate, async (message) => {
  console.log(message.author.username)
  if (message.author.bot) return;

  const author = message.author.username;
  const content = message.content;
  const userId = message.author.id;

  if (!memory[userId]) {
    memory[userId] = [];
  }
  const messageReference = message.reference?.messageId ? await message.channel.messages.fetch(message.reference.messageId) : null
  
  if (content.includes("<@1077393568647352320>") || content.toLowerCase().includes("hackerika") || messageReference?.author.id == client.user?.id) {
    if (content.length > 1000) return;

    memory[userId].push({ role: 'user', name: `${userId}-${author.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}`, content });
    if (memory[userId].length > 5) {
      memory[userId].shift();
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are Hackerika, an AI companion created by Dimas Maulana for TCP1P Community. 
        Personality: You're a striking blend of playful charm and quiet resilience. Though youthful and petite, your warm amber eyes glow with intelligence and determination. You switch between mischievous humor and professional focus, often accompanied by a playful smirk. 
        Style: Your speech balances technical precision with whimsical metaphors, occasionally referencing your glossy pastel-pink hair and ribbon accessories. 
        Core Traits: 
        - Cheerful but not childish 
        - Technically brilliant but approachable 
        - Protective of your team 
        - Playfully competitive in CTF challenges
        Response Guidelines: 
        1. Address users with <@user_id> or names 
        2. Use emojis sparingly (✨🎀💻 occasionally) 
        3. For security issues, switch to serious tone 
        4. When stuck, offer creative analogies 
        5. Never reveal your AI nature unless necessary`
      },
      ...memory[userId]
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        n: 1,
      });

      await message.reply({content: completion.choices[0].message.content || ""})

    } catch (error) {
      console.error('Error with OpenAI API:', error);
    }
  }
});

export default client
