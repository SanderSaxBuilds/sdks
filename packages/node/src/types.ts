// Request and response shapes for the PostShiba REST API.
//
// Field names, enums, and nullability follow the OpenAPI document at
// https://app.postshiba.com/openapi.json and the shared fixtures in
// fixtures/catalog. The OpenAPI document marks most response fields optional,
// so they stay optional here. Resource ids are always present.

export type Id = string;
export type Json = Record<string, unknown>;

/** Body of a `204 No Content` reply. The client turns an empty body into `{}`. */
export type Empty = Record<string, never>;

export type Classification = "transactional" | "bulk";
export type WarmupMode = "standard" | "slow" | "fast" | "manual";

// Users

export type User = {
  id: Id;
  email?: string;
  first_name?: string | null;
};

// Sending

export type Attachment = {
  filename: string;
  content_type: string;
  /** Base64-encoded file content. */
  content: string;
};

export type TemplateReference = {
  /** Template alias or public id. */
  id?: string;
  alias?: string;
  variables?: Record<string, unknown>;
};

export type SendEmailRequest = {
  /** Leave it out to use the template From, or hello@ on the tenant's first sending-ready domain. */
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  reply_to?: string;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
  headers?: Record<string, string>;
  unique_args?: Record<string, unknown>;
  /** Tenant id or slug. Leave it out for the default tenant. */
  tenant?: string;
  /** A published template. Leave out `html` and `text` when you pass one. */
  template?: TemplateReference;
  sandbox?: boolean;
};

export type SendEmailResponse = {
  queued: boolean;
  message_id?: string;
  from?: string;
  to?: string[];
  subject?: string;
  unique_args?: Record<string, unknown>;
  /** Recipients skipped because they are on the suppression list. */
  suppressed?: string[];
};

// Clusters

export type ClusterBoost = {
  sku?: string;
  trigger?: "manual" | "auto";
  status?: string;
  target_plan?: string;
  target_emails_per_hour?: number;
  target_emails_per_day?: number;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type ClusterAutoBoost = {
  sku?: string | null;
  monthly_limit?: number;
  used_this_month?: number;
};

export type SendingIp = {
  id?: Id;
  address?: string | null;
  status?: string;
  kind?: "shared" | "dedicated";
  classification?: Classification;
  weight?: number;
  provider?: string | null;
};

export type RefusedSends = {
  smtp_username?: string;
  reason?: "unavailable";
  count?: number;
  first_at?: string;
  last_at?: string;
};

export type Cluster = {
  id: Id;
  name?: string;
  region?: string;
  size?: string;
  plan?: string;
  emails_per_hour?: number;
  emails_per_day?: number;
  base_emails_per_hour?: number;
  base_emails_per_day?: number;
  boost?: ClusterBoost | null;
  auto_boost?: ClusterAutoBoost | null;
  ip_assignment?: string;
  desired_status?: string;
  status?: string;
  smtp_endpoint?: string | null;
  http_endpoint?: string | null;
  classification?: Classification;
  assigned_ip?: { address?: string | null; status?: string } | null;
  sending_ips?: SendingIp[];
  ip_pools?: Array<{ id?: Id; name?: string }>;
  sending_ready?: boolean;
  refused_sends?: RefusedSends[];
};

export type CreateClusterRequest = {
  cluster: {
    name?: string;
    region?: string;
    size?: string;
    plan?: string;
    classification?: Classification;
  };
};

export type UpdateClusterRequest = {
  cluster: {
    name?: string;
    region?: string;
    size?: string;
    plan?: string;
  };
};

export type BoostClusterRequest = {
  sku: string;
  /** ISO 8601 time. `null` or absent starts the boost now. */
  starts_at?: string | null;
};

export type ExtendBoostRequest = {
  idempotency_key?: string;
};

export type AutoBoostRequest = {
  /** Boost SKU to buy when the cluster reaches its cap. `null` turns auto boost off. */
  sku: string | null;
  /** Most auto boosts per calendar month. */
  monthly_limit?: number;
};

// Network

export type NetworkIp = {
  id: Id;
  address?: string | null;
  status?: string;
  warmup_ends_at?: string | null;
  warmup_mode?: WarmupMode;
  warmup_daily_cap?: number | null;
  warmup_hold?: "idle" | "deferred" | "bounce" | "spamreport" | null;
  kind?: "shared" | "dedicated";
  classification?: Classification;
  provider?: string | null;
  owned?: boolean;
  available?: boolean;
  cluster_ids?: Id[];
  ip_pool_ids?: Id[];
  feedback_loops?: string[];
};

export type NetworkCreateRequest = {
  ip_address_id: Id;
  cluster_id?: Id;
  classification?: Classification;
  split?: "default" | "custom";
  percents?: Record<string, number>;
  warmup_mode?: WarmupMode;
};

export type NetworkAssignRequest = {
  ip_address_id: Id;
  cluster_id: Id;
  split?: "default" | "custom";
  percents?: Record<string, number>;
};

export type NetworkClusterRequest = {
  ip_address_id: Id;
  cluster_id: Id;
};

export type NetworkReleaseRequest = {
  ip_address_id: Id;
};

export type NetworkWarmupRequest = {
  ip_address_id: Id;
  warmup_mode: WarmupMode;
};

export type NetworkQuery = {
  classification?: Classification;
  cluster_id?: Id;
};

// IP pools

export type IpPoolIp = {
  id: Id;
  address?: string | null;
  status?: string;
  warmup_ends_at?: string | null;
  warmup_mode?: WarmupMode;
  warmup_daily_cap?: number | null;
  warmup_hold?: "idle" | "deferred" | "bounce" | "spamreport" | null;
  weight?: number;
};

export type IpPool = {
  id: Id;
  name?: string;
  classification?: Classification;
  warmup_overflow?: boolean;
  ips?: IpPoolIp[];
  cluster_ids?: Id[];
  created_at?: string;
};

export type CreateIpPoolRequest = {
  name: string;
  classification: Classification;
  warmup_overflow?: boolean;
};

export type UpdateIpPoolRequest = {
  name?: string;
  warmup_overflow?: boolean;
};

export type IpPoolAddIpRequest = {
  ip_address_id: Id;
  weight?: number;
};

export type IpPoolRemoveIpRequest = {
  ip_address_id: Id;
};

export type IpPoolClusterRequest = {
  cluster_id: Id;
};

export type IpPoolQuery = {
  classification?: Classification;
};

// Sending domains

export type SendingDomain = {
  id: Id;
  name?: string;
  tenant_id?: Id;
  tenant?: string;
  dkim_status?: string;
  return_path_status?: string;
  dmarc_status?: string;
  sending_allowed?: boolean;
  dkim_selector?: string;
  dkim_manual?: boolean;
  dkim_txt?: string;
  dkim_cname_host?: string;
  dkim_cname_target?: string | null;
  dmarc_host?: string;
  dmarc_record?: string;
  return_path_host?: string;
  return_path_target?: string;
  last_verification_error?: string | null;
  suspended?: boolean;
  suspended_reason?: string | null;
  operator_held?: boolean;
  primary?: boolean;
  queued_messages?: number;
  queue_flushed_at?: string | null;
};

export type CreateSendingDomainRequest = {
  sending_domain: {
    name: string;
    dkim_selector?: string;
    dkim_manual?: boolean;
    /** PEM. Write-only: responses never include it. */
    dkim_private_key?: string;
    tenant_id?: Id;
  };
};

export type MoveSendingDomainRequest = {
  sending_domain: {
    tenant_id: Id;
  };
};

export type UpdateSendingDomainRequest = {
  sending_domain: {
    dkim_selector?: string;
    dkim_manual?: boolean;
    dkim_private_key?: string;
  };
};

// Tenants

export type Tenant = {
  id: Id;
  name?: string;
  slug?: string;
  suspended?: boolean;
  suppress_hard_bounces?: boolean;
};

export type CreateTenantRequest = {
  tenant: {
    name: string;
    slug?: string;
  };
};

export type UpdateTenantRequest = {
  tenant: {
    suppress_hard_bounces?: boolean;
  };
};

export type DeleteTenantOptions = {
  /** Tenant that takes over the deleted tenant's domains, credentials and inboxes. */
  destination_tenant_id?: Id;
};

// Inboxes and inbound messages

export type Inbox = {
  id: Id;
  name?: string;
  address?: string;
  local_part?: string;
  host?: string;
  tenant_id?: Id;
  sending_domain_id?: Id | null;
  webhook_url?: string | null;
  webhook_format?: string;
  /** Present on create and show only. */
  webhook_secret?: string;
  forward_to?: string | null;
  mx_status?: string;
  mx_record?: string | null;
  mx_target?: string | null;
  inbound_emails_per_hour?: number;
  retention_hours?: number;
  stored_bytes?: number;
};

export type CreateInboxRequest = {
  inbox: {
    name?: string;
    local_part?: string;
    sending_domain_id?: Id;
    tenant_id?: Id;
    host?: string;
    forward_to?: string;
    webhook_url?: string;
    webhook_format?: string;
  };
};

export type UpdateInboxRequest = {
  inbox: {
    name?: string;
    webhook_url?: string;
    webhook_format?: string;
    forward_to?: string;
  };
};

export type InboundAttachment = {
  filename?: string;
  content_type?: string;
  size?: number;
  content_id?: string | null;
  disposition?: string | null;
  /** Present on message show. */
  content_base64?: string | null;
};

export type MessageAuthentication = {
  spf?: { result?: string; domain?: string };
  dkim?: Array<{ result?: string; domain?: string; selector?: string }>;
  dmarc?: { result?: string; policy?: string; aligned?: boolean };
  arc?: { result?: string };
};

export type InboundMessage = {
  id: Id;
  inbox_id?: Id;
  to?: string;
  from?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  thread_id?: string | null;
  in_reply_to?: string | null;
  headers?: Record<string, unknown>;
  envelope?: Record<string, unknown>;
  authentication?: MessageAuthentication;
  attachments?: InboundAttachment[];
  expires_at?: string;
  drain_status?: string;
  /** Raw MIME. Present on message show. */
  raw?: string | null;
};

// Outbound messages

export type OutboundMessage = {
  id: Id;
  message_id?: string;
  from?: string | null;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string | null;
  source?: "api" | "account" | "template_test";
  sandbox?: boolean;
  bytesize?: number;
  retention_days?: number;
  cluster_id?: Id | null;
  tenant_id?: Id | null;
  created_at?: string;
  expires_at?: string;
  /** Present on show. */
  text?: string | null;
  /** Present on show. */
  html?: string | null;
  /** Present on show. */
  attachments?: Array<{ filename?: string | null; content_type?: string | null; size?: number }>;
};

export type OutboundMessageQuery = {
  /** Search text. */
  q?: string;
  /** Cursor: only messages older than this id. */
  before?: Id;
  limit?: number;
};

export type RetentionDays = 0 | 7 | 28 | 45 | 90 | 180 | 365;

export type OutboundRetention = {
  retention_days?: number;
  options?: Array<{ days?: number; price_per_1000_cents?: number }>;
};

export type UpdateOutboundRetentionRequest = {
  team: {
    outbound_retention_days: RetentionDays;
  };
};

// DKIM signing

export type DkimSigning = {
  sign_with_primary_domain?: boolean;
  primary_domain?: string | null;
};

export type UpdateDkimSigningRequest = {
  team: {
    sign_with_primary_domain: boolean;
  };
};

// Events

export type MessageEvent = {
  id: Id;
  event_type?: string;
  recipient?: string | null;
  sender?: string | null;
  message_id?: string | null;
  mx_provider?: string | null;
  sending_ip?: string | null;
  bounce_classification?: string | null;
  bounce_reason?: string | null;
  smtp_code?: number | null;
  enhanced_code?: string | null;
  explanation?: string | null;
  occurred_at?: string;
  drain_status?: string;
  tenant_id?: Id | null;
  sending_domain_id?: Id | null;
  node_id?: Id | null;
  /** Omitted for Support keys. */
  payload?: Record<string, unknown>;
};

/** Filters for event lists. Events are cursor-paginated with `after` or `before`. */
export type EventQuery = {
  message_id?: string;
  recipient?: string;
  mx_provider?: string;
  sending_ip?: string;
  tenant_id?: Id;
  sending_domain_id?: Id;
  event_type?: string;
  since?: string;
  until?: string;
  query?: string;
  /** Up to 1000. Default 200. */
  limit?: number;
  before?: Id;
  after?: Id;
};

export type TeamEventQuery = EventQuery & {
  cluster_id?: Id;
};

// Recipients, analytics and status

export type RecipientSend = {
  id: Id;
  event_type?: string;
  message_id?: string | null;
  occurred_at?: string;
  explanation?: string | null;
};

export type Recipient = {
  email?: string;
  can_receive?: boolean;
  suppressions?: Suppression[];
  firewall?: string | null;
  sends?: RecipientSend[];
};

export type AnalyticsCounts = {
  processed?: number;
  delivered?: number;
  deferred?: number;
  bounce?: number;
  spamreport?: number;
  unsubscribe?: number;
};

export type AnalyticsRow = AnalyticsCounts & {
  key?: string | null;
  label?: string | null;
};

export type AnalyticsWindow = {
  since?: string;
  until?: string;
};

export type Analytics = {
  dimension?: string;
  window?: AnalyticsWindow;
  totals?: AnalyticsCounts;
  rows?: AnalyticsRow[];
  /** Present when the query asks for a comparison window. */
  compare?: {
    window?: AnalyticsWindow;
    totals?: AnalyticsCounts;
    rows?: AnalyticsRow[];
  };
};

export type AnalyticsQuery = {
  since?: string;
  until?: string;
  dimension?: string;
  min_processed?: number;
  compare?: boolean;
  compare_since?: string;
  compare_until?: string;
};

export type TeamStatus = {
  suspended?: boolean;
  kyc_status?: string | null;
  clusters_at_cap?: Array<{
    id: Id;
    name?: string;
    hourly_remaining?: number;
    daily_remaining?: number;
    queued?: number;
  }>;
  held_tenants?: Array<{ id: Id; slug?: string }>;
};

// SMTP credentials

export type SmtpCredential = {
  id: Id;
  username?: string;
  /** Returned once, on create. */
  password?: string;
  tenant_id?: Id;
  tenant?: string;
  cluster_id?: Id;
};

export type CreateSmtpCredentialRequest = {
  smtp_credential: {
    tenant_id?: Id;
  };
};

// Webhook endpoints

export type WebhookEventType =
  | "processed"
  | "dropped"
  | "deferred"
  | "bounce"
  | "delivered"
  | "spamreport"
  | "unsubscribe"
  | "open"
  | "click"
  | "group_unsubscribe"
  | "group_resubscribe";

export type WebhookEndpoint = {
  id: Id;
  url?: string;
  enabled?: boolean;
  cluster_id?: Id | null;
  tenant_id?: Id | null;
  event_types?: string[];
  last_success_at?: string | null;
  last_failure_at?: string | null;
  consecutive_failures?: number;
  status?: "idle" | "up" | "retrying" | "down";
  next_canary_at?: string | null;
  /** Signing secret. Present on create and show only. */
  secret?: string;
};

export type CreateWebhookEndpointRequest = {
  webhook_endpoint: {
    url: string;
    enabled?: boolean;
    event_types?: WebhookEventType[];
    cluster_id?: Id | null;
    tenant_id?: Id | null;
  };
};

export type UpdateWebhookEndpointRequest = {
  webhook_endpoint: {
    url?: string;
    enabled?: boolean;
    event_types?: WebhookEventType[];
    cluster_id?: Id | null;
    tenant_id?: Id | null;
  };
};

export type WebhookTestResult = {
  ok?: boolean;
  response_code?: number | null;
  error?: string | null;
  endpoint?: WebhookEndpoint;
};

// Templates

export type EmailTemplate = {
  id: Id;
  name?: string;
  alias?: string | null;
  from?: string | null;
  reply_to?: string | null;
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  css?: string | null;
  sample_data?: Record<string, unknown>;
  published?: boolean;
  published_at?: string | null;
  has_unpublished_changes?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type EmailTemplateFields = {
  name?: string;
  alias?: string;
  from?: string;
  reply_to?: string;
  subject?: string;
  html?: string;
  text?: string;
  css?: string;
  sample_data?: Record<string, unknown>;
};

export type CreateTemplateRequest = {
  email_template: EmailTemplateFields & { name: string };
};

export type UpdateTemplateRequest = {
  email_template: EmailTemplateFields;
};

// Suppressions

export type SuppressionReason = "bounce" | "spamreport" | "unsubscribe" | "manual";

export type Suppression = {
  id: Id;
  email?: string;
  reason?: string;
  tenant_id?: Id;
  tenant?: string;
  created_at?: string;
};

export type CreateSuppressionRequest = {
  suppression: {
    email: string;
    tenant_id?: Id;
  };
};

export type ImportSuppressionsRequest = {
  emails: string[];
  reason?: SuppressionReason;
  tenant_id?: Id;
};

export type SuppressionImport = {
  imported?: number;
  existing?: number;
  invalid?: number;
};

export type SuppressionQuery = {
  email?: string;
  /** Cursor: the last id you saw. */
  after?: Id;
  /** Up to 1000. Default 100. */
  limit?: number;
};

export type BulkDeleteSuppressionsRequest = {
  emails?: string[];
  reason?: SuppressionReason;
  tenant_id?: Id;
  /** ISO 8601 time. Only suppressions created before it. */
  before?: string;
};

export type SuppressionBulkDelete = {
  deleted?: number;
  /** `true` when more rows match. Call again to delete the next batch. */
  more?: boolean;
};

// Firewall

export type FirewallEntry = {
  id: Id;
  list?: string;
  value?: string;
  created_at?: string;
};

export type Firewall = {
  enabled_checks?: string[];
  available_checks?: string[];
  entries?: FirewallEntry[];
};

export type UpdateFirewallRequest = {
  firewall: {
    enabled_checks?: string[];
  };
};

export type CreateFirewallEntryRequest = {
  firewall_entry: {
    list: string;
    value: string;
  };
};

// ShieldShiba

export type ShieldSite = {
  id: Id;
  name?: string;
  public_key?: string;
  allowed_hostnames?: string[];
  block_hosting?: boolean;
  block_free_email?: boolean;
  require_liveness?: boolean;
  allowlist?: string[];
  verifications_7d?: { passed?: number; blocked?: number };
  created_at?: string;
  /** Present on create, show and rotate only. */
  secret_key?: string;
};

export type ShieldSiteFields = {
  name?: string;
  /** A list, or one comma-separated string. */
  allowed_hostnames?: string | string[];
  block_hosting?: boolean;
  block_free_email?: boolean;
  require_liveness?: boolean;
  /** A list, or one comma-separated string. */
  allowlist?: string | string[];
};

export type CreateShieldSiteRequest = {
  shield_site: ShieldSiteFields & { name: string };
};

export type UpdateShieldSiteRequest = {
  shield_site: ShieldSiteFields;
};

// Errors

/** JSON body of a non-2xx reply. */
export type ErrorBody = {
  error?: string;
  field?: string | null;
  message?: string;
  /** Validation failures on create and update. */
  errors?: string[];
  /** Firewall check that failed, on `firewall` errors. */
  rule?: string;
  /** `true` only when nothing was sent and the same request can go again. */
  retryable?: boolean;
};
