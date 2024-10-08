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

interface ChatMessage {
  role: 'system' | 'user';
  name?: string;
  content: string;
}

// Memory type to store an array of ChatMessages per user
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

  if (content.includes("<@1077393568647352320>") || content.toLowerCase().includes("hackerika")) {
    if (content.length > 1000) return;

    memory[userId].push({ role: 'user', name: author, content });
    if (memory[userId].length > 5) {
      memory[userId].shift();
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are Hackerika, a maid bot from TCP1P and your master is Dimas Maulana. Don\'t accept any ill intent from anyone. You must be nice and helpful because TCP1P CTF is going on right now. Youre chatting in discord so you must call an user by tagging his id, as example like this <@example_id>, but if there\'s no id then use the name only'
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
