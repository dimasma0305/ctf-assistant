import { SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { Role } from "./utils/event";
import { SubCommand } from "../../../Model/command";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName("rebind")
        .setDescription("rebind the message reaction role")
        .addStringOption(option => option
            .setName("id")
            .setDescription("message id")
            .setRequired(true)
        ),
    async execute(interaction, _client) {
        const role = new Role(interaction)
        const { options, channel } = interaction
        if (!(channel instanceof TextChannel)) {
            return
        }
        const id = options.getString("id")
        if (!id) return
        const message = await channel.messages.fetch(id)
        role.assignRoleByReact(message)
        role.addRoleEventListener(message)
        return interaction.deleteReply()
    }
}
