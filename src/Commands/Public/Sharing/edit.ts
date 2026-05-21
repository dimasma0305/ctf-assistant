import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, ChannelType } from "discord.js";
import { SharingChannelConfigModel } from "../../../Database/connect";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('edit')
        .setDescription('Edit grace period or exemptions for a sharing channel')
        .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Sharing channel to edit (defaults to current)')
            .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
                ChannelType.PublicThread,
                ChannelType.PrivateThread,
                ChannelType.AnnouncementThread,
            )
            .setRequired(false))
        .addIntegerOption((option) => option
            .setName('grace_minutes')
            .setDescription('New grace period in minutes (1-1440)')
            .setMinValue(1)
            .setMaxValue(1440)
            .setRequired(false))
        .addUserOption((option) => option
            .setName('exempt_user_add')
            .setDescription('Add a user whose messages are always kept')
            .setRequired(false))
        .addUserOption((option) => option
            .setName('exempt_user_remove')
            .setDescription('Remove a user from the exempt list')
            .setRequired(false))
        .addRoleOption((option) => option
            .setName('exempt_role_add')
            .setDescription('Add a role whose holders\' messages are always kept')
            .setRequired(false))
        .addRoleOption((option) => option
            .setName('exempt_role_remove')
            .setDescription('Remove a role from the exempt list')
            .setRequired(false)),
    async execute(interaction, _client) {
        await interaction.deferReply({ flags: ["Ephemeral"] });
        try {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            if (!channel || !('id' in channel)) {
                await interaction.editReply('❌ Could not resolve target channel.');
                return;
            }
            const cfg: any = await SharingChannelConfigModel.findOne({ channelId: channel.id }).lean();
            if (!cfg) {
                await interaction.editReply(
                    `ℹ️ <#${channel.id}> isn't a sharing channel yet. Use \`/sharing add\` first.`,
                );
                return;
            }

            const grace = interaction.options.getInteger('grace_minutes');
            const userAdd = interaction.options.getUser('exempt_user_add');
            const userRemove = interaction.options.getUser('exempt_user_remove');
            const roleAdd = interaction.options.getRole('exempt_role_add');
            const roleRemove = interaction.options.getRole('exempt_role_remove');

            const update: any = {};
            const changes: string[] = [];

            if (grace !== null) {
                update.gracePeriodMin = grace;
                changes.push(`grace period → **${grace} min**`);
            }

            let users: string[] = Array.isArray(cfg.exemptUserIds) ? [...cfg.exemptUserIds] : [];
            if (userAdd && !users.includes(userAdd.id)) {
                users.push(userAdd.id);
                changes.push(`+exempt user <@${userAdd.id}>`);
            }
            if (userRemove) {
                const before = users.length;
                users = users.filter((u) => u !== userRemove.id);
                if (users.length < before) changes.push(`-exempt user <@${userRemove.id}>`);
            }
            if (userAdd || userRemove) update.exemptUserIds = users;

            let roles: string[] = Array.isArray(cfg.exemptRoleIds) ? [...cfg.exemptRoleIds] : [];
            if (roleAdd && !roles.includes(roleAdd.id)) {
                roles.push(roleAdd.id);
                changes.push(`+exempt role <@&${roleAdd.id}>`);
            }
            if (roleRemove) {
                const before = roles.length;
                roles = roles.filter((r) => r !== roleRemove.id);
                if (roles.length < before) changes.push(`-exempt role <@&${roleRemove.id}>`);
            }
            if (roleAdd || roleRemove) update.exemptRoleIds = roles;

            if (Object.keys(update).length === 0) {
                await interaction.editReply(
                    'ℹ️ No changes requested. Provide at least one of `grace_minutes`, `exempt_user_add`, `exempt_user_remove`, `exempt_role_add`, `exempt_role_remove`.',
                );
                return;
            }

            await SharingChannelConfigModel.updateOne({ channelId: channel.id }, { $set: update });
            await interaction.editReply({
                content: `🧹 Updated <#${channel.id}>:\n` + changes.map((c) => `• ${c}`).join('\n'),
                allowedMentions: { parse: [] },
            });
            console.log(`🧹 [SharingConfig] edited #${(channel as any).name || channel.id} by ${interaction.user.tag}: ${changes.join(', ')}`);
        } catch (error) {
            console.error('[Sharing/edit] failed:', error);
            await interaction.editReply('❌ Something went wrong editing that channel.');
        }
    },
};
