const { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } = require("discord.js");
const { getEvents, infoEvents } = require("../../../Functions/ctftime");
const discord = require("../../../Functions/discord-utils")

const sleep = (s)=>new Promise((r)=>setTimeout(r,s))

class Role {
    constructor(name, icon, display) {
        this.name = name
        this.icon = icon
        this.display = display
    }
    toEmbed() {
        return { name: `${this.icon} ${this.name}`, value: this.display, inline: true }
    }
}

module.exports = {
    subCommand: "ctfevent.role",
    data: new SlashCommandSubcommandBuilder()
        .setName("role")
        .setDescription("give role to a challenge author"),
    /**
     *
     * @param {ChatInputCommandInteraction} interaction
     * @param {Client} client
     */
    async execute(interaction, _client) {
        const channel = interaction.channel
        await interaction.deferReply({ ephemeral: true })

        if (channel == null) {
            return interaction.editReply({ content: "This command can only invoked at the channel" })
        }
        const { name } = channel
        const roleNames = ["web", "pwn", "forensic", "reversing", "crypto", "mobile", "blockchain", "misc", "boot2root"]
        const numIcon = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
        /**
         * @type {Role[]}
         */
        let rolesData = []
        for (const idx in roleNames) {
            const roleName = roleNames[idx]
            rolesData.push(new Role(roleName, numIcon[idx].trim(), discord.translate(`${name} ${roleName} challenge author`)))
        }
        /**
         * @type {import("discord.js").APIEmbed}
         */
        const embed = {
            title: `TCP1P Event Role`,
            description: "Silahkan untuk mengambil role sesuai challenge yang ingin di buat pada ctf event kali ini ya teman-teman!",
            fields: (() => {
                const result = []
                for (const idx in rolesData) {
                    const role = rolesData[idx]
                    result.push(role.toEmbed())
                }
                return result
            })(),
        };
        const message = await interaction.channel.send({
            embeds: [embed],
        });
        for (const idx in rolesData) {
            const role = rolesData[idx]
            message.react(role.icon)
        }
        const collector = message.createReactionCollector({
            filter: (_msg, usr) => !usr.bot,
            dispose: true,
        })
        collector.on("collect", async (reaction, user) => {
            const dm = await user.createDM()
            const guildUser = interaction.guild.members.cache.find((member) => member.id === user.id)
            const roleData = rolesData.find((value) => value.icon == reaction.emoji.reaction)
            if (!roleData) {
                return dm.send(`role with reaction emoji ${reaction.emoji} not found!`)
            }
            let role = interaction.guild.roles.cache.find((r) => r.name == roleData.display)
            if (!role) {
                role = await interaction.guild.roles.create({
                    color: "Aqua",
                    mentionable: true,
                    name: roleData.display
                })
            }
            await guildUser.roles.add(role)
            dm.sendTyping()
            await dm.send(`Terima kasih banyak, ${user.username} 😊, atas partisipasi Anda dalam event ${name} sebagai ${role.name}!`)
            dm.sendTyping()
            await sleep(3000)
            await dm.send(`Kami sangat senang memiliki Anda menjadi bagian dari acara kami! 🌟🎉`)
                    })
        collector.on("remove", async(reaction, user)=>{
            const dm = await user.createDM()
            const guildUser = interaction.guild.members.cache.find((member) => member.id === user.id)
            const roleData = rolesData.find((value) => value.icon == reaction.emoji.reaction)
            if (!roleData) {
                return dm.send(`role with reaction emoji ${reaction.emoji} not found!`)
            }
            let role = interaction.guild.roles.cache.find((r) => r.name == roleData.display)
            await guildUser.roles.remove(role)
            await dm.send(`Selamat jalan, ${user.username} 👋,`)
            dm.sendTyping()
            await sleep(3000)
            await dm.send(`kami sangat bersyukur telah memiliki kesempatan untuk bekerja sama dengan Anda sebagai ${role.name} selama ${name}.`)
            dm.sendTyping()
            await sleep(2000)
            await dm.send(`Sekali lagi, selamat jalan... Harapan dan kenangan akan tetap mengalir seperti air mata, 😢❤️`)
        })
        return interaction.deleteReply({ content: "Success!" })
    },
};
