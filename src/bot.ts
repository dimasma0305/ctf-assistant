import client from "./client";
import { loadEvents } from "./Handlers/eventHandler";
import { MyClient } from "./Model/client";

await loadEvents(client);

client.on("ready", (client) => {
    const cronEvent = (client as MyClient).events.get("LoadCrontEvent")
    if (cronEvent) cronEvent(client)
})
