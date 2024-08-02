import { config } from "dotenv";
import db from "./Database/connect";
config();

const { TOKEN } = process.env;

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
} from "discord.js";

import { MyClient } from "./Model/client";

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

export default client
