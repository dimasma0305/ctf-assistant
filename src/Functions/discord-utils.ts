function translate(text: string) {
    var result = text.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")
    while (result.includes("--")){
        result = result.replace("--", "-")
    }
    return result;
}
const EVENT_ID_REGEX = /\/event\/(\d+)\//;

function get_event_id_from_url(url: string) {
    const match = url.match(EVENT_ID_REGEX);
    if (!match) return;
    return match[1];
}

export { translate, get_event_id_from_url }
