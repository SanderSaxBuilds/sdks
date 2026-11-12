import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostShiba, PostShibaError, isRetryable } from "../src/index.js";
import type { PostShibaOptions } from "../src/index.js";

const catalog = join(dirname(fileURLToPath(import.meta.url)), "..", "../../fixtures/catalog");

function fixture(name: string) {
  return JSON.parse(readFileSync(join(catalog, `${name}.json`), "utf8"));
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const rateLimited = () => jsonResponse({ error: "rate_limited" }, 429);
const unavailable = () => jsonResponse({ error: "inject_unavailable", field: "cluster", retryable: true }, 503);
const sent = () => jsonResponse(fixture("email_send_response"), 201);

describe("retries", () => {
  const fetchMock = vi.fn();
  let delays: number[];

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    delays = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function client(options: PostShibaOptions = {}) {
    return new PostShiba("sk_test", { teamId: "KjkAJW", ...options });
  }

  async function settle<T>(promise: Promise<T>): Promise<T | unknown> {
    const outcome = promise.then(
      (value) => value,
      (err: unknown) => err,
    );
    await vi.runAllTimersAsync();
    return outcome;
  }

  it("retries rate_limited and resolves", async () => {
    fetchMock.mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(sent());
    const result = await settle(client().emails.send(fixture("email_send_request")));
    expect(result).toEqual(fixture("email_send_response"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends the same body and headers on each attempt", async () => {
    fetchMock.mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(sent());
    await settle(client().emails.send(fixture("email_send_request"), { clusterId: "NmQpXr" }));
    const [first, second] = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(second[0]).toBe(first[0]);
    expect(second[1].body).toBe(first[1].body);
    expect(new Headers(second[1].headers).get("X-Capsule-Cluster-Id")).toBe("NmQpXr");
    expect(new Headers(second[1].headers).get("Authorization")).toBe("Bearer sk_test");
  });

  it("retries inject_unavailable", async () => {
    fetchMock.mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(sent());
    const result = await settle(client().emails.send(fixture("email_send_request")));
    expect(result).toEqual(fixture("email_send_response"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a reply marked retryable", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "idempotency_in_progress", retryable: true }, 409))
      .mockResolvedValueOnce(jsonResponse(fixture("email_sandbox_response"), 201));
    const result = await settle(
      client().emails.sendOnCluster("NmQpXr", fixture("email_send_request"), { idempotencyKey: "ikey-1" }),
    );
    expect(result).toEqual(fixture("email_sandbox_response"));
    const [, second] = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(new Headers(second[1].headers).get("Idempotency-Key")).toBe("ikey-1");
  });

  it("retries reads as well as sends", async () => {
    fetchMock.mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(jsonResponse([fixture("cluster")]));
    const result = await settle(client().clusters.list());
    expect(result).toEqual([fixture("cluster")]);
  });

  it("never retries throttled, even when the reply says retryable", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: "throttled", field: "cluster", retryable: true }, 429));
    const err = (await settle(client().emails.send(fixture("email_send_request")))) as PostShibaError;
    expect(err).toBeInstanceOf(PostShibaError);
    expect(err.code).toBe("throttled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("does not retry inject_timeout_unknown, which may have sent", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: "inject_timeout_unknown", retryable: false }, 502));
    const err = (await settle(client().emails.send(fixture("email_send_request")))) as PostShibaError;
    expect(err.code).toBe("inject_timeout_unknown");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a plain 500", async () => {
    fetchMock.mockImplementation(async () => new Response("oops", { status: 500 }));
    const err = (await settle(client().clusters.list())) as PostShibaError;
    expect(err.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 422", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(fixture("error_422"), 422));
    await settle(client().emails.send(fixture("email_send_request")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await settle(client().emails.send(fixture("email_send_request")));
    expect(err).toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after two retries by default and throws the last error", async () => {
    fetchMock.mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(unavailable());
    const err = (await settle(client().emails.send(fixture("email_send_request")))) as PostShibaError;
    expect(err.code).toBe("inject_unavailable");
    expect(err.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("turns retries off with maxRetries 0", async () => {
    fetchMock.mockImplementation(async () => rateLimited());
    const err = (await settle(client({ maxRetries: 0 }).emails.send(fixture("email_send_request")))) as PostShibaError;
    expect(err.code).toBe("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors a higher maxRetries", async () => {
    fetchMock.mockImplementation(async () => rateLimited());
    await settle(client({ maxRetries: 4 }).emails.send(fixture("email_send_request")));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("clamps a negative or fractional maxRetries", () => {
    expect(client({ maxRetries: -3 }).maxRetries).toBe(0);
    expect(client({ maxRetries: 2.7 }).maxRetries).toBe(2);
    expect(client().maxRetries).toBe(2);
  });

  it("backs off exponentially with jitter", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    fetchMock.mockImplementation(async () => rateLimited());
    await settle(client({ maxRetries: 6 }).emails.send(fixture("email_send_request")));
    expect(delays).toEqual([250, 500, 1000, 2000, 4000, 4000]);

    delays.length = 0;
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    await settle(client({ maxRetries: 2 }).emails.send(fixture("email_send_request")));
    expect(delays[0]).toBeCloseTo(500, 0);
    expect(delays[1]).toBeCloseTo(1000, 0);
  });

  it("waits for Retry-After given in seconds", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "3" })).mockResolvedValueOnce(sent());
    await settle(client().emails.send(fixture("email_send_request")));
    expect(delays).toEqual([3000]);
  });

  it("waits for Retry-After given as an HTTP date", async () => {
    vi.setSystemTime(new Date("2026-11-13T00:00:00Z"));
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "Fri, 13 Nov 2026 00:00:05 GMT" }))
      .mockResolvedValueOnce(sent());
    await settle(client().emails.send(fixture("email_send_request")));
    expect(delays).toEqual([5000]);
  });

  it("falls back to backoff when Retry-After is not readable", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "soon" })).mockResolvedValueOnce(sent());
    await settle(client().emails.send(fixture("email_send_request")));
    expect(delays).toEqual([250]);
  });

  it("does not wait out a Retry-After longer than a minute", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "3600" }));
    const err = (await settle(client().emails.send(fixture("email_send_request")))) as PostShibaError;
    expect(err.code).toBe("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("isRetryable follows the documented error codes", () => {
    const e = (attrs: ConstructorParameters<typeof PostShibaError>[0]) => new PostShibaError(attrs);
    expect(isRetryable(e({ error: "rate_limited", status: 429 }))).toBe(true);
    expect(isRetryable(e({ error: "inject_unavailable", status: 503 }))).toBe(true);
    expect(isRetryable(e({ error: "idempotency_unavailable", status: 503, retryable: true }))).toBe(true);
    expect(isRetryable(e({ error: "throttled", status: 429, retryable: true }))).toBe(false);
    expect(isRetryable(e({ error: "inject_failed", status: 502, retryable: false }))).toBe(false);
    expect(isRetryable(e({ error: "idempotency_outcome_unknown", status: 409 }))).toBe(false);
    expect(isRetryable(e({ error: "invalid", status: 422 }))).toBe(false);
  });
});
