import type { Message, OmitPartialGroupDMChannel } from 'discord.js';

/** DMs are already addressed to her; a bot mention is never required there. */
export function shouldRespondToMessage(
    message: OmitPartialGroupDMChannel<Message<boolean>>,
    referencedMessage: Message | null,
    selfId?: string,
): boolean {
    if (message.author.bot || message.webhookId || message.system) return false;
    if (!message.guild) return true;
    return /\bhackerika\b/i.test(message.content)
        || (!!selfId && (message.content.includes(`<@${selfId}>`) || message.content.includes(`<@!${selfId}>`)))
        || (!!selfId && referencedMessage?.author.id === selfId);
}
