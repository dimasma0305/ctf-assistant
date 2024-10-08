import { config } from "dotenv";
import { ShardingManager } from "discord.js";
import "./src/webserver"
config();

const { TOKEN } = process.env;


import "./src/bot.ts"

// const manager = new ShardingManager('./src/bot.ts', { token: TOKEN, respawn: true, totalShards: 1 });

// manager.on('shardCreate', shard => console.log(`Launched shard ${shard.id}`));

// manager.spawn();
// console.log(manager.shardList)
