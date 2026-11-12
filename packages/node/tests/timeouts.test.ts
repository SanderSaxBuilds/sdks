import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostShiba, PostShibaError, PostShibaTimeoutError } from "../src/index.js";
import type { PostShibaOptions } from "../src/index.js";

const catalog = join(dirname(fileURLToPath(import.meta.url)), "..", "../../fixtures/catalog");

function fixture(name: string) {
  return JSON.parse(readFileSync(join(catalog, `${name}.json`), "utf8"));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fetch that never answers and rejects the way fetch does when its signal aborts. */
function hang(_url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}

describe("timeouts and cancellation", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function client(options: PostShibaOptions = {}) {
    return new PostShiba("sk_test", { teamId: "KjkAJW", ...options });
  }

  function settled<T>(promise: Promise<T>): Promise<T | unknown> {
    return promise.then(
      (value) => value,
      (err: unknown) => err,
    );
  }

  function init(call = -1) {
    return (fetchMock.mock.calls.at(call) as [string, RequestInit])[1];
  }

  it("adds no signal and no timer when neither is asked for", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture("whoami")));
    await client().users.me();
    expect(init().signal).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails with PostShibaTimeoutError when the client timeout runs out", async () => {
    fetchMock.mockImplementation(hang);
    const outcome = settled(client({ timeout: 1000 }).clusters.list());
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const err = (await outcome) as PostShibaTimeoutError;
    expect(err).toBeInstanceOf(PostShibaTimeoutError);
    expect(err).not.toBeInstanceOf(PostShibaError);
    expect(err.name).toBe("PostShibaTimeoutError");
    expect(err.timeout).toBe(1000);
    expect(err.message).toBe("Request timed out after 1000 ms");
  });

  it("lets a per-call timeout override the client timeout", async () => {
    fetchMock.mockImplementation(hang);
    const outcome = settled(client({ timeout: 60_000 }).users.me({ timeout: 50 }));
    await vi.advanceTimersByTimeAsync(50);
    expect(((await outcome) as PostShibaTimeoutError).timeout).toBe(50);
  });

  it("ignores a zero or negative timeout", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(fixture("whoami")));
    await client({ timeout: 0 }).users.me();
    await client().users.me({ timeout: -5 });
    expect(init(0).signal).toBeUndefined();
    expect(init(1).signal).toBeUndefined();
  });

  it("clears the timer once the call settles", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture("whoami")));
    await client({ timeout: 5000 }).users.me();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry a timed-out send, which may have reached the API", async () => {
    fetchMock.mockImplementation(hang);
    const outcome = settled(client({ timeout: 200 }).emails.send(fixture("email_send_request")));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await outcome).toBeInstanceOf(PostShibaTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("counts retries and waits against the timeout", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    fetchMock.mockImplementation(async () => jsonResponse({ error: "rate_limited" }, 429));
    const outcome = settled(client({ timeout: 100 }).emails.send(fixture("email_send_request")));
    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toBeInstanceOf(PostShibaTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts an in-flight call with the caller's reason", async () => {
    fetchMock.mockImplementation(hang);
    const controller = new AbortController();
    const outcome = settled(client().clusters.get("NmQpXr", { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(0);
    const reason = new Error("user left the page");
    controller.abort(reason);
    expect(await outcome).toBe(reason);
  });

  it("rejects at once on a signal that is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const err = (await settled(client().users.me({ signal: controller.signal }))) as DOMException;
    expect(err.name).toBe("AbortError");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops waiting between retries when the signal aborts", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: "rate_limited" }, 429));
    const controller = new AbortController();
    const outcome = settled(client().emails.send(fixture("email_send_request"), { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    controller.abort();
    expect(((await outcome) as DOMException).name).toBe("AbortError");
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps clusterId and the signal together on emails.send", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture("email_send_response"), 201));
    const controller = new AbortController();
    await client().emails.send(fixture("email_send_request"), { clusterId: "NmQpXr", signal: controller.signal });
    expect(new Headers(init().headers).get("X-Capsule-Cluster-Id")).toBe("NmQpXr");
    expect(init().signal).toBeInstanceOf(AbortSignal);
  });

  it("takes signal and timeout next to the other sendOnCluster options", async () => {
    fetchMock.mockImplementation(hang);
    const outcome = settled(
      client().emails.sendOnCluster("NmQpXr", fixture("email_send_request"), { idempotencyKey: "ikey-1", timeout: 300 }),
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(await outcome).toBeInstanceOf(PostShibaTimeoutError);
    expect(new Headers(init().headers).get("Idempotency-Key")).toBe("ikey-1");
  });

  it("passes the options through on query and tenant calls", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    const controller = new AbortController();
    await client().tenants.delete("WbLcFd", { destination_tenant_id: "QrStUv", signal: controller.signal });
    expect((fetchMock.mock.calls.at(-1) as [string])[0]).toBe("https://app.postshiba.com/api/v1/tenants/WbLcFd?destination_tenant_id=QrStUv");
    expect(init().signal).toBeInstanceOf(AbortSignal);

    fetchMock.mockImplementation(async () => jsonResponse([]));
    await client().events.listTeam({ limit: 5 }, { signal: controller.signal });
    expect(init().signal).toBeInstanceOf(AbortSignal);
  });

  it("stops listening to the caller's signal after the call", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture("whoami")));
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await client().users.me({ signal: controller.signal });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(init().signal?.aborted).toBe(false);
    controller.abort();
    expect(init().signal?.aborted).toBe(false);
  });
});
