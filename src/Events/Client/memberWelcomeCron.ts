import cron from "node-cron";
import { Guild, GuildMember, TextChannel } from "discord.js";
import { MemberWelcomeStateModel } from "../../Database/connect";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import {
    generateMemberWelcome,
    WelcomePeriod,
} from "../../Services/AI/memberWelcome";
import { isNoDbMode } from "../../utils/env";

const MORNING_CRON = "0 9 * * *";
const NIGHT_CRON = "0 20 * * *";
const TIMEZONE = "Asia/Jakarta";
const RECONCILIATION_OVERLAP_MS = 15 * 60 * 1_000;
const MEMBERS_PER_MESSAGE = 20;
const MAX_REMEMBERED_MEMBER_IDS = 5_000;

let initialized = false;
let running = false;

function normalizedChannelName(name: string): string {
    return name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function canSendTo(channel: unknown): channel is TextChannel {
    const candidate = channel as any;
    if (!candidate || typeof candidate.send !== "function") return false;
    if (typeof candidate.isTextBased !== "function" || !candidate.isTextBased()) return false;
    if (typeof candidate.isThread === "function" && candidate.isThread()) return false;

    const me = candidate.guild?.members?.me;
    const permissions = me ? candidate.permissionsFor(me) : null;
    return Boolean(
        permissions?.has("ViewChannel") &&
        permissions?.has("SendMessages")
    );
}

function resolveWelcomeChannel(guild: Guild): TextChannel | null {
    if (canSendTo(guild.systemChannel)) return guild.systemChannel;

    const preferredNames = ["welcome", "introductions", "chat", "general"];
    const channels = [...guild.channels.cache.values()].filter(canSendTo);
    for (const preferred of preferredNames) {
        const exact = channels.find(
            (channel) => normalizedChannelName(channel.name) === preferred
        );
        if (exact) return exact;
    }
    return null;
}

function chunks<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        result.push(items.slice(index, index + size));
    }
    return result;
}

async function initializeCheckpoints(client: MyClient): Promise<void> {
    const now = new Date();
    await Promise.all(
        [...client.guilds.cache.values()].map((guild) =>
            MemberWelcomeStateModel.updateOne(
                { guildId: guild.id },
                {
                    $setOnInsert: {
                        guildId: guild.id,
                        lastCheckedAt: now,
                        welcomedMemberIds: [],
                        updatedAt: now,
                    },
                },
                { upsert: true }
            )
        )
    );
}

async function checkGuild(guild: Guild, period: WelcomePeriod): Promise<number> {
    const state = await MemberWelcomeStateModel.findOne({ guildId: guild.id }).lean();
    if (!state) {
        const now = new Date();
        await MemberWelcomeStateModel.create({
            guildId: guild.id,
            lastCheckedAt: now,
            welcomedMemberIds: [],
            updatedAt: now,
        });
        return 0;
    }

    const previousCheck = state.lastCheckedAt instanceof Date
        ? state.lastCheckedAt
        : new Date(state.lastCheckedAt || Date.now());
    const windowStart = previousCheck.getTime() - RECONCILIATION_OVERLAP_MS;
    const welcomedIds = new Set(
        Array.isArray(state.welcomedMemberIds)
            ? state.welcomedMemberIds.map(String)
            : []
    );

    const members = await guild.members.fetch();
    const observedAt = new Date();
    const newMembers = [...members.values()]
        .filter((member: GuildMember) =>
            !member.user.bot &&
            typeof member.joinedTimestamp === "number" &&
            member.joinedTimestamp > windowStart &&
            member.joinedTimestamp <= observedAt.getTime() &&
            !welcomedIds.has(member.id)
        )
        .sort((left, right) =>
            (left.joinedTimestamp || 0) - (right.joinedTimestamp || 0)
        );

    if (!newMembers.length) {
        await MemberWelcomeStateModel.updateOne(
            { guildId: guild.id },
            {
                $set: {
                    lastCheckedAt: observedAt,
                    lastRunAt: observedAt,
                    updatedAt: observedAt,
                },
                $unset: { lastError: 1 },
            }
        );
        return 0;
    }

    const channel = resolveWelcomeChannel(guild);
    if (!channel) {
        throw new Error("No sendable system/welcome/introductions/chat/general channel");
    }

    let welcomedCount = 0;
    for (const memberBatch of chunks(newMembers, MEMBERS_PER_MESSAGE)) {
        const memberIds = memberBatch.map((member) => member.id);
        const content = await generateMemberWelcome(memberIds, period);
        await channel.send({
            content,
            allowedMentions: {
                parse: [],
                users: memberIds,
                repliedUser: false,
            },
        });

        memberIds.forEach((id) => welcomedIds.add(id));
        const rememberedIds = [...welcomedIds].slice(-MAX_REMEMBERED_MEMBER_IDS);
        await MemberWelcomeStateModel.updateOne(
            { guildId: guild.id },
            {
                $set: {
                    welcomedMemberIds: rememberedIds,
                    lastRunAt: observedAt,
                    updatedAt: new Date(),
                },
                $unset: { lastError: 1 },
            }
        );
        welcomedCount += memberIds.length;
    }

    await MemberWelcomeStateModel.updateOne(
        { guildId: guild.id },
        {
            $set: {
                lastCheckedAt: observedAt,
                lastRunAt: observedAt,
                updatedAt: new Date(),
            },
            $unset: { lastError: 1 },
        }
    );
    return welcomedCount;
}

async function runWelcomeCheck(
    client: MyClient,
    period: WelcomePeriod
): Promise<void> {
    if (isNoDbMode()) return;
    if (running) {
        console.warn("[MemberWelcome] previous check is still running; skipping");
        return;
    }

    running = true;
    let welcomedCount = 0;
    try {
        for (const guild of client.guilds.cache.values()) {
            try {
                welcomedCount += await checkGuild(guild, period);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[MemberWelcome] ${guild.name} failed:`, error);
                await MemberWelcomeStateModel.updateOne(
                    { guildId: guild.id },
                    {
                        $set: {
                            lastRunAt: new Date(),
                            lastError: message.slice(0, 500),
                            updatedAt: new Date(),
                        },
                    }
                ).catch(() => undefined);
            }
        }
        console.log(
            `[MemberWelcome] ${period} check complete; welcomed ${welcomedCount} member(s)`
        );
    } finally {
        running = false;
    }
}

export const event: Event = {
    name: "clientReady",
    once: true,
    async execute(client: MyClient) {
        if (initialized || isNoDbMode()) return;
        initialized = true;

        await initializeCheckpoints(client);
        cron.schedule(
            MORNING_CRON,
            () => { void runWelcomeCheck(client, "morning"); },
            { timezone: TIMEZONE }
        );
        cron.schedule(
            NIGHT_CRON,
            () => { void runWelcomeCheck(client, "night"); },
            { timezone: TIMEZONE }
        );

        console.log(
            "[MemberWelcome] AI welcome checks loaded (09:00 and 20:00 Asia/Jakarta)"
        );
    },
};
