import { describe, expect, test } from "bun:test";
import type { Request, Response } from "express";
import { getScoreboard } from "./scoreboard";

function createResponseRecorder() {
  let statusCode = 200;
  let body: any;

  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: any) {
      body = value;
      return response;
    },
  } as unknown as Response;

  return {
    response,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

describe("GET /api/scoreboard query security", () => {
  test("rejects an object-shaped CTF ID before it reaches a Mongo filter", async () => {
    const recorder = createResponseRecorder();
    const request = {
      method: "GET",
      path: "/",
      params: {},
      query: {
        global: "false",
        ctf_id: { $ne: "" },
        limit: "10",
        offset: "0",
      },
    } as unknown as Request;

    await getScoreboard(request, recorder.response);

    expect(recorder.statusCode).toBe(400);
    expect(recorder.body).toMatchObject({
      error: "ctf_id must be a single string",
    });
  });

  test("rejects repeated search values instead of crashing on string methods", async () => {
    const recorder = createResponseRecorder();
    const request = {
      method: "GET",
      path: "/",
      params: {},
      query: {
        search: ["web", "pwn"],
      },
    } as unknown as Request;

    await getScoreboard(request, recorder.response);

    expect(recorder.statusCode).toBe(400);
    expect(recorder.body).toMatchObject({
      error: "search must be a single string",
    });
  });
});
