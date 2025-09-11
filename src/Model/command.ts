import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { MyClient } from "./client";

class Command {
    data!: SlashCommandBuilder;
    allowedRoles?: string[];
    execute?: (interaction: ChatInputCommandInteraction, client: MyClient) => any
}

class SubCommand {
    data!: SlashCommandSubcommandBuilder;
    allowedRoles?: string[];
    execute?: (interaction: ChatInputCommandInteraction, client: MyClient) => any
}

export { Command, SubCommand }
