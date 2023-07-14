// require("./webserver");
require("dotenv").config();
const { TOKEN } = process.env;

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");
const { loadEvents } = require("./Handlers/eventHandler");

const { Guilds, GuildMembers, GuildMessages, GuildMessageReactions, MessageContent, DirectMessages } =
  GatewayIntentBits;

const { User, Message, GuildMember, Channel } = Partials;

const client = new Client({
  intents: [Guilds, GuildMembers, GuildMessages, GuildMessageReactions, MessageContent, DirectMessages],
  partials: [User, Message, GuildMember, Channel],
});

client.events = new Collection();
client.commands = new Collection();
client.subCommands = new Collection();

loadEvents(client);
client.login(TOKEN);
