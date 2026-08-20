type GuildRoleConfig = Record<string, Record<string, string | string[]>>;

let parsedConfig: GuildRoleConfig | null = null;
let warnedInvalid = false;

function roleConfig(): GuildRoleConfig {
    if (parsedConfig) return parsedConfig;
    try {
        const parsed = JSON.parse(process.env.DISCORD_ROLE_IDS_JSON || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid root");
        parsedConfig = parsed as GuildRoleConfig;
    } catch {
        parsedConfig = {};
        if (!warnedInvalid) {
            warnedInvalid = true;
            console.error("[Authorization] DISCORD_ROLE_IDS_JSON is invalid; privileged role commands fail closed");
        }
    }
    return parsedConfig;
}

export function hasConfiguredRole(guildId: string, memberRoleIds: Iterable<string>, allowedRoleNames: string[]): boolean {
    const guildConfig = roleConfig()[guildId];
    if (!guildConfig) return false;
    const allowedIds = new Set<string>();
    for (const name of allowedRoleNames) {
        const configured = guildConfig[name];
        if (typeof configured === "string") allowedIds.add(configured);
        if (Array.isArray(configured)) configured.forEach((id) => typeof id === "string" && allowedIds.add(id));
    }
    if (!allowedIds.size) return false;
    for (const id of memberRoleIds) {
        if (allowedIds.has(id)) return true;
    }
    return false;
}

export function validateRoleAuthorizationConfig(): boolean {
    const config = roleConfig();
    return Object.values(config).some((roles) => roles && typeof roles === "object" && Object.keys(roles).length > 0);
}
