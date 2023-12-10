import { config } from "dotenv";
config();

const { TOKEN } = process.env;

import { ShardingManager } from "discord.js";

const manager = new ShardingManager('./src/bot.ts', { token: TOKEN, respawn: true });

manager.on('shardCreate', shard => console.log(`Launched shard ${shard.id}`));

manager.spawn();
