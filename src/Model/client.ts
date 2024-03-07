import { Client, Collection } from "discord.js";
import { Command, SubCommand } from "./command";
import { EventExecute } from "../Handlers/eventHandler";

class MyClient extends Client {
    events!: Collection<string, EventExecute>;
    commands!: Collection<string, Command>;
    subCommands!: Collection<string, SubCommand>;
}

export { MyClient }
