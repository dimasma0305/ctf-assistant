import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import { seedDefaultsIfEmpty } from "../../Services/AI/lorebook";

let seeded = false;

export const event: Event = {
    name: "ready",
    once: true,
    async execute(_client: MyClient) {
        if (seeded) return;
        seeded = true;

        // Small delay so other ready handlers (DB connection finalization,
        // etc.) settle first. Same pattern as botStateCron.
        setTimeout(() => {
            seedDefaultsIfEmpty().catch((error) => {
                console.error('[LorebookSeed] startup seed failed:', error);
            });
        }, 3000);
    },
};
