const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { ManageRoles, ManageChannels } = PermissionsBitField.Flags;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ctfevent")
    .setDescription("CTF Event Manager")
    .setDefaultMemberPermissions(ManageRoles)
    .setDefaultMemberPermissions(ManageChannels)
};
