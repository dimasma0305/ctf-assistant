import { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { Role } from "./utils/event";

export const subCommand = "ctfevent.rebind"
export const data = new SlashCommandSubcommandBuilder()
    .setName("rebind")
    .setDescription("rebind the message reaction role")
    .addStringOption(option => option
        .setName("id")
        .setDescription("message id")
        .setRequired(true)
    )

export async function execute(interaction: ChatInputCommandInteraction, _client: Client) {
    const role = new Role(interaction)
    const { options, channel } = interaction
    if (!(channel instanceof TextChannel)){
        return
    }
    await interaction.deferReply({ ephemeral: true })
    const id = options.getString("id")
    if (!id) return
    const message = await channel.messages.fetch(id)
    role.assignRoleByReact(message)
    role.addRoleEventListener(message)
    return interaction.deleteReply()
}
