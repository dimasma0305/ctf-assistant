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

const dateToCron = (date: Date) => {
    const minutes = date.getMinutes();
    const hours = date.getHours();
    const days = date.getDate();
    const months = date.getMonth() + 1;
    const dayOfWeek = date.getDay();

    return `${minutes} ${hours} ${days} ${months} ${dayOfWeek}`;
};

export { translate, get_event_id_from_url, dateToCron }
