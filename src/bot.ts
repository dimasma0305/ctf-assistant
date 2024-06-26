// require("./webserver");
import { config } from "dotenv";
config();

const { TOKEN } = process.env;

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  ShardingManager
} from "discord.js";

import { loadEvents } from "./Handlers/eventHandler";
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

client.on(Events.Debug, (message)=>{
  console.log(message)
})

await loadEvents(client);

client.login(TOKEN);

client.on("ready", (client)=>{
  const cronEvent = (client as MyClient).events.get("LoadCrontEvent")
  if (cronEvent) cronEvent(client)
})


