const { Collection, SlashCommandBuilder } = require("discord.js");

const loadCommands = async (client) => {
  const { loadFiles } = require("../Functions/fileLoader");
  const ascii = require("ascii-table");

  const table = new ascii().setHeading("Commands", "Status");
  await client.commands.clear();
  await client.subCommands.clear();

  let commandsArray = [];

  const Files = await loadFiles("Commands");

  Files.forEach((file) => {
    const command = require(file);
    /**
     * @type {string}
     */
    const subCommand = command.subCommand
    if (subCommand) {
      if (command.data) {
        /**
         * @type {SlashCommandBuilder}
         */
        const parent_name = subCommand.split(".")[0]
        const parent = client.commands.get(parent_name).data
        const new_data = parent.addSubcommand(command.data)
        client.commands.set(new_data)
      }
      return client.subCommands.set(command.subCommand, command);
    }
    else {
      client.commands.set(command.data.name, command);

      commandsArray.push(command.data);
      table.addRow(command.data.name, "✅");
    }
  });

  client.application.commands.set(commandsArray);
  return console.log(table.toString(), "\nLoaded Commands");
};

module.exports = { loadCommands };
