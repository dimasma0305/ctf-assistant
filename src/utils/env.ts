const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export function isTruthyEnv(value: string | undefined | null): boolean {
  if (!value) {
    return false;
  }

  return TRUE_ENV_VALUES.has(value.trim().toLowerCase());
}

export function isNoDbMode(): boolean {
  return isTruthyEnv(process.env.NODB);
}

export function getMongoUri(): string {
  return process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL || "";
}
