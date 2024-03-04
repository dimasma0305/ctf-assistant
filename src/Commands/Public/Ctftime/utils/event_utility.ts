import { ChannelType, ColorResolvable, Guild, Role, TextChannel } from "discord.js";
import { translate } from "../../../../Functions/discord-utils";
import { CTFEvent } from "../../../../Functions/ctftime-v2";

interface CreateChannelProps {
    channelName: string;
    guild: Guild;
    role: Role;
    callback?: ((channel: TextChannel) => Promise<void> | void)
}

export async function createPrivateChannelIfNotExist(props: CreateChannelProps) {
    const channelName = translate(props.channelName)
    var channel = props.guild.channels.cache.find((channel) => channel.name === channelName) as TextChannel
    if (!channel) {
        channel = await props.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: props.guild.id,
                    deny: ["ViewChannel"]
                },
                {
                    id: props.role.id,
                    allow: ["ViewChannel"]
                }
            ]
        })
        if (props.callback) await props.callback(channel)
    }
    return channel
}

interface createRoleProps {
    guild: Guild;
    name: string;
    color: string;
}

export async function createRoleIfNotExist(props: createRoleProps) {
    var role = props.guild.roles.cache.find((role) => role.name === props.name)
    if (!role) {
        role = await props.guild.roles.create({
            name: props.name,
            color: props.color as ColorResolvable,
            permissions: [],
        })
    }
    return role
}

