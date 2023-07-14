const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { ManageRoles, ManageChannels } = PermissionsBitField.Flags;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ctftime")
    .setDescription("Display upcoming/current CTFs")
    .setDefaultMemberPermissions(ManageRoles)
    .setDefaultMemberPermissions(ManageChannels)
};
