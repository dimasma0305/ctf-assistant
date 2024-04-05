import { MyClient } from '../Model/client'; // Replace 'your-discord-library' with the actual library you are using
import { loadFiles } from '../Functions/fileLoader';
import ascii from 'ascii-table';
import { RestEvents } from 'discord.js';

type EventExecute = (...args: any[]) => void;

interface Event {
  name: string;
  execute: EventExecute
  rest?: boolean;
  once?: boolean;
}

const loadEvents = async (client: MyClient) => {
  const table = new ascii().setHeading("Events", "Status");
  client.events.clear();

  const Files: string[] = await loadFiles("Events");
  Files.forEach((file: string) => {
    const event = require(file).event as Event;

    const execute = (...args: any[]) => event.execute(...args, client);
    client.events.set(event.name, execute);
    console.log(event)

    if (event.rest) {
      if (event.once) client.rest.once(event.name as keyof RestEvents, execute);
      else client.rest.on(event.name as keyof RestEvents, execute);
    } else {
      if (event.once) client.once(event.name, execute);
      else client.on(event.name, execute);
    }

    table.addRow(event.name, "✅");
  });

  return console.log(table.toString(), "\nLoaded Events");
};

export { loadEvents, Event, EventExecute };
