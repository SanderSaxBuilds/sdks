// Compile-time checks. `npm test` runs `tsc` before vitest, so a type that
// drifts from the shared fixtures fails the suite.
import { describe, expectTypeOf, it } from "vitest";
import { PostShiba } from "../src/index.js";
import type {
  Analytics,
  Cluster,
  DkimSigning,
  EmailTemplate,
  Empty,
  Firewall,
  FirewallEntry,
  InboundMessage,
  Inbox,
  IpPool,
  MessageEvent,
  NetworkIp,
  OutboundMessage,
  OutboundRetention,
  Recipient,
  SendEmailRequest,
  SendEmailResponse,
  SendingDomain,
  ShieldSite,
  SmtpCredential,
  Suppression,
  SuppressionBulkDelete,
  SuppressionImport,
  TeamStatus,
  Tenant,
  User,
  WebhookEndpoint,
  WebhookTestResult,
} from "../src/index.js";


// JSON imports widen literals to string/number, so compare against a widened target.
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? Widen<U>[]
        : T extends object
          ? { [K in keyof T]: Widen<T[K]> }
          : T;

// Keys the fixture has that the type does not declare, at any depth.
type Extra<J, T> = unknown extends T
  ? never
  : J extends readonly (infer JU)[]
    ? NonNullable<T> extends readonly (infer TU)[]
      ? Extra<JU, TU>
      : never
    : J extends object
      ? {
          [K in keyof J]: K extends keyof NonNullable<T> ? Extra<J[K], NonNullable<T>[K]> : K;
        }[keyof J]
      : never;

type Matches<J, T> = [J] extends [Widen<T>] ? ([Extra<J, T>] extends [never] ? true : Extra<J, T>) : "not assignable";

describe("types", () => {
  it("describe every shared response fixture exactly", () => {
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/whoami.json"), User>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/email_send_response.json"), SendEmailResponse>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/email_sandbox_response.json"), SendEmailResponse>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/email_send_template_response.json"), SendEmailResponse>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/cluster.json"), Cluster>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/cluster_boosted.json"), Cluster>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/cluster_deprovisioned.json"), Cluster>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/cluster_suspended.json"), Cluster>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/cluster_updated.json"), Cluster>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/network.json"), NetworkIp>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/network_assigned.json"), NetworkIp>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/network_dedicated.json"), NetworkIp>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/network_released.json"), NetworkIp>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/sending_domain.json"), SendingDomain>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/sending_domain_primary.json"), SendingDomain>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/sending_domain_suspended.json"), SendingDomain>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/sending_domain_updated.json"), SendingDomain>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/tenant.json"), Tenant>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/inbox.json"), Inbox>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/inbox_index.json"), Inbox>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/message.json"), InboundMessage>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/message_show.json"), InboundMessage>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/event.json"), MessageEvent>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/smtp_credential_create.json"), SmtpCredential>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/smtp_credential_deleted.json"), SmtpCredential>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/webhook.json"), WebhookEndpoint>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/webhook_show.json"), WebhookEndpoint>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/template.json"), EmailTemplate>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/template_updated.json"), EmailTemplate>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/template_duplicated.json"), EmailTemplate>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/suppression.json"), Suppression>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/suppression_import.json"), SuppressionImport>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/firewall.json"), Firewall>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/firewall_entry.json"), FirewallEntry>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/empty.json"), Empty>>().toEqualTypeOf<true>();
  });

  it("accept every shared request fixture", () => {
    type C = PostShiba;
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/email_send_request.json"), SendEmailRequest>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/email_send_template_request.json"), SendEmailRequest>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/cluster_create_request.json"), Parameters<C["clusters"]["create"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/cluster_update_request.json"), Parameters<C["clusters"]["update"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/cluster_boost_request.json"), Parameters<C["clusters"]["boost"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/cluster_extend_boost_request.json"), Parameters<C["clusters"]["extendBoost"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/network_create_request.json"), Parameters<C["network"]["create"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/network_create_request.json"), Parameters<C["network"]["assign"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/network_create_request.json"), Parameters<C["network"]["switch"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/network_release_request.json"), Parameters<C["network"]["release"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/sending_domain_create_request.json"), Parameters<C["sendingDomains"]["create"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/sending_domain_update_request.json"), Parameters<C["sendingDomains"]["update"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/tenant_create_request.json"), Parameters<C["tenants"]["create"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/inbox_create_request.json"), Parameters<C["inboxes"]["create"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/smtp_credential_create_request.json"), Parameters<C["smtpCredentials"]["create"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/webhook_create_request.json"), Parameters<C["webhooks"]["create"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/webhook_update_request.json"), Parameters<C["webhooks"]["update"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/template_create_request.json"), Parameters<C["templates"]["create"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/template_update_request.json"), Parameters<C["templates"]["update"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/suppression_create_request.json"), Parameters<C["suppressions"]["create"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/suppression_import_request.json"), Parameters<C["suppressions"]["import"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/firewall_update_request.json"), Parameters<C["firewall"]["update"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("../../../fixtures/catalog/firewall_entry_create_request.json"), Parameters<C["firewall"]["addEntry"]>[0]>>().toEqualTypeOf<true>();
  });

  it("describe every package fixture for the endpoints beyond the shared catalog", () => {
    type C = PostShiba;
    expectTypeOf<Matches<typeof import("./fixtures/analytics.json"), Analytics>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/cluster_auto_boosted.json"), Cluster>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/cluster_reactivated.json"), Cluster>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/dkim_signing.json"), DkimSigning>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/dkim_signing_updated.json"), DkimSigning>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/event_index.json"), MessageEvent>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/inbox_updated.json"), Inbox>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/ip_pool.json"), IpPool>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/ip_pool_created.json"), IpPool>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/ip_pool_deleted.json"), IpPool>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/ip_pool_ip_removed.json"), IpPool>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/ip_pool_updated.json"), IpPool>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/network_index.json"), NetworkIp>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/network_warming.json"), NetworkIp>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/outbound_message.json"), OutboundMessage>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/outbound_message_index.json"), OutboundMessage>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/outbound_retention.json"), OutboundRetention>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/recipient.json"), Recipient>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/sending_domain_flushed.json"), SendingDomain>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/sending_domain_moved.json"), SendingDomain>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/shield_site.json"), ShieldSite>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/shield_site_index.json"), ShieldSite>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/shield_site_rotated.json"), ShieldSite>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/shield_site_updated.json"), ShieldSite>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/status.json"), TeamStatus>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/suppression_bulk_delete.json"), SuppressionBulkDelete>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/tenant_updated.json"), Tenant>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/webhook_test.json"), WebhookTestResult>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/cluster_auto_boost_request.json"), Parameters<C["clusters"]["autoBoost"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/dkim_signing_update_request.json"), Parameters<C["dkimSigning"]["update"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/inbox_update_request.json"), Parameters<C["inboxes"]["update"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/ip_pool_add_ip_request.json"), Parameters<C["ipPools"]["addIp"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/ip_pool_cluster_request.json"), Parameters<C["ipPools"]["attach"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/ip_pool_create_request.json"), Parameters<C["ipPools"]["create"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/ip_pool_remove_ip_request.json"), Parameters<C["ipPools"]["removeIp"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/ip_pool_update_request.json"), Parameters<C["ipPools"]["update"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/network_warmup_request.json"), Parameters<C["network"]["warmup"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/outbound_retention_update_request.json"), Parameters<C["outboundRetention"]["update"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/sending_domain_move_request.json"), Parameters<C["sendingDomains"]["move"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/shield_site_create_request.json"), Parameters<C["shieldSites"]["create"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/shield_site_update_request.json"), Parameters<C["shieldSites"]["update"]>[1]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/suppression_bulk_delete_request.json"), Parameters<C["suppressions"]["bulkDelete"]>[0]>>().toEqualTypeOf<true>();
    expectTypeOf<Matches<typeof import("./fixtures/tenant_update_request.json"), Parameters<C["tenants"]["update"]>[1]>>().toEqualTypeOf<true>();
  });

  it("type each method's resolved value", () => {
    const c = new PostShiba("sk_test", { teamId: "KjkAJW" });
    expectTypeOf(c.users.me).returns.resolves.toEqualTypeOf<User>();
    expectTypeOf(c.emails.send).returns.resolves.toEqualTypeOf<SendEmailResponse>();
    expectTypeOf(c.emails.sendOnCluster).returns.resolves.toEqualTypeOf<SendEmailResponse>();
    expectTypeOf(c.clusters.list).returns.resolves.toEqualTypeOf<Cluster[]>();
    expectTypeOf(c.clusters.delete).returns.resolves.toEqualTypeOf<Cluster>();
    expectTypeOf(c.network.release).returns.resolves.toEqualTypeOf<NetworkIp>();
    expectTypeOf(c.sendingDomains.delete).returns.resolves.toEqualTypeOf<Empty>();
    expectTypeOf(c.inboxes.delete).returns.resolves.toEqualTypeOf<Inbox>();
    expectTypeOf(c.messages.list).returns.resolves.toEqualTypeOf<InboundMessage[]>();
    expectTypeOf(c.messages.downloadAttachment).returns.resolves.toEqualTypeOf<ArrayBuffer>();
    expectTypeOf(c.events.listTeam).returns.resolves.toEqualTypeOf<MessageEvent[]>();
    expectTypeOf(c.smtpCredentials.create).returns.resolves.toEqualTypeOf<SmtpCredential>();
    expectTypeOf(c.webhooks.get).returns.resolves.toEqualTypeOf<WebhookEndpoint>();
    expectTypeOf(c.webhooks.verify).returns.toEqualTypeOf<boolean>();
    expectTypeOf(c.templates.publish).returns.resolves.toEqualTypeOf<EmailTemplate>();
    expectTypeOf(c.suppressions.import).returns.resolves.toEqualTypeOf<SuppressionImport>();
    expectTypeOf(c.firewall.get).returns.resolves.toEqualTypeOf<Firewall>();
    expectTypeOf(c.firewall.addEntry).returns.resolves.toEqualTypeOf<FirewallEntry>();
    expectTypeOf(c.ipPools.list).returns.resolves.toEqualTypeOf<IpPool[]>();
    expectTypeOf(c.outboundMessages.raw).returns.resolves.toEqualTypeOf<ArrayBuffer>();
    expectTypeOf(c.recipients.get).returns.resolves.toEqualTypeOf<Recipient>();
    expectTypeOf(c.status.get).returns.resolves.toEqualTypeOf<TeamStatus>();
    expectTypeOf(c.shieldSites.delete).returns.resolves.toEqualTypeOf<Empty>();
    expectTypeOf(c.suppressions.bulkDelete).returns.resolves.toEqualTypeOf<SuppressionBulkDelete>();
    expectTypeOf(c.webhooks.sendTest).returns.resolves.toEqualTypeOf<WebhookTestResult>();
  });

  it("reject a misspelled send field", () => {
    const c = new PostShiba("sk_test");
    const typo = () =>
      // @ts-expect-error `form` is not a send field
      c.emails.send({ form: "hello@mail.example.com", to: ["you@example.com"] });
    expectTypeOf(typo).toBeFunction();
  });
});
