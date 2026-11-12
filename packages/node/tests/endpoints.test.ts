// Endpoints documented in the API reference that the shared catalog does not
// cover. Their fixtures live in tests/fixtures and are copied from the
// examples on the matching docs pages.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostShiba } from "../src/index.js";

const local = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function fixture(name: string) {
  return JSON.parse(readFileSync(join(local, `${name}.json`), "utf8"));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("documented endpoints", () => {
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

  function lastCall() {
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init, headers: new Headers(init.headers) };
  }

  const cases: Array<{
    name: string;
    call: (c: PostShiba) => Promise<unknown>;
    method: string;
    path: string;
    request?: string;
    response: unknown;
  }> = [
    { name: "clusters.reactivate", call: (c) => c.clusters.reactivate("NmQpXr"), method: "POST", path: "/api/v1/clusters/NmQpXr/reactivate", response: fixture("cluster_reactivated") },
    {
      name: "clusters.autoBoost",
      call: (c) => c.clusters.autoBoost("NmQpXr", fixture("cluster_auto_boost_request")),
      method: "PATCH",
      path: "/api/v1/clusters/NmQpXr/auto_boost",
      request: "cluster_auto_boost_request",
      response: fixture("cluster_auto_boosted"),
    },
    {
      name: "network.warmup",
      call: (c) => c.network.warmup(fixture("network_warmup_request")),
      method: "POST",
      path: "/api/v1/teams/KjkAJW/network/warmup",
      request: "network_warmup_request",
      response: fixture("network_warming"),
    },
    { name: "ipPools.list", call: (c) => c.ipPools.list(), method: "GET", path: "/api/v1/teams/KjkAJW/ip_pools", response: [fixture("ip_pool")] },
    {
      name: "ipPools.create",
      call: (c) => c.ipPools.create(fixture("ip_pool_create_request")),
      method: "POST",
      path: "/api/v1/teams/KjkAJW/ip_pools",
      request: "ip_pool_create_request",
      response: fixture("ip_pool_created"),
    },
    { name: "ipPools.get", call: (c) => c.ipPools.get("PoOlIp"), method: "GET", path: "/api/v1/ip_pools/PoOlIp", response: fixture("ip_pool") },
    {
      name: "ipPools.update",
      call: (c) => c.ipPools.update("PoOlIp", fixture("ip_pool_update_request")),
      method: "PATCH",
      path: "/api/v1/ip_pools/PoOlIp",
      request: "ip_pool_update_request",
      response: fixture("ip_pool_updated"),
    },
    { name: "ipPools.delete", call: (c) => c.ipPools.delete("PoOlIp"), method: "DELETE", path: "/api/v1/ip_pools/PoOlIp", response: fixture("ip_pool_deleted") },
    {
      name: "ipPools.addIp",
      call: (c) => c.ipPools.addIp("PoOlIp", fixture("ip_pool_add_ip_request")),
      method: "POST",
      path: "/api/v1/ip_pools/PoOlIp/add_ip",
      request: "ip_pool_add_ip_request",
      response: fixture("ip_pool"),
    },
    {
      name: "ipPools.removeIp",
      call: (c) => c.ipPools.removeIp("PoOlIp", fixture("ip_pool_remove_ip_request")),
      method: "POST",
      path: "/api/v1/ip_pools/PoOlIp/remove_ip",
      request: "ip_pool_remove_ip_request",
      response: fixture("ip_pool_ip_removed"),
    },
    {
      name: "ipPools.attach",
      call: (c) => c.ipPools.attach("PoOlIp", fixture("ip_pool_cluster_request")),
      method: "POST",
      path: "/api/v1/ip_pools/PoOlIp/attach",
      request: "ip_pool_cluster_request",
      response: fixture("ip_pool"),
    },
    {
      name: "ipPools.detach",
      call: (c) => c.ipPools.detach("PoOlIp", fixture("ip_pool_cluster_request")),
      method: "POST",
      path: "/api/v1/ip_pools/PoOlIp/detach",
      request: "ip_pool_cluster_request",
      response: fixture("ip_pool_created"),
    },
    {
      name: "sendingDomains.flushQueue",
      call: (c) => c.sendingDomains.flushQueue("HsVtYk"),
      method: "POST",
      path: "/api/v1/sending_domains/HsVtYk/flush_queue",
      response: fixture("sending_domain_flushed"),
    },
    {
      name: "sendingDomains.move",
      call: (c) => c.sendingDomains.move("HsVtYk", fixture("sending_domain_move_request")),
      method: "POST",
      path: "/api/v1/sending_domains/HsVtYk/move",
      request: "sending_domain_move_request",
      response: fixture("sending_domain_moved"),
    },
    {
      name: "tenants.update",
      call: (c) => c.tenants.update("WbLcFd", fixture("tenant_update_request")),
      method: "PATCH",
      path: "/api/v1/tenants/WbLcFd",
      request: "tenant_update_request",
      response: fixture("tenant_updated"),
    },
    {
      name: "inboxes.update",
      call: (c) => c.inboxes.update("PqRzMn", fixture("inbox_update_request")),
      method: "PATCH",
      path: "/api/v1/inboxes/PqRzMn",
      request: "inbox_update_request",
      response: fixture("inbox_updated"),
    },
    {
      name: "outboundMessages.list",
      call: (c) => c.outboundMessages.list(),
      method: "GET",
      path: "/api/v1/teams/KjkAJW/outbound_messages",
      response: [fixture("outbound_message_index")],
    },
    {
      name: "outboundMessages.get",
      call: (c) => c.outboundMessages.get("OuTbMs"),
      method: "GET",
      path: "/api/v1/outbound_messages/OuTbMs",
      response: fixture("outbound_message"),
    },
    { name: "outboundRetention.get", call: (c) => c.outboundRetention.get(), method: "GET", path: "/api/v1/teams/KjkAJW/outbound_retention", response: fixture("outbound_retention") },
    {
      name: "outboundRetention.update",
      call: (c) => c.outboundRetention.update(fixture("outbound_retention_update_request")),
      method: "PATCH",
      path: "/api/v1/teams/KjkAJW/outbound_retention",
      request: "outbound_retention_update_request",
      response: fixture("outbound_retention"),
    },
    { name: "dkimSigning.get", call: (c) => c.dkimSigning.get(), method: "GET", path: "/api/v1/teams/KjkAJW/dkim_signing", response: fixture("dkim_signing") },
    {
      name: "dkimSigning.update",
      call: (c) => c.dkimSigning.update(fixture("dkim_signing_update_request")),
      method: "PATCH",
      path: "/api/v1/teams/KjkAJW/dkim_signing",
      request: "dkim_signing_update_request",
      response: fixture("dkim_signing_updated"),
    },
    { name: "analytics.get", call: (c) => c.analytics.get(), method: "GET", path: "/api/v1/teams/KjkAJW/analytics", response: fixture("analytics") },
    { name: "status.get", call: (c) => c.status.get(), method: "GET", path: "/api/v1/teams/KjkAJW/status", response: fixture("status") },
    {
      name: "webhooks.sendTest",
      call: (c) => c.webhooks.sendTest("CdFgHj"),
      method: "POST",
      path: "/api/v1/webhook_endpoints/CdFgHj/send_test",
      response: fixture("webhook_test"),
    },
    {
      name: "suppressions.bulkDelete",
      call: (c) => c.suppressions.bulkDelete(fixture("suppression_bulk_delete_request")),
      method: "POST",
      path: "/api/v1/teams/KjkAJW/suppressions/bulk_delete",
      request: "suppression_bulk_delete_request",
      response: fixture("suppression_bulk_delete"),
    },
    { name: "shieldSites.list", call: (c) => c.shieldSites.list(), method: "GET", path: "/api/v1/teams/KjkAJW/shield_sites", response: [fixture("shield_site_index")] },
    {
      name: "shieldSites.create",
      call: (c) => c.shieldSites.create(fixture("shield_site_create_request")),
      method: "POST",
      path: "/api/v1/teams/KjkAJW/shield_sites",
      request: "shield_site_create_request",
      response: fixture("shield_site"),
    },
    { name: "shieldSites.get", call: (c) => c.shieldSites.get("ShLdSt"), method: "GET", path: "/api/v1/shield_sites/ShLdSt", response: fixture("shield_site") },
    {
      name: "shieldSites.update",
      call: (c) => c.shieldSites.update("ShLdSt", fixture("shield_site_update_request")),
      method: "PATCH",
      path: "/api/v1/shield_sites/ShLdSt",
      request: "shield_site_update_request",
      response: fixture("shield_site_updated"),
    },
    {
      name: "shieldSites.rotateSecret",
      call: (c) => c.shieldSites.rotateSecret("ShLdSt"),
      method: "POST",
      path: "/api/v1/shield_sites/ShLdSt/rotate_secret",
      response: fixture("shield_site_rotated"),
    },
  ];

  it.each(cases)("$name", async ({ call, method, path, request, response }) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(response));
    const result = await call(client());
    const { url, init, headers } = lastCall();
    expect(init.method).toBe(method);
    expect(url).toBe(`https://app.postshiba.com${path}`);
    expect(headers.get("Authorization")).toBe("Bearer sk_test");
    if (request) {
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(JSON.parse(String(init.body))).toEqual(fixture(request));
    } else {
      expect(init.body).toBeUndefined();
    }
    expect(result).toEqual(response);
  });

  it("deletes a shield site and resolves {} on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await client().shieldSites.delete("ShLdSt");
    const { url, init } = lastCall();
    expect(init.method).toBe("DELETE");
    expect(url).toBe("https://app.postshiba.com/api/v1/shield_sites/ShLdSt");
    expect(result).toEqual({});
  });

  it("returns raw outbound MIME and attachments as bytes", async () => {
    const mime = new TextEncoder().encode("From: hello@mail.example.com\r\n\r\nHi");
    fetchMock.mockResolvedValueOnce(new Response(mime, { status: 200, headers: { "content-type": "message/rfc822" } }));
    const raw = await client().outboundMessages.raw("OuTbMs");
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/outbound_messages/OuTbMs/raw");
    expect(new Uint8Array(raw)).toEqual(mime);

    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    fetchMock.mockResolvedValueOnce(new Response(pdf, { status: 200, headers: { "content-type": "application/pdf" } }));
    const file = await client().outboundMessages.downloadAttachment("OuTbMs", 0);
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/outbound_messages/OuTbMs/attachments/0");
    expect(new Uint8Array(file)).toEqual(pdf);
  });

  it("looks up a recipient by email in the query string", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture("recipient")));
    const result = await client().recipients.get("dest+tag@example.com");
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/teams/KjkAJW/recipients?email=dest%2Btag%40example.com");
    expect(result).toEqual(fixture("recipient"));
  });

  it("passes event filters and cursors as query parameters", async () => {
    fetchMock.mockImplementation(async () => jsonResponse([fixture("event_index")]));
    await client().events.listTeam({ cluster_id: "NmQpXr", event_type: "bounce", limit: 50, after: "JkLmNp" });
    expect(lastCall().url).toBe(
      "https://app.postshiba.com/api/v1/teams/KjkAJW/message_events?cluster_id=NmQpXr&event_type=bounce&limit=50&after=JkLmNp",
    );
    await client().events.list("NmQpXr", { recipient: "dest@example.com", since: "2026-08-29T00:00:00Z" });
    expect(lastCall().url).toBe(
      "https://app.postshiba.com/api/v1/teams/KjkAJW/clusters/NmQpXr/message_events?recipient=dest%40example.com&since=2026-08-29T00%3A00%3A00Z",
    );
  });

  it("passes list filters as query parameters", async () => {
    fetchMock.mockImplementation(async () => jsonResponse([]));
    await client().network.list({ classification: "bulk", cluster_id: "NmQpXr" });
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/teams/KjkAJW/network?classification=bulk&cluster_id=NmQpXr");
    await client().ipPools.list({ classification: "transactional" });
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/teams/KjkAJW/ip_pools?classification=transactional");
    await client().suppressions.list({ email: "blocked@example.com", after: "YtReWq", limit: 1000 });
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/teams/KjkAJW/suppressions?email=blocked%40example.com&after=YtReWq&limit=1000");
    await client().outboundMessages.list({ q: "receipt", before: "OuTbMs", limit: 25 });
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/teams/KjkAJW/outbound_messages?q=receipt&before=OuTbMs&limit=25");
  });

  it("passes analytics windows and the compare flag", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture("analytics")));
    await client().analytics.get({ since: "2026-09-15T12:00:00Z", dimension: "mx_provider", min_processed: 10, compare: true });
    expect(lastCall().url).toBe(
      "https://app.postshiba.com/api/v1/teams/KjkAJW/analytics?since=2026-09-15T12%3A00%3A00Z&dimension=mx_provider&min_processed=10&compare=true",
    );
  });

  it("skips undefined filters and leaves no stray question mark", async () => {
    fetchMock.mockImplementation(async () => jsonResponse([]));
    await client().events.listTeam({ cluster_id: undefined, limit: undefined });
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/teams/KjkAJW/message_events");
    await client().suppressions.list({});
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/teams/KjkAJW/suppressions");
  });

  it("deletes a tenant and hands its resources to another one", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    await client().tenants.delete("WbLcFd", { destination_tenant_id: "QrStUv" });
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/tenants/WbLcFd?destination_tenant_id=QrStUv");
    await client().tenants.delete("WbLcFd");
    expect(lastCall().url).toBe("https://app.postshiba.com/api/v1/tenants/WbLcFd");
  });

  it("needs a teamId for team-scoped endpoints", async () => {
    const c = new PostShiba("sk_test");
    await expect(c.status.get()).rejects.toThrow("teamId is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
