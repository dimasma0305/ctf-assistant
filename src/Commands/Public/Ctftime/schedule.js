const {
  ChatInputCommandInteraction,
  Client,
  PermissionsBitField,
  ChannelType,
  SlashCommandSubcommandBuilder,
  DMChannel
} = require("discord.js");
const { infoEvents } = require("../../../Functions/ctftime");
const { translate } = require("../../../Functions/discord-utils");
const { ManageRoles, ManageChannels, SendMessages, ViewChannel } = PermissionsBitField.Flags;

module.exports = {
  subCommand: "ctftime.schedule",
  data: new SlashCommandSubcommandBuilder()
    .setName("schedule")
    .setDescription("Schedule CTFs")
    .addStringOption(option => option
      .setName("id")
      .setDescription("CTFs ID")
      .setRequired(true)
    ).addNumberOption(option => option
      .setName("day")
      .setDescription("Set closure time (default: 1 day)")
    ).addBooleanOption(option => option
      .setName("private")
      .setDescription("Is this a private CTF event?")
    ).addStringOption(option => option
      .setName("password")
      .setDescription("Password for the private CTF event")
    ),
  /**
   *
   * @param {ChatInputCommandInteraction} interaction
   * @param {Client} _client
   */
  async execute(interaction, _client) {
    const { options } = interaction;
    const id = options.getString("id");
    const day = options.getNumber("day") || 1;
    const isPrivate = options.getBoolean("private");
    const password = options.getString("password");

    if (isPrivate) {
      if (!password) {
        return interaction.reply({
          content: "Password not provided",
          ephemeral: true
        });
      }
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const data = await infoEvents(id);

      if (data.length === 0) {
        return interaction.reply({
          content: "Invalid CTF ID",
          ephemeral: true,
        });
      }

      const embed = {
        title: `${data.title}${isPrivate ? " **(private)**" : ""}`,
        description: data.link,
        url: `https://ctftime.org/event/${id}`,
        thumbnail: {
          url: data.img,
        },
        fields: [
          { name: "**ID**", value: id, inline: true },
          { name: "**Format**", value: data.format, inline: true },
          { name: "**Location**", value: data.location, inline: false },
          { name: "**Weight**", value: data.weight, inline: true },
        ],
        footer: {
          text: data.date,
        },
      };

      const category = interaction.guild.channels.cache.find(
        (c) =>
          (c.name === "Text Channels" || c.name === "Text Channel") &&
          c.type === ChannelType.GuildCategory
      );

      const message = await interaction.channel.send({
        embeds: [embed],
        fetchReply: true,
      });

      await message.react("✅");

      const ctfRole = await interaction.guild.roles.create({
        name: data.title,
        color: "#AF1257",
        permissions: [SendMessages, ViewChannel],
      });

      const channelSetting = {
        parent: category,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [ViewChannel],
          },
          {
            id: ctfRole.id,
            allow: [ViewChannel],
          },
        ],
      };

      const discussChannel = await interaction.guild.channels.create({
        name: data.title,
        ...channelSetting,
      });

      const writeupChannel = await interaction.guild.channels.create({
        name: `${data.title} writeup`,
        ...channelSetting,
      });

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
          const collector = dmChannel.createMessageCollector(
            {
              filter: (message) => message.author.id === user.id,
              max: 1,
              time: 60000
            }
          );
          collector.on("collect", async (message) => {
            if (message.content === password) {
              guildMember.roles.add(ctfRole.id);
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
          guildMember.roles.add(ctfRole.id);
          sendSuccessMessage(dmChannel);
        }

        /**
         *
         * @param {DMChannel} dmChannel
         */
        function sendSuccessMessage(dmChannel) {
          dmChannel.send({
            content: `Successfully added the role for "${data.title}"!`,
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
        guildMember.roles.remove(ctfRole.id);
        user.createDM().then((dmChannel) => {
          dmChannel.send({
            content: `> Successfully removed the role for "${data.title}".`
          });
        });
      });

      getUser.on("end", (_collected) => {
        message.reply({
          content: `Thank you for participating in the event **${data.title}** CTF.`,
        });
      });
      interaction.editReply({
        content: "Success",
      })
    } catch (error) {
      await interaction.channel.send({
        content: error.toString(),
      });
    }
  },
};
