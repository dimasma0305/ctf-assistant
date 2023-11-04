const {
  ChatInputCommandInteraction,
  Client,
  SlashCommandSubcommandBuilder,
} = require("discord.js");
const { infoEvents } = require("../../../Functions/ctftime");
const { ReactionRoleEvent } = require("./utils/event");

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

      const message = await interaction.channel.send({
        embeds: [{
          title: `${data.title}${isPrivate ? " **(PRIVATE)**" : ""}`,
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
        }],
        fetchReply: true,
      });

      await message.react("✅");

      new ReactionRoleEvent(interaction).addEventListener(message, {
        ctfName: data.title,
        day,
        isPrivate,
        password
      })

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
