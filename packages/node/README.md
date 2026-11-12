# PostShiba

> [!NOTE]
> [PostShiba skills](https://github.com/postshiba/postshiba-skills) connect agents to MCP for first send, domains, inboxes, and sandbox mail.

PostShiba API client for Node.js.

## Installation

```sh
npm install @postshiba/node
```

`npm install postshiba` is the same client.

Node 18 or later. The client uses `fetch` and also runs on Bun, Deno, Cloudflare Workers, and Vercel Edge. It ships ESM and CommonJS, so `import` and `require` both work. Open pull requests on [postshiba/sdks](https://github.com/postshiba/sdks).

## How It Works

`PostShiba` is a thin HTTPS client. Pass a platform application token. Team-scoped routes need `teamId` on the constructor. `GET /users/me` does not return one, so the client does not guess.

Send mail with `emails.send`. Nest services inject the same client and call that method.

Every method returns a typed result. Request and response types come from the API's OpenAPI document and are exported, so `import type { Cluster, SendEmailRequest } from "@postshiba/node"` works.

## Send an email

```ts
import { PostShiba } from "@postshiba/node"

const postshiba = new PostShiba(process.env.POSTSHIBA_API_KEY, { teamId: "KjkAJW" })

await postshiba.emails.send({
	from: "hello@mail.example.com",
	to: ["you@example.com"],
	subject: "PostShiba test",
	text: "hello from PostShiba",
	html: "<p>hello from PostShiba</p>",
})
```

Pass `clusterId` to send `X-Capsule-Cluster-Id`. The path stays `POST /api/v1/emails`.

```ts
await postshiba.emails.send(body, { clusterId: "NmQpXr" })
```

Cluster send can set `sandbox` and send `Idempotency-Key`:

```ts
await postshiba.emails.sendOnCluster("NmQpXr", body, {
	sandbox: true,
	idempotencyKey: "ikey-1",
})
```

## NestJS

The Nest entry is a module and an injectable token, not a mailer. Import `@postshiba/node` without Nest. Import `@postshiba/node/nest` only in Nest apps.

```ts
import { Inject, Injectable, Module } from "@nestjs/common"
import { POSTSHIBA, PostShibaModule, sendMail } from "@postshiba/node/nest"
import type { PostShiba } from "@postshiba/node"

@Module({
	imports: [
		PostShibaModule.register({
			apiKey: process.env.POSTSHIBA_API_KEY!,
			teamId: "KjkAJW",
		}),
	],
})
export class AppModule {}

@Injectable()
export class MailService {
	constructor(@Inject(POSTSHIBA) private readonly postshiba: PostShiba) {}

	sendWelcome() {
		return sendMail(this.postshiba, {
			from: "hello@mail.example.com",
			to: "you@example.com",
			subject: "Welcome",
			text: "hello",
			html: "<p>hello</p>",
		})
	}
}
```

`sendMail` maps `to`, `from`, `subject`, `html`, `text`, and `attachments` onto `emails.send`. It does not pass a cluster id. Call `this.postshiba.emails.send(body, { clusterId: "NmQpXr" })` to pin a cluster.

## API

Override `baseUrl` when you are not on production.

```ts
new PostShiba(process.env.POSTSHIBA_API_KEY, {
	teamId: "KjkAJW",
	baseUrl: "https://app.postshiba.com",
	maxRetries: 2,
	timeout: 30_000,
})
```

`maxRetries` defaults to 2. `timeout` is in milliseconds and covers the whole call, retries included. There is no timeout unless you set one.

Every method takes per-call options as its last argument. The send methods take them in the options they already have.

```ts
const controller = new AbortController()

await postshiba.clusters.list({ signal: controller.signal })
await postshiba.events.listTeam({ limit: 50 }, { timeout: 5_000 })
await postshiba.emails.send(body, { clusterId: "NmQpXr", signal: controller.signal })
```

### Users

```ts
await postshiba.users.me()
```

### Emails

```ts
await postshiba.emails.send(body)
await postshiba.emails.send(body, { clusterId: "NmQpXr" })
await postshiba.emails.sendOnCluster("NmQpXr", body, { sandbox: true })
await postshiba.emails.send({
	to: ["you@example.com"],
	template: { id: "welcome", variables: { name: "Ada" } },
})
```

### Clusters

```ts
await postshiba.clusters.list()
await postshiba.clusters.get("NmQpXr")
await postshiba.clusters.create({ cluster: { name: "edge", size: "small", region: "manual", plan: "nano" } })
await postshiba.clusters.update("NmQpXr", { cluster: { plan: "small" } })
await postshiba.clusters.suspend("NmQpXr")
await postshiba.clusters.resume("NmQpXr")
await postshiba.clusters.delete("NmQpXr")
await postshiba.clusters.boost("NmQpXr", { sku: "small_to_large" })
await postshiba.clusters.extendBoost("NmQpXr", { idempotency_key: "extend-1" })
await postshiba.clusters.cancelBoost("NmQpXr")
await postshiba.clusters.autoBoost("NmQpXr", { sku: "small_to_medium", monthly_limit: 3 })
await postshiba.clusters.reactivate("NmQpXr")
```

### Network

```ts
await postshiba.network.list()
await postshiba.network.list({ classification: "bulk", cluster_id: "NmQpXr" })
await postshiba.network.create({ ip_address_id: "IpQwEr", cluster_id: "NmQpXr" })
await postshiba.network.assign({ ip_address_id: "IpQwEr", cluster_id: "NmQpXr" })
await postshiba.network.unassign({ ip_address_id: "IpQwEr", cluster_id: "NmQpXr" })
await postshiba.network.switch({ ip_address_id: "IpQwEr", cluster_id: "NmQpXr" })
await postshiba.network.release({ ip_address_id: "IpQwEr" })
await postshiba.network.warmup({ ip_address_id: "IpQwEr", warmup_mode: "slow" })
```

### IP pools

```ts
await postshiba.ipPools.list({ classification: "bulk" })
await postshiba.ipPools.get("PoOlIp")
await postshiba.ipPools.create({ name: "site_123", classification: "bulk", warmup_overflow: true })
await postshiba.ipPools.update("PoOlIp", { name: "site_123_bulk" })
await postshiba.ipPools.addIp("PoOlIp", { ip_address_id: "IpQwEr", weight: 100 })
await postshiba.ipPools.removeIp("PoOlIp", { ip_address_id: "IpQwEr" })
await postshiba.ipPools.attach("PoOlIp", { cluster_id: "NmQpXr" })
await postshiba.ipPools.detach("PoOlIp", { cluster_id: "NmQpXr" })
await postshiba.ipPools.delete("PoOlIp")
```

### Sending domains

```ts
await postshiba.sendingDomains.list()
await postshiba.sendingDomains.get("HsVtYk")
await postshiba.sendingDomains.create({ sending_domain: { name: "mail.example.com", tenant_id: "WbLcFd" } })
await postshiba.sendingDomains.update("HsVtYk", { sending_domain: { dkim_selector: "s1", dkim_manual: true } })
await postshiba.sendingDomains.refresh("HsVtYk")
await postshiba.sendingDomains.verify("HsVtYk")
await postshiba.sendingDomains.suspend("HsVtYk")
await postshiba.sendingDomains.resume("HsVtYk")
await postshiba.sendingDomains.makePrimary("HsVtYk")
await postshiba.sendingDomains.flushQueue("HsVtYk")
await postshiba.sendingDomains.move("HsVtYk", { sending_domain: { tenant_id: "WbLcFd" } })
await postshiba.sendingDomains.delete("HsVtYk")
```

### Tenants

```ts
await postshiba.tenants.list()
await postshiba.tenants.get("WbLcFd")
await postshiba.tenants.create({ tenant: { name: "Acme Florist" } })
await postshiba.tenants.update("WbLcFd", { tenant: { suppress_hard_bounces: false } })
await postshiba.tenants.delete("WbLcFd")
await postshiba.tenants.delete("WbLcFd", { destination_tenant_id: "QrStUv" })
```

### Inboxes

```ts
await postshiba.inboxes.list()
await postshiba.inboxes.get("PqRzMn")
await postshiba.inboxes.create({
	inbox: {
		name: "agent",
		webhook_url: "https://hooks.example.com/mail",
		host: "inbound.example.com",
		forward_to: "you@example.com",
	},
})
await postshiba.inboxes.update("PqRzMn", { inbox: { webhook_url: "https://hooks.example.com/mail" } })
await postshiba.inboxes.verify("PqRzMn")
await postshiba.inboxes.delete("PqRzMn")
```

### Messages

```ts
await postshiba.messages.list("PqRzMn")
await postshiba.messages.get("PqRzMn", "GxTyVu")
await postshiba.messages.downloadAttachment("PqRzMn", "GxTyVu", 1)
```

### Outbound messages

```ts
await postshiba.outboundMessages.list({ q: "receipt", limit: 25 })
await postshiba.outboundMessages.get("OuTbMs")
await postshiba.outboundMessages.raw("OuTbMs")
await postshiba.outboundMessages.downloadAttachment("OuTbMs", 0)
await postshiba.outboundRetention.get()
await postshiba.outboundRetention.update({ team: { outbound_retention_days: 45 } })
```

`raw` and `downloadAttachment` return an `ArrayBuffer`.

### DKIM signing

```ts
await postshiba.dkimSigning.get()
await postshiba.dkimSigning.update({ team: { sign_with_primary_domain: true } })
```

### Events

```ts
await postshiba.events.listTeam()
await postshiba.events.listTeam({ cluster_id: "NmQpXr", event_type: "bounce", limit: 100 })
await postshiba.events.list("NmQpXr", { recipient: "you@example.com", after: "JkLmNp" })
await postshiba.events.get("JkLmNp")
```

### Recipients, analytics and status

```ts
await postshiba.recipients.get("you@example.com")
await postshiba.analytics.get({ since: "2026-09-15T12:00:00Z", dimension: "mx_provider" })
await postshiba.status.get()
```

### SMTP credentials

```ts
await postshiba.smtpCredentials.create("NmQpXr", { smtp_credential: { tenant_id: "WbLcFd" } })
await postshiba.smtpCredentials.delete("NmQpXr", "RvWsXq")
```

Create returns `password`. Delete does not.

### Webhooks

```ts
await postshiba.webhooks.list()
await postshiba.webhooks.get("CdFgHj")
await postshiba.webhooks.create({
	webhook_endpoint: {
		url: "https://hooks.example.com/capsule",
		event_types: ["delivered", "bounce"],
		cluster_id: "NmQpXr",
	},
})
await postshiba.webhooks.update("CdFgHj", {
	webhook_endpoint: { enabled: false, event_types: ["delivered", "bounce"] },
})
await postshiba.webhooks.sendTest("CdFgHj")
await postshiba.webhooks.delete("CdFgHj")
```

List and update omit `secret`. Get and create return it.

### Templates

```ts
await postshiba.templates.list()
await postshiba.templates.get("welcome")
await postshiba.templates.create({
	email_template: {
		name: "Welcome",
		alias: "welcome",
		subject: "Hi {{ name }}",
		html: "<p>Hi {{ name }}</p>",
	},
})
await postshiba.templates.update("TpLmQr", { email_template: { subject: "Welcome, {{ name }}" } })
await postshiba.templates.publish("TpLmQr")
await postshiba.templates.duplicate("TpLmQr")
await postshiba.templates.delete("TpLmQr")
```

Send uses the published snapshot. `get` and member routes accept the public id or the alias.

### Suppressions

```ts
await postshiba.suppressions.list()
await postshiba.suppressions.list({ email: "blocked@example.com", limit: 1000 })
await postshiba.suppressions.create({ suppression: { email: "blocked@example.com", tenant_id: "WbLcFd" } })
await postshiba.suppressions.import({ emails: ["blocked@example.com", "old@example.com"], tenant_id: "WbLcFd" })
await postshiba.suppressions.bulkDelete({ reason: "bounce", before: "2026-02-01T00:00:00Z" })
await postshiba.suppressions.delete("YtReWq")
```

`bulkDelete` removes one batch. Call it again while `more` is `true`.

### Firewall

```ts
await postshiba.firewall.get()
await postshiba.firewall.update({ firewall: { enabled_checks: ["temp_providers", "plus_addressing"] } })
await postshiba.firewall.addEntry({ firewall_entry: { list: "deny", value: "mailinator.com" } })
await postshiba.firewall.deleteEntry("BnMkLo")
```

### ShieldShiba sites

```ts
await postshiba.shieldSites.list()
await postshiba.shieldSites.get("ShLdSt")
await postshiba.shieldSites.create({ shield_site: { name: "Signup", allowed_hostnames: ["acme.com"] } })
await postshiba.shieldSites.update("ShLdSt", { shield_site: { block_free_email: true } })
await postshiba.shieldSites.rotateSecret("ShLdSt")
await postshiba.shieldSites.delete("ShLdSt")
```

## Verify webhooks

HMAC-SHA256 of `{timestamp}.{rawBody}` against `X-Capsule-Signature`, compared in constant time. A `sha256=` prefix is stripped. Pass the raw body, before any JSON parsing.

`webhooks.unwrap` reads both headers, rejects a timestamp more than 300 seconds from now, checks the signature, and returns the parsed events. It uses Web Crypto, so it works on edge runtimes.

```ts
export default {
	async fetch(request) {
		try {
			const events = await postshiba.webhooks.unwrap(await request.text(), request.headers, secret)
			for (const event of events) console.log(event.event, event.email, event.sg_event_id)
			return new Response(null, { status: 204 })
		} catch (err) {
			if (err instanceof PostShibaWebhookError) return new Response(err.message, { status: 401 })
			throw err
		}
	},
}
```

With Express, read the body raw:

```ts
app.post("/webhooks/postshiba", express.raw({ type: "application/json" }), async (req, res) => {
	try {
		const events = await postshiba.webhooks.unwrap(req.body, req.headers, secret)
		for (const event of events) console.log(event.event, event.email)
		res.sendStatus(204)
	} catch (err) {
		res.sendStatus(err instanceof PostShibaWebhookError ? 401 : 500)
	}
})
```

`err.code` is `missing_header`, `invalid_timestamp`, `timestamp_out_of_range`, `invalid_signature`, or `invalid_json`. Pass `{ tolerance: 600 }` to change the window, or `{ tolerance: false }` to skip it. `unwrapWebhook` does the same without a client.

`webhooks.verify` checks the signature only and returns `true` or `false`:

```ts
const ok = postshiba.webhooks.verify(rawBody, timestamp, signature, secret)
```

## Errors and throttling

Non-2xx responses throw `PostShibaError` with `error`, `field`, and `message` from the JSON body, plus `status`, `code` (same as `error`), `retryable`, `rule` on firewall refusals, and `errors` on validation failures.

```ts
import { PostShibaError } from "@postshiba/node"

try {
	await postshiba.emails.send(body)
} catch (err) {
	if (err instanceof PostShibaError) {
		console.error(err.status, err.error, err.field, err.message)
	}
}
```

A `429` response with `error` `throttled` means the cluster hit its hourly send limit. Do not retry that send immediately. Immediate retries hit the same cap. Wait until the next hour. The client does not delay for you. In a queued job, catch `PostShibaError` and check `err.error === "throttled"` before sending again.

The client retries only what the API refused without acting on: `rate_limited` (the per-key request limit), `inject_unavailable`, and any reply with `retryable: true`. It waits with exponential backoff and jitter, or for `Retry-After` when the reply has one. It never retries `throttled`, `inject_timeout_unknown`, a network failure, or a timeout, since those sends may have gone out. `isRetryable(err)` gives the same answer for your own queue.

A call past its `timeout` throws `PostShibaTimeoutError`. An aborted `signal` rejects with the signal's reason.

Missing `teamId` on a team-scoped call throws before any request.

## Contributing

```sh
npm install
npm test
```

Tests mock HTTP and load fixtures from `../../fixtures/catalog`. Endpoints the shared catalog does not cover load theirs from `tests/fixtures`, copied from the API reference examples. They do not call production.

`npm test` runs `tsc` first, so a type that drifts from a fixture fails the suite.
