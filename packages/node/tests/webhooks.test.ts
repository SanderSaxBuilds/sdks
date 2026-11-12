import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostShiba, PostShibaWebhookError, unwrapWebhook, verifyWebhookSignature } from "../src/index.js";
import { hmacSha256, sha256 } from "../src/webhooks.js";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = join(here, "..", "../../fixtures/catalog");
const sample = JSON.parse(readFileSync(join(catalog, "webhook_verify.json"), "utf8")) as {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
};

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

function sign(body: string | Buffer, timestamp: string, secret = sample.secret) {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");
}

/** Freezes Date.now() at the fixture's timestamp plus `offset` seconds. */
function at(offset = 0) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime((Number(sample.timestamp) + offset) * 1000);
}

function headers(timestamp = sample.timestamp, signature = sample.signature) {
  return new Headers({ "X-Capsule-Timestamp": timestamp, "X-Capsule-Signature": signature });
}

async function failure(promise: Promise<unknown>) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(PostShibaWebhookError);
  return err as PostShibaWebhookError;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SHA-256 and HMAC without node:crypto", () => {
  it("matches the FIPS 180-4 examples", () => {
    const enc = new TextEncoder();
    expect(hex(sha256(enc.encode("")))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hex(sha256(enc.encode("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hex(sha256(enc.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("matches the RFC 4231 HMAC-SHA256 test cases", () => {
    const enc = new TextEncoder();
    const bytes = (h: string) => new Uint8Array(Buffer.from(h, "hex"));
    expect(hex(hmacSha256(bytes("0b".repeat(20)), enc.encode("Hi There")))).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
    expect(hex(hmacSha256(enc.encode("Jefe"), enc.encode("what do ya want for nothing?")))).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
    expect(hex(hmacSha256(bytes("aa".repeat(131)), enc.encode("Test Using Larger Than Block-Size Key - Hash Key First")))).toBe(
      "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
    );
  });

  it("agrees with node:crypto across lengths around the block boundaries", () => {
    for (let length = 0; length <= 300; length++) {
      const data = randomBytes(length);
      expect(hex(sha256(new Uint8Array(data)))).toBe(createHash("sha256").update(data).digest("hex"));
      const key = randomBytes(length % 150);
      expect(hex(hmacSha256(new Uint8Array(key), new Uint8Array(data)))).toBe(
        createHmac("sha256", key).update(data).digest("hex"),
      );
    }
  });

  it("is not imported from node:crypto by the client", () => {
    for (const file of ["index.ts", "webhooks.ts", "types.ts"]) {
      expect(readFileSync(join(here, "..", "src", file), "utf8")).not.toMatch(/from "(node:)?crypto"/);
    }
  });
});

describe("webhooks.verify", () => {
  const verify = new PostShiba("sk_test").webhooks.verify;

  it("accepts the shared fixture", () => {
    expect(verify(sample.body, sample.timestamp, sample.signature, sample.secret)).toBe(true);
    expect(verifyWebhookSignature(sample.body, sample.timestamp, sample.signature, sample.secret)).toBe(true);
  });

  it("takes the raw body as bytes too", () => {
    expect(verify(Buffer.from(sample.body), sample.timestamp, sample.signature, sample.secret)).toBe(true);
    expect(verify(new TextEncoder().encode(sample.body).buffer as ArrayBuffer, sample.timestamp, sample.signature, sample.secret)).toBe(true);
  });

  it("signs the exact bytes, so non-ASCII bodies verify", () => {
    const body = '[{"event":"delivered","subject":"Привет, สวัสดี"}]';
    expect(verify(body, "1710000000", sign(body, "1710000000"), sample.secret)).toBe(true);
    expect(verify(Buffer.from(body), "1710000000", sign(body, "1710000000"), sample.secret)).toBe(true);
  });

  it("accepts the signature without the sha256= prefix and in upper case", () => {
    const bare = sample.signature.replace("sha256=", "");
    expect(verify(sample.body, sample.timestamp, bare, sample.secret)).toBe(true);
    expect(verify(sample.body, sample.timestamp, `sha256=${bare.toUpperCase()}`, sample.secret)).toBe(true);
  });

  it("rejects a changed body, timestamp, secret or signature", () => {
    expect(verify(sample.body + " ", sample.timestamp, sample.signature, sample.secret)).toBe(false);
    expect(verify(sample.body, "1710000001", sample.signature, sample.secret)).toBe(false);
    expect(verify(sample.body, sample.timestamp, sample.signature, "other-secret")).toBe(false);
    expect(verify(sample.body, sample.timestamp, "sha256=00", sample.secret)).toBe(false);
    const flipped = sample.signature.slice(0, -1) + (sample.signature.endsWith("a") ? "b" : "a");
    expect(verify(sample.body, sample.timestamp, flipped, sample.secret)).toBe(false);
  });

  it("returns false instead of throwing when a header is missing", () => {
    expect(verify(sample.body, undefined, sample.signature, sample.secret)).toBe(false);
    expect(verify(sample.body, sample.timestamp, null, sample.secret)).toBe(false);
    expect(verify(sample.body, "", "", sample.secret)).toBe(false);
    expect(verify(sample.body, sample.timestamp, sample.signature, "")).toBe(false);
  });

  it("works with no Web Crypto in the runtime", () => {
    vi.stubGlobal("crypto", undefined);
    expect(verify(sample.body, sample.timestamp, sample.signature, sample.secret)).toBe(true);
  });
});

describe("webhooks.unwrap", () => {
  const unwrap = new PostShiba("sk_test").webhooks.unwrap;

  it("verifies the request and returns the parsed events", async () => {
    at(10);
    const events = await unwrap(sample.body, headers(), sample.secret);
    expect(events).toEqual([{ event: "delivered" }]);
    expect(events[0].event).toBe("delivered");
    expect(await unwrapWebhook(sample.body, headers(), sample.secret)).toEqual(events);
  });

  it("reads Node and Express style header objects in any case", async () => {
    at();
    const node = { "x-capsule-timestamp": sample.timestamp, "x-capsule-signature": sample.signature, host: "example.com" };
    expect(await unwrap(sample.body, node, sample.secret)).toEqual([{ event: "delivered" }]);
    const mixed = { "X-CAPSULE-TIMESTAMP": [sample.timestamp], "X-Capsule-Signature": ` ${sample.signature} ` };
    expect(await unwrap(Buffer.from(sample.body), mixed, sample.secret)).toEqual([{ event: "delivered" }]);
  });

  it("uses Web Crypto when the runtime has it", async () => {
    at();
    const signSpy = vi.spyOn(globalThis.crypto.subtle, "sign");
    await unwrap(sample.body, headers(), sample.secret);
    expect(signSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to its own HMAC without Web Crypto, as on Node 18", async () => {
    at();
    vi.stubGlobal("crypto", undefined);
    expect(await unwrap(sample.body, headers(), sample.secret)).toEqual([{ event: "delivered" }]);
  });

  it("names the missing timestamp header", async () => {
    at();
    const err = await failure(unwrap(sample.body, { "x-capsule-signature": sample.signature }, sample.secret));
    expect(err.code).toBe("missing_header");
    expect(err.message).toBe("Missing X-Capsule-Timestamp header");
  });

  it("names the missing signature header", async () => {
    at();
    const err = await failure(unwrap(sample.body, new Headers({ "X-Capsule-Timestamp": sample.timestamp }), sample.secret));
    expect(err.code).toBe("missing_header");
    expect(err.message).toBe("Missing X-Capsule-Signature header");
  });

  it("treats an empty header as missing", async () => {
    at();
    const err = await failure(unwrap(sample.body, headers(sample.timestamp, "  "), sample.secret));
    expect(err.message).toBe("Missing X-Capsule-Signature header");
  });

  it("rejects a timestamp that is not a Unix time", async () => {
    at();
    const err = await failure(unwrap(sample.body, headers("2026-11-13T00:00:00Z"), sample.secret));
    expect(err.code).toBe("invalid_timestamp");
    expect(err.message).toBe('X-Capsule-Timestamp is not a Unix time: "2026-11-13T00:00:00Z"');
  });

  it("rejects a request signed more than five minutes ago", async () => {
    at(301);
    const err = await failure(unwrap(sample.body, headers(), sample.secret));
    expect(err.code).toBe("timestamp_out_of_range");
    expect(err.message).toBe("Webhook timestamp is 301 seconds old, outside the 300 second tolerance");
  });

  it("rejects a timestamp too far in the future", async () => {
    at(-400);
    const err = await failure(unwrap(sample.body, headers(), sample.secret));
    expect(err.message).toBe("Webhook timestamp is 400 seconds in the future, outside the 300 second tolerance");
  });

  it("accepts exactly the tolerance and honors a custom one", async () => {
    at(300);
    expect(await unwrap(sample.body, headers(), sample.secret)).toEqual([{ event: "delivered" }]);
    const err = await failure(unwrap(sample.body, headers(), sample.secret, { tolerance: 60 }));
    expect(err.message).toBe("Webhook timestamp is 300 seconds old, outside the 60 second tolerance");
  });

  it("skips the age check with tolerance false", async () => {
    at(10 * 365 * 24 * 3600);
    expect(await unwrap(sample.body, headers(), sample.secret, { tolerance: false })).toEqual([{ event: "delivered" }]);
  });

  it("checks the age before the signature, so a replayed request fails as stale", async () => {
    at(3600);
    const err = await failure(unwrap(sample.body, headers(), sample.secret));
    expect(err.code).toBe("timestamp_out_of_range");
  });

  it("rejects a signature that does not match", async () => {
    at();
    for (const bad of ["sha256=00", sample.signature.replace(/.$/, "0"), sign(sample.body, sample.timestamp, "other")]) {
      const err = await failure(unwrap(sample.body, headers(sample.timestamp, bad), sample.secret));
      expect(err.code).toBe("invalid_signature");
      expect(err.message).toBe("Webhook signature does not match");
    }
    const err = await failure(unwrap(sample.body + "\n", headers(), sample.secret));
    expect(err.code).toBe("invalid_signature");
  });

  it("rejects a signed body that is not JSON", async () => {
    at();
    const body = "not json";
    const err = await failure(unwrap(body, headers(sample.timestamp, sign(body, sample.timestamp)), sample.secret));
    expect(err.code).toBe("invalid_json");
  });

  it("returns an inbox webhook body typed as the caller asks", async () => {
    at();
    const body = JSON.stringify({ id: "GxTyVu", inbox_id: "PqRzMn", subject: "Hello" });
    const message = await unwrap<{ id: string; subject: string }>(body, headers(sample.timestamp, sign(body, sample.timestamp)), sample.secret);
    expect(message.subject).toBe("Hello");
  });

  it("requires a secret", async () => {
    at();
    await expect(unwrap(sample.body, headers(), "")).rejects.toThrow("A webhook secret is required");
  });
});
