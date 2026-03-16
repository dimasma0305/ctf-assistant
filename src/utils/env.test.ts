import { afterEach, describe, expect, test } from "bun:test";
import { getMongoUri, isNoDbMode, isTruthyEnv } from "./env";

const ORIGINAL_NODB = process.env.NODB;
const ORIGINAL_MONGO_URI = process.env.MONGO_URI;
const ORIGINAL_MONGODB_URI = process.env.MONGODB_URI;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

afterEach(() => {
  if (ORIGINAL_NODB === undefined) delete process.env.NODB;
  else process.env.NODB = ORIGINAL_NODB;

  if (ORIGINAL_MONGO_URI === undefined) delete process.env.MONGO_URI;
  else process.env.MONGO_URI = ORIGINAL_MONGO_URI;

  if (ORIGINAL_MONGODB_URI === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = ORIGINAL_MONGODB_URI;

  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

describe("isTruthyEnv", () => {
  test("treats common true-like values as true", () => {
    expect(isTruthyEnv("true")).toBe(true);
    expect(isTruthyEnv("TRUE")).toBe(true);
    expect(isTruthyEnv("1")).toBe(true);
    expect(isTruthyEnv(" yes ")).toBe(true);
  });

  test("treats false-like or empty values as false", () => {
    expect(isTruthyEnv(undefined)).toBe(false);
    expect(isTruthyEnv("")).toBe(false);
    expect(isTruthyEnv("false")).toBe(false);
    expect(isTruthyEnv("0")).toBe(false);
  });
});

describe("isNoDbMode", () => {
  test("does not disable the database when NODB=false", () => {
    process.env.NODB = "false";
    expect(isNoDbMode()).toBe(false);
  });

  test("disables the database when NODB=true", () => {
    process.env.NODB = "true";
    expect(isNoDbMode()).toBe(true);
  });
});

describe("getMongoUri", () => {
  test("prefers MONGO_URI over other variables", () => {
    process.env.MONGO_URI = "mongodb://mongo-uri";
    process.env.MONGODB_URI = "mongodb://mongodb-uri";
    process.env.DATABASE_URL = "mongodb://database-url";

    expect(getMongoUri()).toBe("mongodb://mongo-uri");
  });

  test("falls back through supported variable names", () => {
    delete process.env.MONGO_URI;
    process.env.MONGODB_URI = "mongodb://mongodb-uri";
    process.env.DATABASE_URL = "mongodb://database-url";
    expect(getMongoUri()).toBe("mongodb://mongodb-uri");

    delete process.env.MONGODB_URI;
    expect(getMongoUri()).toBe("mongodb://database-url");
  });
});
