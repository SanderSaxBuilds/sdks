# Changelog

## Unreleased

- Types for every request and response, from the OpenAPI document. Exported, along with `RequestOptions`.
- `PostShibaError` carries `status`, `code`, `retryable`, `rule`, `errors`, and `body`.
- Retries for `rate_limited`, `inject_unavailable`, and replies with `retryable: true`, with backoff and `Retry-After`. `throttled` is never retried. New `maxRetries` option and `isRetryable` helper.
- `timeout` on the client and per call, `signal` per call. New `PostShibaTimeoutError`.
- CommonJS build next to ESM. `require("@postshiba/node")` and `require("postshiba")` work.
- `webhooks.unwrap` and `unwrapWebhook`: Web Crypto, constant-time compare, timestamp tolerance, `PostShibaWebhookError`. The client no longer imports `node:crypto`, so it loads on edge runtimes.
- `webhooks.verify` takes the body as bytes and returns `false` for a missing header.
- New methods: `clusters.reactivate`, `clusters.autoBoost`, `network.warmup`, `ipPools.*`, `sendingDomains.flushQueue`, `sendingDomains.move`, `tenants.update`, `inboxes.update`, `outboundMessages.*`, `outboundRetention.*`, `dkimSigning.*`, `recipients.get`, `analytics.get`, `status.get`, `webhooks.sendTest`, `suppressions.bulkDelete`, `shieldSites.*`. List filters on `network`, `events`, `suppressions`, and `outboundMessages`, and `destination_tenant_id` on `tenants.delete`.

## 0.1.0

Initial Node.js client. Published to npm as `@postshiba/node` (compiled ESM). `postshiba` is a thin alias of the same version.
