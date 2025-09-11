import { loadInitFile, loadChildFiles } from "../Functions/fileLoader";
import ascii from "ascii-table";
import { MyClient } from "../Model/client";
import { Command, SubCommand } from "../Model/command";
import { SlashCommandBuilder } from "discord.js";

const loadCommands = async (client: MyClient) => {
  const table = new ascii(undefined, undefined).setHeading("Commands", "Status");
  client.commands.clear();
  client.subCommands.clear();

  let commandsArray: Array<SlashCommandBuilder> = [];

  const initFiles = await loadInitFile("Commands");
  initFiles.forEach((file: string) => {
    const command: Command = require(file).command;
    client.commands.set(command.data.name, command);
    commandsArray.push(command.data);
    table.addRow(command.data.name, "✅");
  });

  const childFiles = await loadChildFiles("Commands");
  childFiles.forEach((file: string) => {
    const command: SubCommand = require(file).command;
    if (!command) return
    const parts = file.split('/')
    const parentName = parts[parts.length - 2].toLowerCase();
    const childName = parts[parts.length - 1].replace(/\.(ts|js)$/, "")
    const parent = client.commands.get(parentName);
    parent?.data.addSubcommand(command.data)
    return client.subCommands.set(`${parentName}.${childName}`, command);
  });
  if (client.application) {
    await client.application.commands.set(commandsArray);
  }
  return console.log(table.toString(), "\nLoaded Commands");
};

export { loadCommands };
