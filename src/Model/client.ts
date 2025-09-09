import { Client, Collection } from "discord.js";
import { Command, SubCommand } from "./command";
import { EventExecute } from "../Handlers/eventHandler";
import { SessionScheduler } from "../Services/SessionScheduler";

class MyClient extends Client {
    events!: Collection<string, EventExecute>;
    commands!: Collection<string, Command>;
    subCommands!: Collection<string, SubCommand>;
    sessionScheduler?: SessionScheduler;
}

export { MyClient }
