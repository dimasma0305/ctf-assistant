import { Events } from "discord.js";
import client from "./client";
import { loadEvents } from "./Handlers/eventHandler";
import { MyClient } from "./Model/client";

await loadEvents(client);

client.on(Events.ClientReady, (client) => {
    const cronEvent = (client as MyClient).events.get("LoadCrontEvent");
    if (cronEvent) cronEvent(client);
});
