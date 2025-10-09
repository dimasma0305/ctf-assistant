import { Client, Collection } from "discord.js";
import { Command, SubCommand } from "./command";
import { EventExecute } from "../Handlers/eventHandler";
import { SessionScheduler } from "../Services/SessionScheduler";
import { ConnectionStateManager } from "../Services/ConnectionStateManager";
import { HealthMonitor } from "../Services/HealthMonitor";
import { RateLimitManager } from "../Services/RateLimitManager";
import { MetricsCollector } from "../Services/MetricsCollector";

class MyClient extends Client {
    events!: Collection<string, EventExecute>;
    commands!: Collection<string, Command>;
    subCommands!: Collection<string, SubCommand>;
    sessionScheduler?: SessionScheduler;
    connectionStateManager?: ConnectionStateManager;
    healthMonitor?: HealthMonitor;
    rateLimitManager?: RateLimitManager;
    metricsCollector?: MetricsCollector;
}

export { MyClient }
