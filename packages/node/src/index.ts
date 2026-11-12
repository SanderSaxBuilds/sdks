import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  Analytics,
  AnalyticsQuery,
  AutoBoostRequest,
  BoostClusterRequest,
  BulkDeleteSuppressionsRequest,
  Cluster,
  CreateClusterRequest,
  CreateFirewallEntryRequest,
  CreateInboxRequest,
  CreateIpPoolRequest,
  CreateSendingDomainRequest,
  CreateShieldSiteRequest,
  CreateSmtpCredentialRequest,
  CreateSuppressionRequest,
  CreateTemplateRequest,
  CreateTenantRequest,
  CreateWebhookEndpointRequest,
  DeleteTenantOptions,
  DkimSigning,
  EmailTemplate,
  Empty,
  ErrorBody,
  EventQuery,
  ExtendBoostRequest,
  Firewall,
  FirewallEntry,
  Id,
  ImportSuppressionsRequest,
  InboundMessage,
  Inbox,
  IpPool,
  IpPoolAddIpRequest,
  IpPoolClusterRequest,
  IpPoolQuery,
  IpPoolRemoveIpRequest,
  MessageEvent,
  MoveSendingDomainRequest,
  NetworkAssignRequest,
  NetworkClusterRequest,
  NetworkCreateRequest,
  NetworkIp,
  NetworkQuery,
  NetworkReleaseRequest,
  NetworkWarmupRequest,
  OutboundMessage,
  OutboundMessageQuery,
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
  SuppressionQuery,
  TeamEventQuery,
  TeamStatus,
  Tenant,
  UpdateClusterRequest,
  UpdateDkimSigningRequest,
  UpdateFirewallRequest,
  UpdateInboxRequest,
  UpdateIpPoolRequest,
  UpdateOutboundRetentionRequest,
  UpdateSendingDomainRequest,
  UpdateShieldSiteRequest,
  UpdateTemplateRequest,
  UpdateTenantRequest,
  UpdateWebhookEndpointRequest,
  User,
  WebhookEndpoint,
  WebhookTestResult,
} from "./types.js";

export type * from "./types.js";

export type PostShibaOptions = {
  baseUrl?: string;
  teamId?: Id;
  /**
   * How many times to retry a request the API refused without acting on it:
   * `rate_limited`, `inject_unavailable`, or any reply with `retryable: true`.
   * A `throttled` send is never retried. Default 2. Pass 0 to turn retries off.
   */
  maxRetries?: number;
};

const DEFAULT_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;
/** A Retry-After longer than this is not worth waiting for inside one call. */
const MAX_RETRY_AFTER_MS = 60_000;

export type SendOptions = {
  clusterId?: Id;
};

export type ClusterSendOptions = {
  idempotencyKey?: string;
  sandbox?: boolean;
};

export type PostShibaErrorAttributes = {
  error?: string;
  field?: string | null;
  message?: string;
  status?: number;
  retryable?: boolean;
  rule?: string | null;
  errors?: string[];
  body?: unknown;
};

/** A non-2xx reply from the API. */
export class PostShibaError extends Error {
  /** The API's `error` string, such as `throttled` or `domain_unverified`. Match on this, not on `message`. */
  readonly error: string;
  /** Same as `error`. */
  readonly code: string;
  readonly field: string | null;
  /** HTTP status of the reply. `0` when the error was not built from a reply. */
  readonly status: number;
  /** `true` only when the API says nothing was sent and the same request can go again. `undefined` when the reply does not say. */
  readonly retryable: boolean | undefined;
  /** The firewall check that refused a recipient, on `firewall` errors. */
  readonly rule: string | null;
  /** Validation messages, when the API returns `{"errors": [...]}`. */
  readonly errors: string[];
  /** The parsed reply body, or its text when it was not JSON. */
  readonly body: unknown;

  constructor(attrs: PostShibaErrorAttributes) {
    const errors = attrs.errors ?? [];
    super(
      attrs.message ??
        attrs.error ??
        (errors.length > 0 ? errors.join(", ") : undefined) ??
        (attrs.status ? `Request failed with status ${attrs.status}` : "Request failed"),
    );
    this.name = "PostShibaError";
    this.error = attrs.error ?? "error";
    this.code = this.error;
    this.field = attrs.field ?? null;
    this.status = attrs.status ?? 0;
    this.retryable = attrs.retryable;
    this.rule = attrs.rule ?? null;
    this.errors = errors;
    this.body = attrs.body;
  }
}

/**
 * Whether the API refused the request without acting on it.
 *
 * `throttled` is the cluster's hourly or 24-hour cap. Retrying right away hits
 * the same cap, so it is never retried, even when the reply says retryable.
 */
export function isRetryable(err: PostShibaError): boolean {
  if (err.code === "throttled") return false;
  if (err.code === "rate_limited" || err.code === "inject_unavailable") return true;
  return err.retryable === true;
}

/** Milliseconds from a Retry-After header, given as seconds or an HTTP date. */
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

/** Exponential backoff with jitter: half of each step fixed, half random. */
function backoffDelay(attempt: number): number {
  const step = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** attempt);
  return step / 2 + Math.random() * (step / 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorFromResponse(status: number, text: string): PostShibaError {
  const parsed = parseJson(text);
  const payload = asErrorPayload(parsed);
  return new PostShibaError({
    error: typeof payload.error === "string" ? payload.error : undefined,
    field: typeof payload.field === "string" ? payload.field : null,
    message: typeof payload.message === "string" ? payload.message : undefined,
    status,
    retryable: typeof payload.retryable === "boolean" ? payload.retryable : undefined,
    rule: typeof payload.rule === "string" ? payload.rule : null,
    errors: Array.isArray(payload.errors) ? payload.errors.filter((e): e is string => typeof e === "string") : undefined,
    body: text === "" ? undefined : parsed,
  });
}

type QueryValue = string | number | boolean | null | undefined;

/** `?a=1&b=x` from the defined values, or "" when there are none. */
function queryString(query: object | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, QueryValue>)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function parseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asErrorPayload(value: unknown): ErrorBody {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as ErrorBody;
  return {};
}

export class PostShiba {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly teamId?: Id;
  readonly maxRetries: number;

  constructor(apiKey: string, options: PostShibaOptions = {}) {
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? "https://app.postshiba.com").replace(/\/$/, "");
    this.teamId = options.teamId;
    this.maxRetries = Math.max(0, Math.floor(options.maxRetries ?? DEFAULT_MAX_RETRIES));
  }

  private requireTeamId(): Id {
    if (this.teamId === undefined || this.teamId === null || this.teamId === "") {
      throw new Error("teamId is required");
    }
    return this.teamId;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; query?: object; headers?: Record<string, string>; binary?: boolean; team?: boolean } = {},
  ): Promise<T> {
    const resolved = opts.team ? `/api/v1/teams/${this.requireTeamId()}${path}` : path;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      ...opts.headers,
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const url = `${this.baseUrl}${resolved}${queryString(opts.query)}`;
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);

    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(url, { method, headers, body });
      if (res.ok) break;

      const err = errorFromResponse(res.status, await res.text());
      if (attempt >= this.maxRetries || !isRetryable(err)) throw err;
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      if (retryAfter !== undefined && retryAfter > MAX_RETRY_AFTER_MS) throw err;
      await sleep(retryAfter ?? backoffDelay(attempt));
    }

    if (opts.binary) return (await res.arrayBuffer()) as T;
    return parseJson(await res.text()) as T;
  }

  readonly users = {
    me: () => this.request<User>("GET", "/api/v1/users/me"),
  };

  readonly emails = {
    send: (body: SendEmailRequest, options: SendOptions = {}) => {
      const headers: Record<string, string> = {};
      if (options.clusterId !== undefined && options.clusterId !== null && options.clusterId !== "") {
        headers["X-Capsule-Cluster-Id"] = String(options.clusterId);
      }
      return this.request<SendEmailResponse>("POST", "/api/v1/emails", { body, headers });
    },
    sendOnCluster: (clusterId: Id, body: SendEmailRequest, options: ClusterSendOptions = {}) => {
      const payload = options.sandbox ? { ...body, sandbox: true } : body;
      const headers: Record<string, string> = {};
      if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
      return this.request<SendEmailResponse>("POST", `/clusters/${clusterId}/sends`, { body: payload, headers, team: true });
    },
  };

  readonly clusters = {
    list: () => this.request<Cluster[]>("GET", "/clusters", { team: true }),
    get: (id: Id) => this.request<Cluster>("GET", `/api/v1/clusters/${id}`),
    create: (body: CreateClusterRequest) => this.request<Cluster>("POST", "/clusters", { body, team: true }),
    update: (id: Id, body: UpdateClusterRequest) => this.request<Cluster>("PATCH", `/api/v1/clusters/${id}`, { body }),
    suspend: (id: Id) => this.request<Cluster>("POST", `/api/v1/clusters/${id}/suspend`),
    resume: (id: Id) => this.request<Cluster>("POST", `/api/v1/clusters/${id}/resume`),
    delete: (id: Id) => this.request<Cluster>("DELETE", `/api/v1/clusters/${id}`),
    boost: (id: Id, body: BoostClusterRequest) => this.request<Cluster>("POST", `/api/v1/clusters/${id}/boost`, { body }),
    extendBoost: (id: Id, body: ExtendBoostRequest) => this.request<Cluster>("POST", `/api/v1/clusters/${id}/extend_boost`, { body }),
    cancelBoost: (id: Id) => this.request<Cluster>("POST", `/api/v1/clusters/${id}/cancel_boost`),
    reactivate: (id: Id) => this.request<Cluster>("POST", `/api/v1/clusters/${id}/reactivate`),
    autoBoost: (id: Id, body: AutoBoostRequest) => this.request<Cluster>("PATCH", `/api/v1/clusters/${id}/auto_boost`, { body }),
  };

  readonly network = {
    list: (query?: NetworkQuery) => this.request<NetworkIp[]>("GET", "/network", { query, team: true }),
    create: (body: NetworkCreateRequest) => this.request<NetworkIp>("POST", "/network", { body, team: true }),
    assign: (body: NetworkAssignRequest) => this.request<NetworkIp>("POST", "/network/assign", { body, team: true }),
    unassign: (body: NetworkClusterRequest) => this.request<NetworkIp>("POST", "/network/unassign", { body, team: true }),
    switch: (body: NetworkClusterRequest) => this.request<NetworkIp>("POST", "/network/switch", { body, team: true }),
    release: (body: NetworkReleaseRequest) => this.request<NetworkIp>("POST", "/network/release", { body, team: true }),
    warmup: (body: NetworkWarmupRequest) => this.request<NetworkIp>("POST", "/network/warmup", { body, team: true }),
  };

  readonly ipPools = {
    list: (query?: IpPoolQuery) => this.request<IpPool[]>("GET", "/ip_pools", { query, team: true }),
    get: (id: Id) => this.request<IpPool>("GET", `/api/v1/ip_pools/${id}`),
    create: (body: CreateIpPoolRequest) => this.request<IpPool>("POST", "/ip_pools", { body, team: true }),
    update: (id: Id, body: UpdateIpPoolRequest) => this.request<IpPool>("PATCH", `/api/v1/ip_pools/${id}`, { body }),
    delete: (id: Id) => this.request<IpPool>("DELETE", `/api/v1/ip_pools/${id}`),
    addIp: (id: Id, body: IpPoolAddIpRequest) => this.request<IpPool>("POST", `/api/v1/ip_pools/${id}/add_ip`, { body }),
    removeIp: (id: Id, body: IpPoolRemoveIpRequest) => this.request<IpPool>("POST", `/api/v1/ip_pools/${id}/remove_ip`, { body }),
    attach: (id: Id, body: IpPoolClusterRequest) => this.request<IpPool>("POST", `/api/v1/ip_pools/${id}/attach`, { body }),
    detach: (id: Id, body: IpPoolClusterRequest) => this.request<IpPool>("POST", `/api/v1/ip_pools/${id}/detach`, { body }),
  };

  readonly sendingDomains = {
    list: () => this.request<SendingDomain[]>("GET", "/sending_domains", { team: true }),
    get: (id: Id) => this.request<SendingDomain>("GET", `/api/v1/sending_domains/${id}`),
    create: (body: CreateSendingDomainRequest) => this.request<SendingDomain>("POST", "/sending_domains", { body, team: true }),
    update: (id: Id, body: UpdateSendingDomainRequest) => this.request<SendingDomain>("PATCH", `/api/v1/sending_domains/${id}`, { body }),
    refresh: (id: Id) => this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/refresh`),
    verify: (id: Id) => this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/verify`),
    suspend: (id: Id) => this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/suspend`),
    resume: (id: Id) => this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/resume`),
    makePrimary: (id: Id) => this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/make_primary`),
    flushQueue: (id: Id) => this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/flush_queue`),
    move: (id: Id, body: MoveSendingDomainRequest) => this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/move`, { body }),
    delete: (id: Id) => this.request<Empty>("DELETE", `/api/v1/sending_domains/${id}`),
  };

  readonly tenants = {
    list: () => this.request<Tenant[]>("GET", "/tenants", { team: true }),
    get: (id: Id) => this.request<Tenant>("GET", `/api/v1/tenants/${id}`),
    create: (body: CreateTenantRequest) => this.request<Tenant>("POST", "/tenants", { body, team: true }),
    update: (id: Id, body: UpdateTenantRequest) => this.request<Tenant>("PATCH", `/api/v1/tenants/${id}`, { body }),
    delete: (id: Id, options?: DeleteTenantOptions) => this.request<Empty>("DELETE", `/api/v1/tenants/${id}`, { query: options }),
  };

  readonly inboxes = {
    list: () => this.request<Inbox[]>("GET", "/inboxes", { team: true }),
    get: (id: Id) => this.request<Inbox>("GET", `/api/v1/inboxes/${id}`),
    create: (body: CreateInboxRequest) => this.request<Inbox>("POST", "/inboxes", { body, team: true }),
    update: (id: Id, body: UpdateInboxRequest) => this.request<Inbox>("PATCH", `/api/v1/inboxes/${id}`, { body }),
    verify: (id: Id) => this.request<Inbox>("POST", `/api/v1/inboxes/${id}/verify`),
    delete: (id: Id) => this.request<Inbox>("DELETE", `/api/v1/inboxes/${id}`),
  };

  readonly messages = {
    list: (inboxId: Id) => this.request<InboundMessage[]>("GET", `/api/v1/inboxes/${inboxId}/inbound_messages`),
    get: (inboxId: Id, id: Id) => this.request<InboundMessage>("GET", `/api/v1/inboxes/${inboxId}/inbound_messages/${id}`),
    downloadAttachment: (inboxId: Id, id: Id, index: number) =>
      this.request<ArrayBuffer>("GET", `/api/v1/inboxes/${inboxId}/inbound_messages/${id}/attachments/${index}`, { binary: true }),
  };

  readonly events = {
    listTeam: (query?: TeamEventQuery) => this.request<MessageEvent[]>("GET", "/message_events", { query, team: true }),
    list: (clusterId: Id, query?: EventQuery) =>
      this.request<MessageEvent[]>("GET", `/clusters/${clusterId}/message_events`, { query, team: true }),
    get: (id: Id) => this.request<MessageEvent>("GET", `/api/v1/message_events/${id}`),
  };

  readonly smtpCredentials = {
    create: (clusterId: Id, body: CreateSmtpCredentialRequest) =>
      this.request<SmtpCredential>("POST", `/clusters/${clusterId}/smtp_credentials`, { body, team: true }),
    delete: (clusterId: Id, id: Id) =>
      this.request<SmtpCredential>("DELETE", `/clusters/${clusterId}/smtp_credentials/${id}`, { team: true }),
  };

  readonly webhooks = {
    list: () => this.request<WebhookEndpoint[]>("GET", "/webhook_endpoints", { team: true }),
    get: (id: Id) => this.request<WebhookEndpoint>("GET", `/api/v1/webhook_endpoints/${id}`),
    create: (body: CreateWebhookEndpointRequest) => this.request<WebhookEndpoint>("POST", "/webhook_endpoints", { body, team: true }),
    update: (id: Id, body: UpdateWebhookEndpointRequest) => this.request<WebhookEndpoint>("PATCH", `/api/v1/webhook_endpoints/${id}`, { body }),
    delete: (id: Id) => this.request<Empty>("DELETE", `/api/v1/webhook_endpoints/${id}`),
    /** Sends one signed test event to the endpoint now and returns the endpoint's reply code. */
    sendTest: (id: Id) => this.request<WebhookTestResult>("POST", `/api/v1/webhook_endpoints/${id}/send_test`),
    verify: (rawBody: string, timestamp: string, signature: string, secret: string) =>
      verifySignature(rawBody, timestamp, signature, secret),
  };

  readonly templates = {
    list: () => this.request<EmailTemplate[]>("GET", "/templates", { team: true }),
    get: (id: Id) => this.request<EmailTemplate>("GET", `/api/v1/templates/${id}`),
    create: (body: CreateTemplateRequest) => this.request<EmailTemplate>("POST", "/templates", { body, team: true }),
    update: (id: Id, body: UpdateTemplateRequest) => this.request<EmailTemplate>("PATCH", `/api/v1/templates/${id}`, { body }),
    publish: (id: Id) => this.request<EmailTemplate>("POST", `/api/v1/templates/${id}/publish`),
    duplicate: (id: Id) => this.request<EmailTemplate>("POST", `/api/v1/templates/${id}/duplicate`),
    delete: (id: Id) => this.request<Empty>("DELETE", `/api/v1/templates/${id}`),
  };

  readonly suppressions = {
    list: (query?: SuppressionQuery) => this.request<Suppression[]>("GET", "/suppressions", { query, team: true }),
    create: (body: CreateSuppressionRequest) => this.request<Suppression>("POST", "/suppressions", { body, team: true }),
    import: (body: ImportSuppressionsRequest) => this.request<SuppressionImport>("POST", "/suppressions/import", { body, team: true }),
    /** Deletes up to one batch of matching rows. Call again while `more` is `true`. */
    bulkDelete: (body: BulkDeleteSuppressionsRequest) =>
      this.request<SuppressionBulkDelete>("POST", "/suppressions/bulk_delete", { body, team: true }),
    delete: (id: Id) => this.request<Empty>("DELETE", `/api/v1/suppressions/${id}`),
  };

  readonly firewall = {
    get: () => this.request<Firewall>("GET", "/firewall", { team: true }),
    update: (body: UpdateFirewallRequest) => this.request<Firewall>("PATCH", "/firewall", { body, team: true }),
    addEntry: (body: CreateFirewallEntryRequest) => this.request<FirewallEntry>("POST", "/firewall_entries", { body, team: true }),
    deleteEntry: (id: Id) => this.request<Empty>("DELETE", `/api/v1/firewall_entries/${id}`),
  };

  readonly outboundMessages = {
    list: (query?: OutboundMessageQuery) => this.request<OutboundMessage[]>("GET", "/outbound_messages", { query, team: true }),
    get: (id: Id) => this.request<OutboundMessage>("GET", `/api/v1/outbound_messages/${id}`),
    /** The stored message as raw MIME bytes. */
    raw: (id: Id) => this.request<ArrayBuffer>("GET", `/api/v1/outbound_messages/${id}/raw`, { binary: true }),
    downloadAttachment: (id: Id, index: number) =>
      this.request<ArrayBuffer>("GET", `/api/v1/outbound_messages/${id}/attachments/${index}`, { binary: true }),
  };

  readonly outboundRetention = {
    get: () => this.request<OutboundRetention>("GET", "/outbound_retention", { team: true }),
    update: (body: UpdateOutboundRetentionRequest) =>
      this.request<OutboundRetention>("PATCH", "/outbound_retention", { body, team: true }),
  };

  readonly dkimSigning = {
    get: () => this.request<DkimSigning>("GET", "/dkim_signing", { team: true }),
    update: (body: UpdateDkimSigningRequest) => this.request<DkimSigning>("PATCH", "/dkim_signing", { body, team: true }),
  };

  readonly recipients = {
    /** What the platform knows about one address: suppressions, firewall result and recent sends. */
    get: (email: string) => this.request<Recipient>("GET", "/recipients", { query: { email }, team: true }),
  };

  readonly analytics = {
    get: (query?: AnalyticsQuery) => this.request<Analytics>("GET", "/analytics", { query, team: true }),
  };

  readonly status = {
    get: () => this.request<TeamStatus>("GET", "/status", { team: true }),
  };

  readonly shieldSites = {
    list: () => this.request<ShieldSite[]>("GET", "/shield_sites", { team: true }),
    get: (id: Id) => this.request<ShieldSite>("GET", `/api/v1/shield_sites/${id}`),
    create: (body: CreateShieldSiteRequest) => this.request<ShieldSite>("POST", "/shield_sites", { body, team: true }),
    update: (id: Id, body: UpdateShieldSiteRequest) => this.request<ShieldSite>("PATCH", `/api/v1/shield_sites/${id}`, { body }),
    delete: (id: Id) => this.request<Empty>("DELETE", `/api/v1/shield_sites/${id}`),
    rotateSecret: (id: Id) => this.request<ShieldSite>("POST", `/api/v1/shield_sites/${id}/rotate_secret`),
  };
}

function verifySignature(rawBody: string, timestamp: string, signature: string, secret: string): boolean {
  const given = signature.replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
