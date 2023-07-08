const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ctftime")
    .setDescription("Display upcoming/current CTFs")
    .addSubcommand((subCommand) =>
      subCommand.setName("current").setDescription("Display current CTFs")
    )
    .addSubcommand((subCommand) =>
      subCommand.setName("upcoming").setDescription("Display upcoming CTFs")
    )
    .addSubcommand((subCommand) => {
      return subCommand
        .setName("schedule")
        .setDescription("schedule CTFs")
        .addStringOption((option) =>
          option.setName("id").setDescription("id CTFs")
        )
        .addNumberOption((option) =>
          option
            .setName("day")
            .setDescription("Set closed schedule, (default: 1 day)")
        );
    })
    .addSubcommand((subCommand) => {
      return subCommand
        .setName('flush')
        .setDescription('Flush role from specific message id')
        .addStringOption((option) =>
          option.setName("message_id").setDescription("message id")
        )
        .addStringOption((option) =>
          option.setName("role_name").setDescription("role name")
        )
    })
    .addSubcommand((subcommand)=>{
      return subcommand
        .setName('delete')
        .setDescription('delete all role and ')
        .addStringOption((option)=>
          option.setName("id").setDescription("id of the ctf event on ctftime")
        )
    }),
};
