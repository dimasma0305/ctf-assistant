import cron from "node-cron";
import mongoose, { Model } from "mongoose";
import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    TextChannel,
} from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import * as Database from "../../Database/connect";
import {
    instagramBatchStateSchema,
    instagramDeliverySchema,
    instagramProfileSyncSchema,
    instagramWatchCursorSchema,
} from "../../Database/instagramDeliverySchema";
import {
    fetchInstagramProfileBatch,
    InstagramPost,
    InstagramProfileBatchResult,
    normalizeInstagramUsername,
} from "../../Services/Instagram/monitor";

const DAILY_GATE_CRON = "0 9 * * *";
const CRON_TIMEZONE = "Asia/Jakarta";
const PROFILE_SYNC_INTERVAL_MS = (7 * 24 - 1) * 60 * 60 * 1_000;
const INITIAL_LOOKBACK_MS = 8 * 24 * 60 * 60 * 1_000;
const OVERLAP_MS = 24 * 60 * 60 * 1_000;
const BATCH_LOCK_MS = 45 * 60 * 1_000;
const MAX_ACTIVE_PROFILES = 900;
const MAX_POSTS_PER_PROFILE = 100;
const MAX_DELIVERY_ATTEMPTS = 8;
const DELIVERY_LOCK_MS = 10 * 60 * 1_000;
const BATCH_LOCK_KEY = "instagram-weekly-batch";

const InstagramBatchStateModel =
    (mongoose.models.InstagramBatchState as Model<any> | undefined) ||
    mongoose.model("InstagramBatchState", instagramBatchStateSchema);
const InstagramProfileSyncModel =
    (mongoose.models.InstagramProfileSync as Model<any> | undefined) ||
    mongoose.model("InstagramProfileSync", instagramProfileSyncSchema);
const InstagramWatchCursorModel =
    (mongoose.models.InstagramWatchCursor as Model<any> | undefined) ||
    mongoose.model("InstagramWatchCursor", instagramWatchCursorSchema);
const InstagramDeliveryModel =
    (mongoose.models.InstagramDelivery as Model<any> | undefined) ||
    mongoose.model("InstagramDelivery", instagramDeliverySchema);

interface WatchPaths {
    username: string;
    channelId: string;
    guildId?: string;
    active?: string;
    lastPostId?: string;
    lastCheckedAt?: string;
    createdAt?: string;
}

interface WatchRef {
    id: string;
    username: string;
    channelId: string;
    guildId?: string;
    legacyLastPostId?: string;
    createdAt?: Date;
}

interface LoadedWatches {
    model: Model<any>;
    paths: WatchPaths;
    watches: WatchRef[];
}

interface CursorRef {
    lastPostId?: string;
}

let instagramCronInitialized = false;
let instagramJobRunning = false;

function isMongooseModel(value: unknown): value is Model<any> {
    const candidate = value as any;
    return Boolean(
        candidate &&
        candidate.schema &&
        candidate.modelName &&
        typeof candidate.find === "function"
    );
}

function firstSchemaPath(model: Model<any>, candidates: string[]): string | undefined {
    return candidates.find((candidate) => Boolean(model.schema.path(candidate)));
}

function resolveWatchModel(): Model<any> {
    const exportedValues = Object.values(
        Database as unknown as Record<string, unknown>
    );
    const candidates = [
        ...exportedValues,
        ...Object.values(mongoose.models),
    ].filter(isMongooseModel);

    const direct = candidates.find(
        (candidate) => candidate.modelName === "InstagramWatchState"
    );
    if (direct) return direct;

    const discovered = candidates.find((candidate) => {
        const hasUsername = Boolean(firstSchemaPath(candidate, [
            "username",
            "instagramUsername",
            "instagram_username",
            "profileUsername",
        ]));
        const hasChannel = Boolean(firstSchemaPath(candidate, [
            "channelId",
            "channel_id",
        ]));
        return hasUsername && hasChannel;
    });

    if (!discovered) {
        throw new Error("Instagram watch-state model could not be resolved");
    }
    return discovered;
}

function resolveWatchPaths(model: Model<any>): WatchPaths {
    const username = firstSchemaPath(model, [
        "username",
        "instagramUsername",
        "instagram_username",
        "profileUsername",
    ]);
    const channelId = firstSchemaPath(model, ["channelId", "channel_id"]);

    if (!username || !channelId) {
        throw new Error("Instagram watch-state schema is missing username/channel fields");
    }

    return {
        username,
        channelId,
        guildId: firstSchemaPath(model, ["guildId", "guild_id"]),
        active: firstSchemaPath(model, ["isActive", "is_active", "active", "enabled"]),
        lastPostId: firstSchemaPath(model, ["lastPostId", "last_post_id"]),
        lastCheckedAt: firstSchemaPath(model, [
            "lastCheckedAt",
            "last_checked_at",
            "last_checked",
        ]),
        createdAt: firstSchemaPath(model, ["createdAt", "created_at"]),
    };
}

function documentValue(document: any, path?: string): unknown {
    if (!path) return undefined;
    return typeof document.get === "function"
        ? document.get(path)
        : document[path];
}

function validDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? undefined : date;
}

async function loadActiveWatches(): Promise<LoadedWatches> {
    const model = resolveWatchModel();
    const paths = resolveWatchPaths(model);
    const query = paths.active ? { [paths.active]: { $ne: false } } : {};
    const documents = await model.find(query);
    const watches: WatchRef[] = [];

    for (const document of documents) {
        const username = normalizeInstagramUsername(
            String(documentValue(document, paths.username) || "")
        );
        const channelId = String(documentValue(document, paths.channelId) || "");
        if (!username || !channelId) continue;

        watches.push({
            id: String(document._id),
            username,
            channelId,
            guildId: String(documentValue(document, paths.guildId) || "") || undefined,
            legacyLastPostId:
                String(documentValue(document, paths.lastPostId) || "") || undefined,
            createdAt: validDate(documentValue(document, paths.createdAt)),
        });
    }

    return { model, paths, watches };
}

function groupWatchesByUsername(watches: WatchRef[]): Map<string, WatchRef[]> {
    const grouped = new Map<string, WatchRef[]>();
    for (const watch of watches) {
        const existing = grouped.get(watch.username) || [];
        existing.push(watch);
        grouped.set(watch.username, existing);
    }
    return grouped;
}

async function acquireBatchLock(): Promise<boolean> {
    const now = new Date();
    try {
        const lock = await InstagramBatchStateModel.findOneAndUpdate(
            {
                key: BATCH_LOCK_KEY,
                $or: [
                    { lockUntil: { $exists: false } },
                    { lockUntil: { $lte: now } },
                ],
            },
            {
                $setOnInsert: { key: BATCH_LOCK_KEY },
                $set: {
                    lockUntil: new Date(now.getTime() + BATCH_LOCK_MS),
                    updatedAt: now,
                },
            },
            { upsert: true, new: true }
        );
        return lock !== null;
    } catch (error: any) {
        if (error?.code === 11000) return false;
        throw error;
    }
}

async function releaseBatchLock(): Promise<void> {
    await InstagramBatchStateModel.updateOne(
        { key: BATCH_LOCK_KEY },
        {
            $set: {
                lockUntil: new Date(0),
                updatedAt: new Date(),
            },
        }
    );
}

async function updateLegacyWatch(
    loaded: LoadedWatches,
    watch: WatchRef,
    postId?: string,
    checkedAt?: Date
): Promise<void> {
    const update: Record<string, unknown> = {};
    if (postId && loaded.paths.lastPostId) {
        update[loaded.paths.lastPostId] = postId;
        watch.legacyLastPostId = postId;
    }
    if (checkedAt && loaded.paths.lastCheckedAt) {
        update[loaded.paths.lastCheckedAt] = checkedAt;
    }
    if (!Object.keys(update).length) return;
    await loaded.model.updateOne({ _id: watch.id }, { $set: update });
}

async function loadCursorMap(watches: WatchRef[]): Promise<Map<string, CursorRef>> {
    const documents = await InstagramWatchCursorModel.find({
        watchId: { $in: watches.map((watch) => watch.id) },
    }).lean();

    return new Map(
        (documents as any[]).map((document) => [
            String(document.watchId),
            { lastPostId: document.lastPostId || undefined },
        ])
    );
}

async function initializeCursor(
    watch: WatchRef,
    cursorMap: Map<string, CursorRef>,
    lastPostId?: string
): Promise<CursorRef> {
    const now = new Date();
    await InstagramWatchCursorModel.updateOne(
        { watchId: watch.id },
        {
            $setOnInsert: {
                watchId: watch.id,
                initializedAt: now,
            },
            $set: {
                username: watch.username,
                ...(lastPostId ? { lastPostId } : {}),
                updatedAt: now,
            },
        },
        { upsert: true }
    );
    const cursor = { lastPostId };
    cursorMap.set(watch.id, cursor);
    return cursor;
}

function postsAfterCursor(
    posts: InstagramPost[],
    cursorPostId: string | undefined,
    watchCreatedAt: Date | undefined
): InstagramPost[] {
    if (cursorPostId) {
        const cursorIndex = posts.findIndex((post) => post.id === cursorPostId);
        if (cursorIndex >= 0) return posts.slice(cursorIndex + 1);
    }

    if (watchCreatedAt) {
        return posts.filter((post) => {
            if (!post.publishedAt) return false;
            return new Date(post.publishedAt).getTime() > watchCreatedAt.getTime();
        });
    }

    return cursorPostId ? posts : [];
}

async function enqueueProfilePosts(
    loaded: LoadedWatches,
    profile: InstagramProfileBatchResult,
    profileWatches: WatchRef[],
    cursorMap: Map<string, CursorRef>,
    checkedAt: Date
): Promise<number> {
    const posts = profile.posts;
    const operations: any[] = [];

    for (const watch of profileWatches) {
        let cursor = cursorMap.get(watch.id);

        if (!cursor) {
            if (watch.legacyLastPostId) {
                cursor = await initializeCursor(
                    watch,
                    cursorMap,
                    watch.legacyLastPostId
                );
            } else if (!watch.createdAt) {
                const newestPostId = posts[posts.length - 1]?.id;
                cursor = await initializeCursor(watch, cursorMap, newestPostId);
                await updateLegacyWatch(loaded, watch, newestPostId, checkedAt);
                continue;
            } else {
                cursor = await initializeCursor(watch, cursorMap);
            }
        }

        const newPosts = postsAfterCursor(
            posts,
            cursor.lastPostId,
            watch.createdAt
        );

        if (
            newPosts.length === 0 &&
            !cursor.lastPostId &&
            posts.length > 0
        ) {
            const newestPostId = posts[posts.length - 1].id;
            await InstagramWatchCursorModel.updateOne(
                { watchId: watch.id },
                { $set: { lastPostId: newestPostId, updatedAt: checkedAt } }
            );
            cursor.lastPostId = newestPostId;
            await updateLegacyWatch(loaded, watch, newestPostId, checkedAt);
            continue;
        }

        for (const post of newPosts) {
            const publishedAt = validDate(post.publishedAt);
            operations.push({
                updateOne: {
                    filter: { watchId: watch.id, postId: post.id },
                    update: {
                        $setOnInsert: {
                            watchId: watch.id,
                            guildId: watch.guildId,
                            channelId: watch.channelId,
                            postId: post.id,
                            status: "pending",
                            attempts: 0,
                            discoveredAt: checkedAt,
                        },
                        $set: {
                            postUrl: post.url,
                            caption: post.caption,
                            mediaType: post.mediaType,
                            imageUrl: post.imageUrl,
                            profileImageUrl: profile.profileImageUrl,
                            publishedAt,
                            updatedAt: checkedAt,
                        },
                    },
                    upsert: true,
                },
            });
        }

        await updateLegacyWatch(loaded, watch, undefined, checkedAt);
    }

    if (operations.length) {
        await InstagramDeliveryModel.bulkWrite(operations, { ordered: false });
    }
    return operations.length;
}

function safeDescription(caption: unknown): string | null {
    const text = typeof caption === "string" ? caption.trim() : "";
    if (!text) return null;
    return text.length > 4_000 ? text.slice(0, 3_997) + "..." : text;
}

async function buildPostAttachment(
    imageUrl: unknown,
    postId: unknown
): Promise<{ attachment: AttachmentBuilder; imageUrl: string } | null> {
    if (typeof imageUrl !== "string" || !/^https:\/\//i.test(imageUrl)) {
        return null;
    }

    try {
        const response = await fetch(imageUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                Referer: "https://www.instagram.com/",
            },
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) return null;

        const contentType = (response.headers.get("content-type") || "")
            .split(";", 1)[0]
            .toLowerCase();
        const extension = new Map([
            ["image/gif", "gif"],
            ["image/jpeg", "jpg"],
            ["image/png", "png"],
            ["image/webp", "webp"],
        ]).get(contentType);
        if (!extension) return null;

        const data = Buffer.from(await response.arrayBuffer());
        if (!data.length || data.length > 8 * 1024 * 1024) return null;

        const safePostId = String(postId || "post")
            .replace(/[^a-z0-9_-]/gi, "-")
            .slice(0, 64) || "post";
        const filename = "instagram-" + safePostId + "." + extension;

        return {
            attachment: new AttachmentBuilder(data, { name: filename }),
            imageUrl: "attachment://" + filename,
        };
    } catch {
        return null;
    }
}

async function resolveTextChannel(
    client: MyClient,
    channelId: string
): Promise<TextChannel> {
    const cached = client.channels.cache.get(channelId);
    const channel = cached || await client.channels.fetch(channelId).catch(() => null);
    if (!channel || typeof (channel as any).send !== "function") {
        throw new Error("Discord channel is unavailable");
    }
    return channel as TextChannel;
}

async function sendDelivery(
    client: MyClient,
    watch: WatchRef,
    delivery: any
): Promise<void> {
    const channel = await resolveTextChannel(client, watch.channelId);
    const postUrl = String(delivery.postUrl || "");
    if (!/^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels)\//i.test(postUrl)) {
        throw new Error("Instagram delivery has an invalid post URL");
    }

    const embed = new EmbedBuilder()
        .setColor(0xe1306c)
        .setAuthor({
            name: "@" + watch.username + " on Instagram",
            ...(delivery.profileImageUrl
                ? { iconURL: String(delivery.profileImageUrl) }
                : {}),
        });

    const description = safeDescription(delivery.caption);
    if (description) embed.setDescription(description);

    const postAttachment = await buildPostAttachment(
        delivery.imageUrl,
        delivery.postId
    );

    if (postAttachment) {
        embed.setImage(postAttachment.imageUrl);
    } else if (
        typeof delivery.imageUrl === "string" &&
        /^https:\/\//i.test(delivery.imageUrl)
    ) {
        embed.setImage(delivery.imageUrl);
    }

    const publishedAt = validDate(delivery.publishedAt);
    if (publishedAt) embed.setTimestamp(publishedAt);

    const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("View on Instagram")
            .setStyle(ButtonStyle.Link)
            .setURL(postUrl)
    );

    const payload = {
        embeds: [embed],
        components: [actions],
        allowedMentions: { parse: [] as string[] },
        ...(postAttachment ? { files: [postAttachment.attachment] } : {}),
    };

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            await channel.send(payload);
            return;
        } catch (error) {
            lastError = error;
            if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 1_500));
            }
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Discord delivery failed");
}

async function drainDeliveries(
    client: MyClient,
    loaded: LoadedWatches,
    cursorMap: Map<string, CursorRef>
): Promise<void> {
    if (!loaded.watches.length) return;

    const now = new Date();
    const deliveries = await InstagramDeliveryModel.find({
        watchId: { $in: loaded.watches.map((watch) => watch.id) },
        attempts: { $lt: MAX_DELIVERY_ATTEMPTS },
        $or: [
            { status: { $in: ["pending", "failed"] } },
            { status: "sending", lockedUntil: { $lte: now } },
        ],
    })
        .sort({ publishedAt: 1, discoveredAt: 1 })
        .limit(5_000);

    const watchById = new Map(
        loaded.watches.map((watch) => [watch.id, watch])
    );
    const grouped = new Map<string, any[]>();

    for (const delivery of deliveries) {
        const watchId = String(delivery.watchId);
        const existing = grouped.get(watchId) || [];
        existing.push(delivery);
        grouped.set(watchId, existing);
    }

    for (const [watchId, watchDeliveries] of grouped) {
        const watch = watchById.get(watchId);
        if (!watch) continue;

        for (const queued of watchDeliveries) {
            const claimTime = new Date();
            const claimed = await InstagramDeliveryModel.findOneAndUpdate(
                {
                    _id: queued._id,
                    attempts: { $lt: MAX_DELIVERY_ATTEMPTS },
                    $or: [
                        { status: { $in: ["pending", "failed"] } },
                        {
                            status: "sending",
                            lockedUntil: { $lte: claimTime },
                        },
                    ],
                },
                {
                    $set: {
                        status: "sending",
                        lockedUntil: new Date(
                            claimTime.getTime() + DELIVERY_LOCK_MS
                        ),
                        updatedAt: claimTime,
                    },
                    $inc: { attempts: 1 },
                },
                { new: true }
            );
            if (!claimed) continue;

            try {
                await sendDelivery(client, watch, claimed);
                const sentAt = new Date();
                await InstagramDeliveryModel.updateOne(
                    { _id: claimed._id },
                    {
                        $set: {
                            status: "sent",
                            sentAt,
                            updatedAt: sentAt,
                            lockedUntil: null,
                        },
                        $unset: { lastError: 1 },
                    }
                );
                await InstagramWatchCursorModel.updateOne(
                    { watchId },
                    {
                        $set: {
                            lastPostId: String(claimed.postId),
                            updatedAt: sentAt,
                        },
                    },
                    { upsert: true }
                );
                cursorMap.set(watchId, {
                    lastPostId: String(claimed.postId),
                });
                await updateLegacyWatch(
                    loaded,
                    watch,
                    String(claimed.postId),
                    sentAt
                );
            } catch (error) {
                const message = error instanceof Error
                    ? error.message.slice(0, 500)
                    : "Unknown Discord delivery error";
                const terminal = Number(claimed.attempts) >= MAX_DELIVERY_ATTEMPTS;
                await InstagramDeliveryModel.updateOne(
                    { _id: claimed._id },
                    {
                        $set: {
                            status: terminal ? "dead" : "failed",
                            lastError: message,
                            updatedAt: new Date(),
                            lockedUntil: null,
                        },
                    }
                );
                console.error(
                    "[Instagram] delivery failed for @" +
                    watch.username + " in channel " + watch.channelId + ": " + message
                );
                break;
            }
        }
    }
}

async function markProfileSuccess(
    username: string,
    completedAt: Date
): Promise<void> {
    await InstagramProfileSyncModel.updateOne(
        { username },
        {
            $set: {
                lastSuccessfulAt: completedAt,
                nextAttemptAt: new Date(
                    completedAt.getTime() + PROFILE_SYNC_INTERVAL_MS
                ),
                failureCount: 0,
                updatedAt: completedAt,
            },
            $unset: { lastError: 1 },
        },
        { upsert: true }
    );
}

async function markProfileFailure(
    username: string,
    currentFailureCount: number,
    error: string
): Promise<void> {
    const failureCount = currentFailureCount + 1;
    const retryDays = Math.min(7, Math.pow(2, Math.max(0, failureCount - 1)));
    const now = new Date();

    await InstagramProfileSyncModel.updateOne(
        { username },
        {
            $set: {
                nextAttemptAt: new Date(
                    now.getTime() + retryDays * 24 * 60 * 60 * 1_000
                ),
                failureCount,
                lastError: error.slice(0, 500),
                updatedAt: now,
            },
            $setOnInsert: { username },
        },
        { upsert: true }
    );
}

async function runInstagramBatch(client: MyClient): Promise<void> {
    if (instagramJobRunning) {
        console.warn("[Instagram] local batch is already running; skipping");
        return;
    }
    instagramJobRunning = true;

    let lockAcquired = false;
    try {
        lockAcquired = await acquireBatchLock();
        if (!lockAcquired) {
            console.log("[Instagram] another process owns the batch lock");
            return;
        }

        const loaded = await loadActiveWatches();
        if (!loaded.watches.length) return;

        const cursorMap = await loadCursorMap(loaded.watches);
        await drainDeliveries(client, loaded, cursorMap);

        if (!process.env.BRIGHTDATA_API_TOKEN?.trim()) {
            console.error("[Instagram] BRIGHTDATA_API_TOKEN is not configured");
            return;
        }

        const watchesByUsername = groupWatchesByUsername(loaded.watches);
        const usernames = [...watchesByUsername.keys()].sort();

        if (usernames.length > MAX_ACTIVE_PROFILES) {
            console.error(
                "[Instagram] " + usernames.length +
                " unique profiles exceed the free-tier safety cap of " +
                MAX_ACTIVE_PROFILES + "; batch not started"
            );
            return;
        }

        const stateDocuments = await InstagramProfileSyncModel.find({
            username: { $in: usernames },
        }).lean();
        const stateByUsername = new Map(
            (stateDocuments as any[]).map((state) => [
                String(state.username),
                state,
            ])
        );

        const now = new Date();
        const dueUsernames = usernames.filter((username) => {
            const state = stateByUsername.get(username);
            const nextAttemptAt = validDate(state?.nextAttemptAt);
            if (nextAttemptAt) return nextAttemptAt.getTime() <= now.getTime();

            const lastSuccessfulAt = validDate(state?.lastSuccessfulAt);
            return !lastSuccessfulAt ||
                lastSuccessfulAt.getTime() + PROFILE_SYNC_INTERVAL_MS <= now.getTime();
        });

        if (!dueUsernames.length) return;

        const inputs = dueUsernames.map((username) => {
            const state = stateByUsername.get(username);
            const lastSuccessfulAt = validDate(state?.lastSuccessfulAt);
            const startAt = lastSuccessfulAt
                ? new Date(lastSuccessfulAt.getTime() - OVERLAP_MS)
                : new Date(now.getTime() - INITIAL_LOOKBACK_MS);

            return {
                username,
                startAt,
                endAt: now,
                postLimit: MAX_POSTS_PER_PROFILE,
            };
        });

        console.log(
            "[Instagram] starting weekly Bright Data batch for " +
            dueUsernames.length + " unique profile(s)"
        );
        const profiles = await fetchInstagramProfileBatch(inputs);
        const profilesByUsername = new Map(
            profiles.map((profile) => [profile.username, profile])
        );

        let queuedCount = 0;
        for (const username of dueUsernames) {
            const currentState = stateByUsername.get(username);
            const currentFailures = Number(currentState?.failureCount || 0);
            const profile = profilesByUsername.get(username);

            if (!profile) {
                await markProfileFailure(
                    username,
                    currentFailures,
                    "Bright Data returned no record for this profile"
                );
                continue;
            }

            if (profile.error) {
                await markProfileFailure(
                    username,
                    currentFailures,
                    profile.error
                );
                continue;
            }

            try {
                if (profile.posts.length >= MAX_POSTS_PER_PROFILE) {
                    console.warn(
                        "[Instagram] @" + username + " reached the " +
                        MAX_POSTS_PER_PROFILE +
                        "-post weekly safety limit; review this account"
                    );
                }

                queuedCount += await enqueueProfilePosts(
                    loaded,
                    profile,
                    watchesByUsername.get(username) || [],
                    cursorMap,
                    now
                );
                await markProfileSuccess(username, now);

                if (profile.isPrivate) {
                    console.warn(
                        "[Instagram] @" + username +
                        " is private; no public posts can be collected"
                    );
                }
            } catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : "Failed to persist Instagram profile results";
                await markProfileFailure(username, currentFailures, message);
            }
        }

        await drainDeliveries(client, loaded, cursorMap);
        console.log(
            "[Instagram] batch complete: " + profiles.length +
            " profile record(s), " + queuedCount + " delivery item(s) queued"
        );
    } catch (error) {
        console.error(
            "[Instagram] weekly batch failed:",
            error instanceof Error ? error.message : "unknown error"
        );
    } finally {
        if (lockAcquired) {
            await releaseBatchLock().catch((error) => {
                console.error("[Instagram] failed to release batch lock:", error);
            });
        }
        instagramJobRunning = false;
    }
}

export const event: Event = {
    name: "clientReady",
    once: true,
    async execute(client: MyClient) {
        if (instagramCronInitialized) return;
        instagramCronInitialized = true;

        cron.schedule(
            DAILY_GATE_CRON,
            async () => {
                await runInstagramBatch(client);
            },
            { timezone: CRON_TIMEZONE }
        );

        console.log(
            "[Instagram] weekly Bright Data batch monitor loaded " +
            "(daily recovery gate at 09:00 Asia/Jakarta)"
        );
    },
};
