const {
  ChatInputCommandInteraction,
  Client,
  PermissionsBitField,
  ChannelType,
} = require("discord.js");
const { infoEvents } = require("../../../Functions/ctftime");
const { ManageRoles, ManageChannels, SendMessages, ViewChannel } = PermissionsBitField.Flags;

module.exports = {
  subCommand: "ctftime.schedule",
  /**
   *
   * @param {ChatInputCommandInteraction} interaction
   * @param {Client} _client
   */
  async execute(interaction, _client) {
    const { options } = interaction;
    const permissionAdmin = [ManageRoles, ManageChannels];

    if (!interaction.member.permissions.has(permissionAdmin)) {
      return interaction.reply({
        content: "This command is only available to the admin",
        ephemeral: true,
      });
    }

    const id = options.getString("id");
    const day = options.getNumber("day") || 1;
    const data = await infoEvents(id);

    if (data.length === 0) {
      return interaction.reply({
        content: "Invalid id CTFs",
        ephemeral: true,
      });
    }

    const embed = {
      title: data.title,
      description: data.link,
      url: `https://ctftime.org/event/${id}`,
      thumbnail: {
        url: data.img,
      },
      fields: [
        { name: "**id**", value: id, inline: true },
        { name: "**format**", value: data.format, inline: true },
        { name: "**location**", value: data.location, inline: false },
        { name: "**weight**", value: data.weight, inline: true },
      ],
      footer: {
        text: data.date,
      },
    };

    const category = interaction.guild.channels.cache.find(
      (c) =>
        (c.name == "Text Channels" || c.name == "Text Channel") &&
        c.type == ChannelType.GuildCategory
    );

    const message = await interaction.reply({
      embeds: [embed],
      fetchReply: true,
    });
    await message.react("✅");

    await interaction.guild.roles.create({
      name: data.title,
      color: "#AF1257",
      permissions: [SendMessages, ViewChannel],
    });

    const filterRole = interaction.guild.roles.cache.find(
      (r) => r.name === data.title
    );

    const channelSetting = {
      parent: category,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [ViewChannel],
        },
        {
          id: filterRole.id,
          allow: [ViewChannel],
        },
      ],
    };

    await interaction.guild.channels.create({
      name: data.title,
      ...channelSetting,
    });

    await interaction.guild.channels.create({
      name: `${data.title} writeup`,
      ...channelSetting,
    });

    const filter = (reaction, user) => {
      return reaction.emoji.name == "✅";
    };

    const getUser = message.createReactionCollector({
      filter,
      dispose: true,
      time: day * 24 * 60 * 60 * 1000,
    });

    // attending events
    getUser.on("collect", (reaction, user) => {
      const guildMember = reaction.message.guild.members.cache.find(
        (member) => member.id === user.id
      );
      guildMember.roles.add(filterRole.id);
    });

    // not attending events
    getUser.on("remove", (reaction, user) => {
      const guildMember = reaction.message.guild.members.cache.find(
        (member) => member.id === user.id
      );
      guildMember.roles.remove(filterRole.id);
    });

    getUser.on("end", (collected) => {
      message.reply({
        content: `thanks for participating to attending event **${data.title}** CTFs`,
      });
    });
  },
};
