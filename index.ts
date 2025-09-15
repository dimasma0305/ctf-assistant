import { config } from "dotenv";
config();
import "./src/webserver"
await import("./src/bot.ts")
