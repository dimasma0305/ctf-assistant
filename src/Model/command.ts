import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { MyClient } from "./client";

class Command {
    data: SlashCommandBuilder;
    execute?: (interaction: ChatInputCommandInteraction, client: MyClient) => any
}

class SubCommand {
    data: SlashCommandSubcommandBuilder;
    execute?: (interaction: ChatInputCommandInteraction, client: MyClient) => any
}

export { Command, SubCommand }
