import { loadCommands } from "../../Handlers/commandHandler";
import { Event } from "../../Handlers/eventHandler";

export const event: Event = {
  name: "clientReady",
  once: true,
  execute(client) {
    console.log("the client is now ready");
    loadCommands(client);
  },
};
