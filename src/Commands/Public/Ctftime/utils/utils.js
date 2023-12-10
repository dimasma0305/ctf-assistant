const { ChatInputCommandInteraction, Message } = require("discord.js");

/**
 * Retrieves an embed message containing a CTF (Capture The Flag) event.
 *
 * @param {ChatInputCommandInteraction} interaction - The interaction object representing the command interaction.
 * @returns {Promise<Message | undefined>} - A Promise that resolves to the embed message containing the CTF event, or undefined if no such message is found.
 */
async function getEmbedCTFEvent(interaction, ctfTitle) {
    const messages = await interaction.channel.messages.fetch({ limit: 32 })
    // get the embeded event
    const message = await messages.find((value) => {
        if (value instanceof Message) {
            if (value.author.bot &&
                value?.embeds[0]?.data?.title?.startsWith(ctfTitle)) {
                return true;
            }
        }
        return false;
    });
    return message;
}

/**
 *
 * @param {Message<true> | Message<false>} message
 */
function reactionCollectorCTFEvent(
    message,
    role,
    day,
    discussChannel,
    writeupChannel,
    isPrivate,
    ctfTitle
) {
    const getUser = message.createReactionCollector({
        filter: (reaction, _user) => {
            return reaction.emoji.name === "✅";
        },
        dispose: true,
        time: day * 24 * 60 * 60 * 1000,
    });

    // attending event
    getUser.on("collect", async (reaction, user) => {
        const guildMember = reaction.message.guild.members.cache.find(
            (member) => member.id === user.id
        );
        const dmChannel = await user.createDM();

        if (isPrivate) {
            dmChannel.send("Input the password: ");
            const collector = dmChannel.createMessageCollector({
                filter: (message) => message.author.id === user.id,
                max: 1,
                time: 60 * 1000
            });
            collector.on("collect", async (message) => {
                if (message.content === password) {
                    guildMember.roles.add(role.id);
                    sendSuccessMessage(dmChannel);
                } else {
                    sendFailureMessage(dmChannel);
                    reaction.users.remove(message.author.id);
                }
            });
            collector.on("end", (collected) => {
                if (collected.size === 0) {
                    dmChannel.send("Request timed out");
                    reaction.users.remove(user.id);
                }
            });
        } else {
            guildMember.roles.add(role.id);
            sendSuccessMessage(dmChannel);
        }

        /**
         *
         * @param {DMChannel} dmChannel
         */
        function sendSuccessMessage(dmChannel) {
            dmChannel.send({
                content: `Successfully added the role for "${ctfTitle}"!`,
            });
            dmChannel.send({
                content: `Here's the channel for the CTF event. Good luck!`,
            });
            dmChannel.send({
                embeds: [{
                    fields: [
                        { name: "**Discuss Channel**", value: `<#${discussChannel.id}>` },
                        { name: "**Writeup Channel**", value: `<#${writeupChannel.id}>` },
                    ]
                }]
            });
        }

        /**
         *
         * @param {DMChannel} dmChannel
         */
        function sendFailureMessage(dmChannel) {
            dmChannel.send({
                content: `Authentication failed. Please provide the correct password to proceed.`,
            });
        }
    });

    // Not attending events
    getUser.on("remove", async (reaction, user) => {
        const guildMember = reaction.message.guild.members.cache.find(
            (member) => member.id === user.id
        );
        guildMember.roles.remove(role.id);
        user.createDM().then((dmChannel) => {
            dmChannel.send({
                content: `> Successfully removed the role for "${ctfTitle}".`
            });
        });
    });

    getUser.on("end", (_collected) => {
        message.channel.send({
            content: `Thank you for participating in the event **${ctfTitle}** CTF.`,
        });
    });
}


module.exports = {
    getEmbedCTFEvent,
    reactionCollectorCTFEvent
};
