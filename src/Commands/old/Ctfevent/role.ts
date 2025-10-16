import { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { Role } from "./utils/event";
import { SubCommand } from "../../../Model/command";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName("role")
        .setDescription("give role to a challenge author"),
    async execute(interaction: ChatInputCommandInteraction, _client: Client) {
        const channel = interaction.channel;
        const role = new Role(interaction);
        await interaction.deferReply({ flags: ["Ephemeral"] })

        if (!channel) {
            return interaction.editReply({ content: "This command can only be invoked in a channel" });
        }
        if (!(channel instanceof TextChannel)){
            return
        }

        const roleData = role.getDefaultRoleData();

        const message = await channel.send({
            embeds: [{
                title: `TCP1P Event Role`,
                description: "Silahkan untuk mengambil role sesuai challenge yang ingin di buat pada ctf event kali ini ya teman-teman!",
                fields: (() => {
                    const result: any = [];
                    for (const idx in roleData) {
                        const role = roleData[idx];
                        result.push(role.toEmbed());
                    }
                    return result;
                })(),
            }],
        });

        role.addRoleEventListener(message, roleData);
        role.reactToMessage(message, roleData);

        return interaction.deleteReply();
    },
};
