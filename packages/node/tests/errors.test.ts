import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostShiba, PostShibaError } from "../src/index.js";

const catalog = join(dirname(fileURLToPath(import.meta.url)), "..", "../../fixtures/catalog");

function fixture(name: string) {
  return JSON.parse(readFileSync(join(catalog, `${name}.json`), "utf8"));
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("PostShibaError", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function client() {
    return new PostShiba("sk_test", { teamId: "KjkAJW" });
  }

  async function failWith(response: Response): Promise<PostShibaError> {
    fetchMock.mockResolvedValueOnce(response);
    const err = await client().emails.send(fixture("email_send_request")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PostShibaError);
    return err as PostShibaError;
  }

  it("carries status and code from the 403 fixture", async () => {
    const err = await failWith(jsonResponse(fixture("error_403"), 403));
    expect(err.status).toBe(403);
    expect(err.code).toBe("cluster_not_ready");
    expect(err.error).toBe("cluster_not_ready");
    expect(err.field).toBe("cluster");
    expect(err.message).toBe("No sending-ready cluster on this team");
    expect(err.retryable).toBeUndefined();
    expect(err.rule).toBeNull();
    expect(err.body).toEqual(fixture("error_403"));
  });

  it("carries status and field from the 422 fixture", async () => {
    const err = await failWith(jsonResponse(fixture("error_422"), 422));
    expect(err.status).toBe(422);
    expect(err.code).toBe("invalid");
    expect(err.field).toBe("from");
  });

  it("reads retryable from a throttled reply", async () => {
    const err = await failWith(jsonResponse({ error: "throttled", field: "cluster", message: "Hourly cap reached", retryable: true }, 429));
    expect(err.status).toBe(429);
    expect(err.code).toBe("throttled");
    expect(err.retryable).toBe(true);
  });

  it("reads retryable false from an inject timeout", async () => {
    const err = await failWith(jsonResponse({ error: "inject_timeout_unknown", retryable: false }, 502));
    expect(err.status).toBe(502);
    expect(err.retryable).toBe(false);
  });

  it("reads rule from a firewall refusal", async () => {
    const err = await failWith(
      jsonResponse({ error: "firewall", field: "to", rule: "temp_providers", message: "Recipient failed a firewall check" }, 403),
    );
    expect(err.code).toBe("firewall");
    expect(err.rule).toBe("temp_providers");
  });

  it("keeps validation messages from an errors list", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ errors: ["Url must use https"] }, 422));
    const err = (await client()
      .webhooks.create({ webhook_endpoint: { url: "http://hooks.example.com" } })
      .catch((e: unknown) => e)) as PostShibaError;
    expect(err).toBeInstanceOf(PostShibaError);
    expect(err.status).toBe(422);
    expect(err.errors).toEqual(["Url must use https"]);
    expect(err.message).toBe("Url must use https");
    expect(err.code).toBe("error");
  });

  it("uses the error string as the message when there is no message", async () => {
    const err = await failWith(jsonResponse({ error: "Invalid token or no user signed in" }, 401));
    expect(err.status).toBe(401);
    expect(err.message).toBe("Invalid token or no user signed in");
  });

  it("keeps a non-JSON reply as text", async () => {
    const err = await failWith(new Response("<html>Bad Gateway</html>", { status: 502 }));
    expect(err.status).toBe(502);
    expect(err.code).toBe("error");
    expect(err.message).toBe("Request failed with status 502");
    expect(err.body).toBe("<html>Bad Gateway</html>");
  });

  it("handles an empty error body", async () => {
    const err = await failWith(new Response(null, { status: 500 }));
    expect(err.status).toBe(500);
    expect(err.body).toBeUndefined();
    expect(err.errors).toEqual([]);
  });

  it("ignores fields of the wrong type", async () => {
    const err = await failWith(jsonResponse({ error: 42, field: ["to"], retryable: "yes", rule: 1, errors: "nope" }, 400));
    expect(err.code).toBe("error");
    expect(err.field).toBeNull();
    expect(err.retryable).toBeUndefined();
    expect(err.rule).toBeNull();
    expect(err.errors).toEqual([]);
  });

  it("still builds from the original attributes", () => {
    const err = new PostShibaError({ error: "invalid", field: "to", message: "missing to" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PostShibaError");
    expect(err.error).toBe("invalid");
    expect(err.code).toBe("invalid");
    expect(err.field).toBe("to");
    expect(err.message).toBe("missing to");
    expect(err.status).toBe(0);
    expect(new PostShibaError({}).message).toBe("Request failed");
  });
});
