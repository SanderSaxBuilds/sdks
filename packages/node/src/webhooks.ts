// Webhook signature checks that run anywhere: Node, Bun, Deno, Cloudflare
// Workers, Vercel Edge and browsers. Nothing here imports node:crypto.
//
// PostShiba signs every webhook POST with X-Capsule-Timestamp and
// X-Capsule-Signature, which is "sha256=" plus the hex HMAC-SHA256 of
// "{timestamp}.{body}" keyed with the endpoint's secret.

export const TIMESTAMP_HEADER = "X-Capsule-Timestamp";
export const SIGNATURE_HEADER = "X-Capsule-Signature";

/** Default `tolerance`: reject requests signed more than five minutes away from now. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

/** The exact bytes of the request body, before any JSON parsing. */
export type WebhookBody = string | Uint8Array | ArrayBuffer;

/** Request headers as a `Headers` object (fetch, edge runtimes) or a plain object (Node, Express). */
export type WebhookHeaders = Headers | Record<string, string | string[] | null | undefined>;

export type WebhookVerifyOptions = {
  /**
   * Seconds the signed timestamp may differ from the current time. Each
   * attempt, retries included, is signed with a fresh timestamp. Default 300.
   * Pass `false` to skip the check.
   */
  tolerance?: number | false;
};

export type WebhookErrorCode =
  | "missing_header"
  | "invalid_timestamp"
  | "timestamp_out_of_range"
  | "invalid_signature"
  | "invalid_json";

/** A webhook request that failed verification. Answer it with `401`. */
export class PostShibaWebhookError extends Error {
  readonly code: WebhookErrorCode;

  constructor(code: WebhookErrorCode, message: string) {
    super(message);
    this.name = "PostShibaWebhookError";
    this.code = code;
  }
}

/** One delivery event, in the SendGrid Event Webhook format. Fields with no value are left out. */
export type WebhookEvent = {
  event: string;
  email?: string;
  timestamp?: number;
  /** `capsule-{id}`. Use it to drop duplicates when a delivery is retried. */
  sg_event_id?: string;
  sg_message_id?: string;
  "smtp-id"?: string;
  response?: string;
  reason?: string;
  status?: string;
  attempt?: string;
  bounce_classification?: string;
  type?: "bounce" | "blocked";
  tenant_id?: string;
  from?: string;
  subject?: string;
  category?: string;
  campaign_id?: string;
  ip?: string;
  attribution?: "verified" | "inferred";
  unique_args?: Record<string, unknown>;
  /** Present on the event `send_test` posts. */
  test?: boolean;
  /** Unique args are also copied onto the event. */
  [key: string]: unknown;
};

const encoder = new TextEncoder();

function toBytes(body: WebhookBody): Uint8Array {
  if (typeof body === "string") return encoder.encode(body);
  if (body instanceof Uint8Array) return body;
  return new Uint8Array(body);
}

// No return annotation: the inferred type is backed by a plain ArrayBuffer, which Web Crypto wants.
function signedPayload(timestamp: string, body: WebhookBody) {
  const prefix = encoder.encode(`${timestamp}.`);
  const bytes = toBytes(body);
  const out = new Uint8Array(prefix.length + bytes.length);
  out.set(prefix);
  out.set(bytes, prefix.length);
  return out;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** Compares two strings in time that depends only on their length. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function givenSignature(signature: string): string {
  return signature.trim().replace(/^sha256=/, "").toLowerCase();
}

// SHA-256 (FIPS 180-4) and HMAC (RFC 2104), for runtimes without Web Crypto
// and for the synchronous verify(). Checked against node:crypto in the tests.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(data: Uint8Array): Uint8Array {
  const blocks = new Uint8Array(((data.length + 9 + 63) >>> 6) << 6);
  blocks.set(data);
  blocks[data.length] = 0x80;
  const view = new DataView(blocks.buffer);
  const bits = data.length * 8;
  view.setUint32(blocks.length - 8, Math.floor(bits / 0x1_0000_0000));
  view.setUint32(blocks.length - 4, bits >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < blocks.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += k;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256(key) : key);
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    inner[i] = block[i] ^ 0x36;
    outer[i] = block[i] ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

async function hmacHex(secret: string, message: ReturnType<typeof signedPayload>): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return toHex(hmacSha256(encoder.encode(secret), message));
  const key = await subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(new Uint8Array(await subtle.sign("HMAC", key, message)));
}

/**
 * Checks the signature only, synchronously. Returns `false` when a value is
 * missing. Does not check the timestamp's age: use `unwrapWebhook` for that.
 */
export function verifySignature(
  rawBody: WebhookBody,
  timestamp: string | null | undefined,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!timestamp || !signature || !secret) return false;
  const expected = toHex(hmacSha256(encoder.encode(secret), signedPayload(timestamp, rawBody)));
  return safeEqual(expected, givenSignature(signature));
}

function header(headers: WebhookHeaders, name: string): string | undefined {
  let value: string | string[] | null | undefined;
  if (typeof (headers as Headers).get === "function") {
    value = (headers as Headers).get(name);
  } else {
    const lower = name.toLowerCase();
    const record = headers as Record<string, string | string[] | null | undefined>;
    const key = Object.keys(record).find((k) => k.toLowerCase() === lower);
    value = key === undefined ? undefined : record[key];
  }
  if (Array.isArray(value)) value = value[0];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Verifies a webhook request and returns its parsed JSON body.
 *
 * Checks that both headers are present, that the timestamp is within
 * `tolerance` of now, and that the signature matches, comparing in constant
 * time. Uses Web Crypto when the runtime has it. Throws
 * `PostShibaWebhookError` when any check fails.
 */
export async function unwrapWebhook<T = WebhookEvent[]>(
  rawBody: WebhookBody,
  headers: WebhookHeaders,
  secret: string,
  options: WebhookVerifyOptions = {},
): Promise<T> {
  const timestamp = header(headers, TIMESTAMP_HEADER);
  if (timestamp === undefined) throw new PostShibaWebhookError("missing_header", `Missing ${TIMESTAMP_HEADER} header`);
  const signature = header(headers, SIGNATURE_HEADER);
  if (signature === undefined) throw new PostShibaWebhookError("missing_header", `Missing ${SIGNATURE_HEADER} header`);
  if (!secret) throw new TypeError("A webhook secret is required");

  if (!/^\d+$/.test(timestamp)) {
    throw new PostShibaWebhookError("invalid_timestamp", `${TIMESTAMP_HEADER} is not a Unix time: ${JSON.stringify(timestamp)}`);
  }
  const tolerance = options.tolerance ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  if (tolerance !== false) {
    const age = Math.floor(Date.now() / 1000) - Number(timestamp);
    if (Math.abs(age) > tolerance) {
      const when = age > 0 ? `${age} seconds old` : `${-age} seconds in the future`;
      throw new PostShibaWebhookError(
        "timestamp_out_of_range",
        `Webhook timestamp is ${when}, outside the ${tolerance} second tolerance`,
      );
    }
  }

  const expected = await hmacHex(secret, signedPayload(timestamp, rawBody));
  if (!safeEqual(expected, givenSignature(signature))) {
    throw new PostShibaWebhookError("invalid_signature", "Webhook signature does not match");
  }

  const text = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(toBytes(rawBody));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PostShibaWebhookError("invalid_json", "Webhook body is not JSON");
  }
}
