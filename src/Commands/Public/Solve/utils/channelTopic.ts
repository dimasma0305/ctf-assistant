interface CTFChannelTopic {
    id?: unknown;
}

/**
 * Extract the CTFtime event ID stored in a CTF event channel topic.
 *
 * Invalid JSON is intentionally allowed to throw so callers can distinguish a
 * malformed topic from a valid topic that simply has no event association.
 */
export function parseCTFEventIdFromTopic(topic: string | null): string | null {
    const parsed = JSON.parse(topic || "{}") as CTFChannelTopic;
    const id = parsed?.id;

    if ((typeof id !== "number" && typeof id !== "string") || String(id).trim() === "") {
        return null;
    }

    const normalizedId = String(id).trim();
    if (!/^[1-9]\d*$/.test(normalizedId)) {
        return null;
    }

    return normalizedId;
}
