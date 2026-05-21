import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, EmbedBuilder } from "discord.js";
import { SharingChannelConfigModel } from "../../../Database/connect";

function relativeAgo(d: Date | string | undefined): string {
    if (!d) return 'never';
    const t = (d instanceof Date ? d : new Date(d)).getTime();
    if (!Number.isFinite(t)) return 'never';
    const diff = Date.now() - t;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
}

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('list')
        .setDescription('Show all channels configured for sharing-channel cleanup'),
    async execute(interaction, _client) {
        await interaction.deferReply({ flags: ["Ephemeral"] });
        try {
            const guildId = interaction.guildId;
            const filter: any = guildId ? { guildId } : {};
            const configs = await SharingChannelConfigModel.find(filter)
                .sort({ addedAt: -1 })
                .lean();

            if (configs.length === 0) {
                await interaction.editReply(
                    '📭 No sharing channels configured yet.\n' +
                    'Use `/sharing add channel:#some-channel` to add one.',
                );
                return;
            }

            const lines = configs.map((c: any) => {
                const last = c.lastSweepAt
                    ? `last swept ${relativeAgo(c.lastSweepAt)} (${c.lastSweepDeleted || 0} deleted)`
                    : 'no sweep yet';
                const exemptCount = (c.exemptUserIds?.length || 0) + (c.exemptRoleIds?.length || 0);
                const exemptPart = exemptCount > 0 ? ` · ${exemptCount} exempt` : '';
                return `• <#${c.channelId}> — grace ${c.gracePeriodMin}m${exemptPart} · ${last}`;
            });

            const embed = new EmbedBuilder()
                .setTitle('🧹 Sharing channels')
                .setDescription(lines.join('\n'))
                .setFooter({ text: `${configs.length} channel${configs.length === 1 ? '' : 's'} · cleanup runs every 30 min` })
                .setColor(0x5865F2);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[Sharing/list] failed:', error);
            await interaction.editReply('❌ Something went wrong listing sharing channels.');
        }
    },
};
