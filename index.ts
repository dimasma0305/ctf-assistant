import { config } from "dotenv";
config();
import "./api/app"
await import("./src/bot.ts")
