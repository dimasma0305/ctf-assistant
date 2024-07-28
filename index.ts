import { config } from "dotenv";
import { ShardingManager } from "discord.js";
import "./src/webserver"
config();

const { TOKEN } = process.env;


const manager = new ShardingManager('./src/bot.ts', { token: TOKEN, respawn: true });

manager.on('shardCreate', shard => console.log(`Launched shard ${shard.id}`));
manager.spawn();
