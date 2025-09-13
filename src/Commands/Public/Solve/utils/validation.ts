import { CTFEvent } from "../../../../Functions/ctftime-v2";

/**
 * Validates that the channel has a valid CTF event
 */
export function validateCTFEvent(ctfData: CTFEvent): boolean {
    return !!ctfData.id;
}
