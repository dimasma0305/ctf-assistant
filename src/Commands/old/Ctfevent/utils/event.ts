import { TextChannel, Interaction, Message, User } from "discord.js"
import { translate } from "../../../../Functions/discord-utils"

export class RoleModel {
    name: string
    icon: string
    display: string

    constructor(name: string, icon: string, display: string) {
        this.name = name
        this.icon = icon
        this.display = display
    }
    toEmbed() {
        return { name: `${this.icon} ${this.name}`, value: this.display, inline: true }
    }
}

export class Role {
    interaction: Interaction
    channel: TextChannel
    constructor(interaction: Interaction) {
        this.interaction = interaction
        const channel = interaction.channel
        if (!(channel instanceof TextChannel)) {
            throw Error("Channel is not text channel")
        }
        this.channel = channel

    }
    reactToMessage(message: Message, roleData: RoleModel[]) {
        for (const idx in roleData) {
            const role = roleData[idx]
            message.react(role.icon)
        }
    }
    getDefaultRoleData() {
        const roleAndEmoji: any = {
            "web": '1️⃣',
            "pwn": '2️⃣',
            "forensic": '3️⃣',
            "reversing": '4️⃣',
            "crypto": '5️⃣',
            "mobile": '6️⃣',
            "blockchain": '7️⃣',
            "misc": '8️⃣',
            "boot2root": '9️⃣',
        }

        let roleData: RoleModel[] = []
        for (const role in roleAndEmoji) {
            const emoji = roleAndEmoji[role]
            roleData.push(new RoleModel(role, emoji, translate(`${role} ${this.channel.name} challenge author`)))
        }
        return roleData
    }
    assignRoleByReact(message: Message) {
        const roleData = this.getDefaultRoleData();

        message.reactions.cache.each(async (reaction) => {
            if (reaction.count > 1) {
                const emojiName = reaction.emoji.name;
                const roleIcon = roleData.find((value) => value.icon === emojiName);

                if (roleIcon) {
                    const role = message.guild?.roles.cache.find((r) => r.name === roleIcon.display);

                    if (role) {
                        const users = await reaction.users.fetch();
                        users.forEach((user) => {
                            const member = message.guild?.members.cache.get(user.id);
                            if (member && !member.roles.cache.has(role.id)) {
                                member.roles.add(role);
                                this.sendOnReactDmMessage(user, roleIcon, this.channel.name)
                            }
                        });
                    }
                }
            }
        });
    }
    async sendOnReactDmMessage(user: User, roleicon: RoleModel, channelName: string) {
        const dm = await user.createDM()
        dm.sendTyping()
        await dm.send(`Terima kasih banyak, ${user.username} 😊, atas partisipasi Anda dalam event ${channelName} sebagai ${roleicon.display}!`)
        dm.sendTyping()
        await dm.send(`Kami sangat senang memiliki Anda menjadi bagian dari acara kami! 🌟🎉`)
    }
    addRoleEventListener(message: Message, roleData?: RoleModel[]) {
        if (!roleData) {
            roleData = this.getDefaultRoleData()
        }
        const channelName = this.channel.name
        const collector = message.createReactionCollector({
            filter: (_msg, usr) => !usr.bot,
            dispose: true,
        })
        collector.on("collect", async (reaction, user) => {
            const guild = this.interaction.guild
            if (!guild) {
                throw Error("Guild Not Found!")
            }
            const guildUser = guild.members.cache.find((member) => member.id === user.id)
            if (!guildUser) {
                throw Error("Guild User Not Found!")
            }
            const roleicon = roleData?.find((value) => value.icon == reaction.emoji.name)
            if (!roleicon) {
                message.reactions.cache.get(reaction.emoji.identifier)?.remove()
                return
            }
            var role = guild.roles.cache.find((r) => r.name == roleicon.display)
            if (!role) {
                role = await guild.roles.create({
                    color: "Aqua",
                    mentionable: true,
                    name: roleicon.display
                })
            }
            await guildUser.roles.add(role)
            this.sendOnReactDmMessage(user, roleicon, channelName)

        })
        collector.on("remove", async (reaction, user) => {
            const dm = await user.createDM()
            const guild = this.interaction.guild
            if (!guild) {
                throw Error("Guild Not Found!")
            }
            const guildUser = guild.members.cache.find((member) => member.id === user.id)
            if (!guildUser) {
                throw Error("Guild User Not Found!")
            }
            const roleicon = roleData?.find((value) => value.icon == reaction.emoji.name)
            if (!roleicon) {
                message.reactions.cache.get(reaction.emoji.identifier)?.remove()
                return
            }
            var role = guild.roles.cache.find((r) => r.name == roleicon.display)
            if (!role) {
                throw Error("Role not found!")
            }
            await guildUser.roles.remove(role)
            await dm.send(`Selamat jalan, ${user.username} 👋,`)
            await dm.send(`kami sangat bersyukur telah memiliki kesempatan untuk bekerja sama dengan Anda sebagai ${role.name} selama ${channelName}.`)
            await dm.send(`Sekali lagi, selamat jalan... Harapan dan kenangan akan tetap mengalir seperti air mata, 😢❤️`)
        })
    }

}
