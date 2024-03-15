import { APIEmbed, BaseGuildTextChannel, ChannelType } from "discord.js";
import { Event } from "../../Handlers/eventHandler"
import { MyClient } from "../../Model/client";
import cron from "node-cron"
import { getUpcommingOnlineEvent } from "../../Functions/ctftime-v2";
import { scheduleEmbedTemplate } from "../../Commands/Public/Ctftime/utils/template";

export const event: Event = {
    name: "LoadCrontEvent",
    once: true,
    async execute(client: MyClient) {
        const mabarMessages = [
            "Haiii <@663394727688798231>! Yuk, besok kita mabar CTF lagi dong!",
            "Halo teman-teman! Besok ada mabar CTF kan nih, <@663394727688798231> jangan lupa prepare ya!",
            "Halo semua! 🌞 Ada mabar CTF besok? Ayo dong, <@663394727688798231> mabar...",
            "Heyyy <@663394727688798231>! Besok ada plan mabar CTF kan?!",
            "Besok kita mabar CTF ya <@663394727688798231> yaa!",
            "Hello! 🌼 Besok ada kesempatan mabar CTF lagi kan? <@663394727688798231>",
            "Aloha <@663394727688798231>! 🌺 Besok kita main CTF bareng lagi ya!?",
            "Yuk yuk yuk! 🎉 Besok mabar CTF, <@663394727688798231>",
            "Hai! Jangan lupa besok prepare mabar CTF, aku tunggu <@663394727688798231>!",
            "Besok jangan lupa mabar CTF, <@663394727688798231> ayo dim gasskan!"
        ];

        client.guilds.cache.forEach((guild) => {
            const channel = guild.channels.cache.find((channel) => {
                return channel.name == "mabar-ctf"
            })
            if (!channel) return
            if (channel instanceof BaseGuildTextChannel) {
                cron.schedule("26 18 * * 5", async() => {
                    const randomMessage = mabarMessages[Math.floor(Math.random() * mabarMessages.length)];
                    channel.sendTyping()
                    await channel.send(randomMessage)
                    channel.sendTyping()
                    const event = await getUpcommingOnlineEvent(5);
                    const embedsSend: Array<APIEmbed> = [];

                    channel.sendTyping()
                    for (let i = 0; i < event.length; i++) {
                      const data = event[i];
                      embedsSend.push(scheduleEmbedTemplate({
                        ctf_event: data,
                        isPrivate: false
                      }));
                    }
                    if (embedsSend.length > 0){
                        await channel.send("Ini ya mas daftar CTF minggu ini:")
                    }
                    channel.send({embeds: embedsSend})
                }, {
                    scheduled: true,
                    timezone: "Asia/Singapore"
                })
            }
        })
    },
}
