import { Client, Collection } from "discord.js";
import { Command, SubCommand } from "./command";

class MyClient extends Client {
    events: Collection<string, unknown>; // You can specify the type for events and other properties if needed
    commands: Collection<string, Command>;
    subCommands: Collection<string, SubCommand>;
}

export { MyClient }
