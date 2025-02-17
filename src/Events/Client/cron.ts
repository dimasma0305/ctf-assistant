import { APIEmbed, BaseGuildTextChannel, ChannelType } from "discord.js";
import { Event } from "../../Handlers/eventHandler"
import { MyClient } from "../../Model/client";
import cron from "node-cron"
import { getUpcommingOnlineEvent } from "../../Functions/ctftime-v2";
import { scheduleEmbedTemplate } from "../../Commands/Public/Ctftime/utils/event";

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
            "Besok jangan lupa mabar CTF, <@663394727688798231> ayo dim gasskan!",
            "Hey <@663394727688798231>! Siap-siap buat besok mabar CTF ya!",
            "Hola <@663394727688798231>! 🌟 Kita seru-seruan mabar CTF besok!",
            "Hey squad! Besok ada mabar CTF, siap-siap ya <@663394727688798231>!",
            "Oi <@663394727688798231>! Jangan lupa besok mabar CTF bareng kita!",
            "Cek-cek <@663394727688798231>! Siap-siap buat besok mabar CTF yuk!",
            "Besok ada mabar CTF nih, <@663394727688798231> siap-siap yaa!",
            "Hei <@663394727688798231>! Jangan lupa prepare buat mabar CTF besok!",
            "Hello team! 🌟 <@663394727688798231> yuk besok kita mabar CTF lagi!",
            "Ayo dong <@663394727688798231>, besok mabar CTF bareng lagi!",
            "Hi hi! 🌼 <@663394727688798231> jangan lupa besok kita mabar CTF!"
        ];

        client.guilds.cache.forEach((guild) => {
            const channel = guild.channels.cache.find((channel) => {
                return channel.name == "mabar-ctf"
            })
            if (!channel) return
            if (channel instanceof BaseGuildTextChannel) {
                cron.schedule("0 8 * * 5", async() => {
                    const randomMessage = mabarMessages[Math.floor(Math.random() * mabarMessages.length)];
                    const event = await getUpcommingOnlineEvent(5);
                    const embedsSend: Array<APIEmbed> = [];

                    for (let i = 0; i < event.length; i++) {
                      const data = event[i];
                      embedsSend.push(scheduleEmbedTemplate({
                        ctfEvent: data,
                      }));
                    }
                    await channel.send(randomMessage)
                    if (embedsSend.length > 0){
                        await channel.send("Ini ya mas daftar CTF minggu ini:")
                        await channel.send({embeds: embedsSend})
                    }else {
                        await channel.send("Waduh ternyata nda ada CTF minggu ini :(")
                    }
                }, {
                    scheduled: true,
                    timezone: "Asia/Singapore"
                })
            }
        })
    },
}
