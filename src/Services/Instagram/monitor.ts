const BRIGHT_DATA_API_ROOT = "https://api.brightdata.com/datasets/v3";
const INSTAGRAM_PROFILE_DATASET_ID = "gd_l1vikfch901nx3by4";
const MAX_BATCH_SIZE = 5_000;
const DEFAULT_POST_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 60_000;
const SNAPSHOT_TIMEOUT_MS = 15 * 60_000;
const SNAPSHOT_POLL_INTERVAL_MS = 5_000;

type JsonObject = Record<string, any>;

export interface InstagramPost {
    id: string;
    shortcode: string;
    username: string;
    caption: string;
    url: string;
    permalink: string;
    mediaType: string;
    imageUrl?: string;
    mediaUrl?: string;
    publishedAt?: string;
    timestamp?: string;
}

export interface InstagramProfileBatchInput {
    username: string;
    startAt: Date;
    endAt: Date;
    postLimit?: number;
    excludedPostIds?: string[];
}

export interface InstagramProfileBatchResult {
    username: string;
    profileImageUrl?: string;
    isPrivate: boolean;
    posts: InstagramPost[];
    error?: string;
}

const sleep = (milliseconds: number) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

function asObject(value: unknown): JsonObject | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as JsonObject
        : null;
}

function firstString(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value.trim();
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "";
}

function valueError(value: unknown): string {
    if (typeof value === "string") return value.slice(0, 500);
    const object = asObject(value);
    if (!object) return "";
    return firstString(object.message, object.error, object.error_message).slice(0, 500);
}

function extractShortcode(url: string): string {
    const match = url.match(/instagram\.com\/(?:p|reel|reels)\/([^/?#]+)/i);
    return match?.[1] || "";
}

function parseDate(value: unknown): Date | undefined {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    if (typeof value === "number" && Number.isFinite(value)) {
        const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
        const date = new Date(milliseconds);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }

    if (typeof value === "string" && value.trim()) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && /^[0-9]+$/.test(value.trim())) {
            return parseDate(numeric);
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }

    return undefined;
}

function findHttpUrl(value: unknown): string | undefined {
    if (typeof value === "string" && /^https:\/\//i.test(value)) return value;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findHttpUrl(item);
            if (found) return found;
        }
    }

    const object = asObject(value);
    if (object) {
        for (const key of ["url", "src", "display_url", "image_url"]) {
            const found = findHttpUrl(object[key]);
            if (found) return found;
        }
    }

    return undefined;
}

function formatBrightDataDate(date: Date): string {
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return month + "-" + day + "-" + date.getUTCFullYear();
}

export function normalizeInstagramUsername(value: string): string {
    let candidate = value.trim().toLowerCase();
    if (!candidate) return "";

    try {
        const parsed = new URL(
            candidate.includes("://") ? candidate : "https://" + candidate
        );
        if (parsed.hostname === "instagram.com" || parsed.hostname.endsWith(".instagram.com")) {
            candidate = parsed.pathname.split("/").filter(Boolean)[0] || "";
        }
    } catch {
        // A plain username is expected to fail URL parsing on some runtimes.
    }

    candidate = candidate.replace(/^@/, "").split(/[/?#]/)[0];
    return /^[a-z0-9._]{1,30}$/.test(candidate) ? candidate : "";
}

function recordUsername(record: JsonObject, fallback: string): string {
    const input = asObject(record.input);
    const candidates = [
        record.account,
        record.user_name,
        record.username,
        record.profile_url,
        input?.url,
        typeof record.input === "string" ? record.input : undefined,
        record.url,
        fallback,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeInstagramUsername(firstString(candidate));
        if (normalized) return normalized;
    }

    return "";
}

function normalizePost(value: unknown, username: string): InstagramPost | null {
    const post = asObject(value);
    if (!post) return null;

    const suppliedUrl = firstString(post.permalink, post.post_url, post.url);
    const shortcode = firstString(
        post.shortcode,
        post.short_code,
        post.code,
        extractShortcode(suppliedUrl)
    );
    const id = firstString(post.id, post.post_id, post.pk, shortcode, suppliedUrl);
    if (!id) return null;

    const instagramUrl = /instagram\.com\/(?:p|reel|reels)\//i.test(suppliedUrl)
        ? suppliedUrl
        : shortcode
            ? "https://www.instagram.com/p/" + shortcode + "/"
            : "https://www.instagram.com/" + username + "/";

    const publishedDate = parseDate(
        post.date_posted ??
        post.timestamp ??
        post.taken_at_timestamp ??
        post.taken_at ??
        post.created_at
    );
    const publishedAt = publishedDate?.toISOString();
    const imageUrl = findHttpUrl(
        post.display_url ??
        post.image_url ??
        post.thumbnail_url ??
        post.thumbnail ??
        post.images ??
        post.image
    );
    const mediaType = firstString(
        post.content_type,
        post.product_type,
        post.type,
        post.media_type
    ) || "Post";

    return {
        id,
        shortcode: shortcode || id,
        username,
        caption: firstString(post.caption, post.description, post.text),
        url: instagramUrl,
        permalink: instagramUrl,
        mediaType,
        imageUrl,
        mediaUrl: imageUrl,
        publishedAt,
        timestamp: publishedAt,
    };
}

function normalizeProfile(
    value: unknown,
    fallbackUsername: string
): InstagramProfileBatchResult | null {
    const record = asObject(value);
    if (!record) return null;

    const username = recordUsername(record, fallbackUsername);
    if (!username) return null;

    const rawError = valueError(record.error ?? record.error_message);
    const rawPosts = Array.isArray(record.posts)
        ? record.posts
        : Array.isArray(record.latest_posts)
            ? record.latest_posts
            : [];

    const byId = new Map<string, InstagramPost>();
    for (const rawPost of rawPosts) {
        const post = normalizePost(rawPost, username);
        if (post) byId.set(post.id, post);
    }

    const posts = [...byId.values()].sort((left, right) => {
        const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
        const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
        return leftTime - rightTime || left.id.localeCompare(right.id);
    });

    return {
        username,
        profileImageUrl: findHttpUrl(
            record.profile_image_link ??
            record.profile_pic_url ??
            record.profile_image_url
        ),
        isPrivate: record.is_private === true,
        posts,
        error: rawError || undefined,
    };
}

async function readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            "Bright Data returned invalid JSON with HTTP " + response.status
        );
    }
}

function apiMessage(body: unknown): string {
    if (typeof body === "string") return body.slice(0, 500);
    const object = asObject(body);
    if (!object) return "Unknown API error";
    return firstString(
        object.error,
        object.error_message,
        object.message,
        object.status
    ).slice(0, 500) || "Unknown API error";
}

async function getJsonWithRetry(
    url: string,
    token: string,
    attempts = 3
): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { Authorization: "Bearer " + token },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            const body = await readJson(response);
            if (response.ok) return body;
            throw new Error(
                "Bright Data HTTP " + response.status + ": " + apiMessage(body)
            );
        } catch (error) {
            lastError = error;
            if (attempt < attempts) await sleep(attempt * 1_500);
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Bright Data request failed");
}

async function waitForSnapshot(snapshotId: string, token: string): Promise<unknown> {
    const deadline = Date.now() + SNAPSHOT_TIMEOUT_MS;
    let lastProgressError: unknown;

    while (Date.now() < deadline) {
        try {
            const progress = asObject(await getJsonWithRetry(
                BRIGHT_DATA_API_ROOT + "/progress/" + encodeURIComponent(snapshotId),
                token,
                2
            ));
            const status = firstString(progress?.status).toLowerCase();

            if (status === "ready") {
                return getJsonWithRetry(
                    BRIGHT_DATA_API_ROOT + "/snapshot/" +
                    encodeURIComponent(snapshotId) + "?format=json",
                    token,
                    3
                );
            }

            if (status === "failed") {
                throw new Error(
                    "Bright Data snapshot failed: " + apiMessage(progress)
                );
            }
        } catch (error) {
            lastProgressError = error;
            if (
                error instanceof Error &&
                error.message.startsWith("Bright Data snapshot failed:")
            ) {
                throw error;
            }
        }

        await sleep(SNAPSHOT_POLL_INTERVAL_MS);
    }

    const suffix = lastProgressError instanceof Error
        ? ": " + lastProgressError.message
        : "";
    throw new Error("Bright Data snapshot timed out" + suffix);
}

export async function fetchInstagramProfileBatch(
    inputs: InstagramProfileBatchInput[]
): Promise<InstagramProfileBatchResult[]> {
    const token = process.env.BRIGHTDATA_API_TOKEN?.trim();
    if (!token) {
        throw new Error("BRIGHTDATA_API_TOKEN is not configured");
    }

    const uniqueInputs = new Map<string, InstagramProfileBatchInput>();
    for (const input of inputs) {
        const username = normalizeInstagramUsername(input.username);
        if (!username) continue;
        uniqueInputs.set(username, { ...input, username });
    }

    const normalizedInputs = [...uniqueInputs.values()];
    if (normalizedInputs.length === 0) return [];
    if (normalizedInputs.length > MAX_BATCH_SIZE) {
        throw new Error(
            "Bright Data batch exceeds " + MAX_BATCH_SIZE + " unique profiles"
        );
    }

    const requestBody = {
        input: normalizedInputs.map((input) => ({
            url: "https://www.instagram.com/" + input.username + "/",
            num_of_posts: Math.max(
                1,
                Math.min(input.postLimit || DEFAULT_POST_LIMIT, DEFAULT_POST_LIMIT)
            ),
            start_date: formatBrightDataDate(input.startAt),
            end_date: formatBrightDataDate(input.endAt),
            ...(input.excludedPostIds?.length
                ? { posts_to_not_include: input.excludedPostIds.slice(0, 100) }
                : {}),
        })),
    };

    const triggerUrl = new URL(BRIGHT_DATA_API_ROOT + "/trigger");
    triggerUrl.searchParams.set("dataset_id", INSTAGRAM_PROFILE_DATASET_ID);
    triggerUrl.searchParams.set("type", "discover_new");
    triggerUrl.searchParams.set("discover_by", "url");
    triggerUrl.searchParams.set("include_errors", "true");
    triggerUrl.searchParams.set("format", "json");

    const triggerResponse = await fetch(triggerUrl, {
        method: "POST",
        headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const triggerBody = await readJson(triggerResponse);
    if (!triggerResponse.ok) {
        throw new Error(
            "Bright Data trigger HTTP " + triggerResponse.status + ": " +
            apiMessage(triggerBody)
        );
    }

    const snapshotId = firstString(asObject(triggerBody)?.snapshot_id);
    if (!snapshotId) {
        throw new Error("Bright Data trigger did not return a snapshot_id");
    }

    const snapshot = await waitForSnapshot(snapshotId, token);
    const records = Array.isArray(snapshot) ? snapshot : [snapshot];

    return records
        .map((record, index) => normalizeProfile(
            record,
            normalizedInputs[index]?.username || ""
        ))
        .filter((profile): profile is InstagramProfileBatchResult => profile !== null);
}

export async function fetchLatestInstagramPost(
    username: string
): Promise<InstagramPost | null> {
    const endAt = new Date();
    const startAt = new Date(endAt.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const profiles = await fetchInstagramProfileBatch([
        { username, startAt, endAt, postLimit: 1 },
    ]);
    const posts = profiles[0]?.posts || [];
    return posts.length ? posts[posts.length - 1] : null;
}

export const getLatestInstagramPost = fetchLatestInstagramPost;
export const getLatestPost = fetchLatestInstagramPost;
export type InstagramMedia = InstagramPost;

export interface ResolvedInstagramAccount {
    id: string;
    accountId: string;
    username: string;
    name: string;
    toString(): string;
}

/**
 * Compatibility resolver for the existing Instagram watch command.
 *
 * Bright Data does not expose a free username-to-Meta-ID lookup, and resolving
 * every account while creating a watch would spend an additional dataset row.
 * The monitor uses normalized usernames as stable account keys instead; the
 * scheduled batch fetch validates and hydrates them when it runs.
 */
export async function resolveInstagramAccountByUsername(
    username: string
): Promise<ResolvedInstagramAccount | null> {
    const normalized = normalizeInstagramUsername(username);
    if (!normalized) return null;

    return Object.assign(new String(normalized), {
        id: normalized,
        accountId: normalized,
        username: normalized,
        name: normalized,
    }) as unknown as ResolvedInstagramAccount;
}
