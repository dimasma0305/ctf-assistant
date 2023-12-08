import { Client, Collection } from "discord.js";
import { Command, SubCommand } from "./command";

class MyClient extends Client {
    events!: Collection<string, unknown>;
    commands!: Collection<string, Command>;
    subCommands!: Collection<string, SubCommand>;
}

export { MyClient }
