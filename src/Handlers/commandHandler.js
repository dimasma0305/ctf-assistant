const { Collection, SlashCommandBuilder } = require("discord.js");
const { loadInitFile, loadChildFiles } = require("../Functions/fileLoader");
const ascii = require("ascii-table");

const loadCommands = async (client) => {

  const table = new ascii().setHeading("Commands", "Status");
  await client.commands.clear();
  await client.subCommands.clear();

  let commandsArray = [];

  const initFiles = await loadInitFile("Commands")
  initFiles.forEach((file) => {
    const command = require(file);
    client.commands.set(command.data.name, command);

    commandsArray.push(command.data);
    table.addRow(command.data.name, "✅");
  })

  const childFiles = await loadChildFiles("Commands");
  childFiles.forEach((file) => {
    const command = require(file);
    const subCommand = command.subCommand
    if (!subCommand) {
      return
    }
    if (command.data) {
      const parent_name = subCommand.split(".")[0]
      const parent = client.commands.get(parent_name).data
      const new_data = parent.addSubcommand(command.data)
      client.commands.set(new_data)
    }
    return client.subCommands.set(command.subCommand, command);
  });

  client.application.commands.set(commandsArray);
  return console.log(table.toString(), "\nLoaded Commands");
};

module.exports = { loadCommands };
