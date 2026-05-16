import { MyClient } from '../Model/client'; // Replace 'your-discord-library' with the actual library you are using
import { loadFiles } from '../Functions/fileLoader';
import ascii from 'ascii-table';
import { RestEvents } from 'discord.js';

type EventExecute = (...args: any[]) => void | Promise<unknown>;

interface Event {
  name: string;
  execute: EventExecute
  rest?: boolean;
  once?: boolean;
}

const loadEvents = async (client: MyClient) => {
  const table = new ascii(undefined, undefined).setHeading("Events", "Status");
  client.events.clear();

  const Files: string[] = await loadFiles("Events");
  Files.forEach((file: string) => {
    const event = require(file).event as Event;

    const execute = (...args: any[]) => {
      try {
        const result = event.execute(...args, client);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error(`[event:${event.name}] async handler error:`, error);
          });
        }
      } catch (error) {
        console.error(`[event:${event.name}] sync handler error:`, error);
      }
    };
    client.events.set(event.name, execute);

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
