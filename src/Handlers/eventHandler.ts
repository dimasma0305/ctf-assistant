import { MyClient } from '../Model/client'; // Replace 'your-discord-library' with the actual library you are using
import { loadFiles } from '../Functions/fileLoader';
import ascii from 'ascii-table';

const loadEvents = async (client: MyClient) => {
  const table = new ascii().setHeading("Events", "Status");
  client.events.clear();

  const Files: string[] = await loadFiles("Events");
  Files.forEach((file: string) => {
    const event = require(file) as {
      name: string;
      execute: (...args: any[]) => void;
      rest?: boolean;
      once?: boolean;
    };

    const execute = (...args: any[]) => event.execute(...args, client);
    client.events.set(event.name, execute);

    if (event.rest) {
      // @ts-ignore
      if (event.once) client.rest.once(event.name, execute);
      // @ts-ignore
      else client.rest.on(event.name, execute);
    } else {
      if (event.once) client.once(event.name, execute);
      else client.on(event.name, execute);
    }

    table.addRow(event.name, "✅");
  });

  return console.log(table.toString(), "\nLoaded Events");
};

export { loadEvents };
