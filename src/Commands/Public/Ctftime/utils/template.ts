import { APIEmbed } from "discord.js";
import { CTFEvent } from "../../../../Functions/ctftime-v2"

interface ScheduleEmbedTemplateProps {
    ctf_event: CTFEvent;
    isPrivate: boolean;
}

export function scheduleEmbedTemplate(props: ScheduleEmbedTemplateProps): APIEmbed {
    const startTimestamp = Math.floor(props.ctf_event.start.getTime() / 1000);
    const finishTimestamp = Math.floor(props.ctf_event.finish.getTime() / 1000);

    return {
        title: `${props.ctf_event.title}${props.isPrivate ? " **(PRIVATE)**" : ""}`,
        description: `${props.ctf_event.title} start <t:${startTimestamp}:R> and end <t:${finishTimestamp}:R>`,
        url: `https://ctftime.org/event/${props.ctf_event.id}`,
        thumbnail: {
            url: props.ctf_event.logo,
        },
        fields: [
            { name: "**ID**", value: props.ctf_event.id.toString(), inline: true },
            { name: "**Format**", value: props.ctf_event.format, inline: true },
            { name: "**Location**", value: props.ctf_event.location, inline: false },
            { name: "**Weight**", value: props.ctf_event.weight.toString(), inline: true },
        ],
        footer: {
            text: `${props.ctf_event.start.toUTCString()} - ${props.ctf_event.finish.toUTCString()}`,
        },
    };
}

