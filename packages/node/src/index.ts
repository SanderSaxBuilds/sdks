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
  /**
   * Milliseconds each call may take, retries and waits included, before it
   * fails with `PostShibaTimeoutError`. No timeout by default.
   */
  timeout?: number;
};

const DEFAULT_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;
/** A Retry-After longer than this is not worth waiting for inside one call. */
const MAX_RETRY_AFTER_MS = 60_000;

/** Per-call options. Every method takes them as its last argument. */
export type RequestOptions = {
  /** Cancels the call, including any wait between retries. */
  signal?: AbortSignal;
  /**
   * Milliseconds the whole call may take, retries and waits included, before
   * it fails with `PostShibaTimeoutError`. Overrides the client's `timeout`.
   */
  timeout?: number;
};

export type SendOptions = RequestOptions & {
  clusterId?: Id;
};

export type ClusterSendOptions = RequestOptions & {
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
 * The call ran past its `timeout`. The request may still have reached the API,
 * so a timed-out send is not retried: check events or send again with an
 * Idempotency-Key.
 */
export class PostShibaTimeoutError extends Error {
  /** The timeout that ran out, in milliseconds. */
  readonly timeout: number;

  constructor(timeout: number) {
    super(`Request timed out after ${timeout} ms`);
    this.name = "PostShibaTimeoutError";
    this.timeout = timeout;
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
  readonly timeout?: number;

  constructor(apiKey: string, options: PostShibaOptions = {}) {
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? "https://app.postshiba.com").replace(/\/$/, "");
    this.teamId = options.teamId;
    this.maxRetries = Math.max(0, Math.floor(options.maxRetries ?? DEFAULT_MAX_RETRIES));
    this.timeout = options.timeout;
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
    opts: {
      body?: unknown;
      query?: object;
      headers?: Record<string, string>;
      binary?: boolean;
      team?: boolean;
      options?: RequestOptions;
    } = {},
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

    const callerSignal = opts.options?.signal;
    const timeout = opts.options?.timeout ?? this.timeout;
    const hasTimeout = typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0;
    if (!callerSignal && !hasTimeout) return this.send<T>(method, url, headers, body, opts.binary);

    if (callerSignal?.aborted) throw callerSignal.reason;
    const controller = new AbortController();
    const onAbort = () => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = hasTimeout
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeout)
      : undefined;
    try {
      return await this.send<T>(method, url, headers, body, opts.binary, controller.signal);
    } catch (err) {
      if (timedOut) throw new PostShibaTimeoutError(timeout as number);
      throw err;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onAbort);
    }
  }

  private async send<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | undefined,
    binary: boolean | undefined,
    signal?: AbortSignal,
  ): Promise<T> {
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(url, signal ? { method, headers, body, signal } : { method, headers, body });
      if (res.ok) break;

      const err = errorFromResponse(res.status, await res.text());
      if (attempt >= this.maxRetries || !isRetryable(err)) throw err;
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      if (retryAfter !== undefined && retryAfter > MAX_RETRY_AFTER_MS) throw err;
      await sleep(retryAfter ?? backoffDelay(attempt), signal);
    }

    if (binary) return (await res.arrayBuffer()) as T;
    return parseJson(await res.text()) as T;
  }

  readonly users = {
    me: (options?: RequestOptions) => this.request<User>("GET", "/api/v1/users/me", { options }),
  };

  readonly emails = {
    send: (body: SendEmailRequest, options: SendOptions = {}) => {
      const headers: Record<string, string> = {};
      if (options.clusterId !== undefined && options.clusterId !== null && options.clusterId !== "") {
        headers["X-Capsule-Cluster-Id"] = String(options.clusterId);
      }
      return this.request<SendEmailResponse>("POST", "/api/v1/emails", { body, headers, options });
    },
    sendOnCluster: (clusterId: Id, body: SendEmailRequest, options: ClusterSendOptions = {}) => {
      const payload = options.sandbox ? { ...body, sandbox: true } : body;
      const headers: Record<string, string> = {};
      if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
      return this.request<SendEmailResponse>("POST", `/clusters/${clusterId}/sends`, {
        body: payload,
        headers,
        team: true,
        options,
      });
    },
  };

  readonly clusters = {
    list: (options?: RequestOptions) => this.request<Cluster[]>("GET", "/clusters", { team: true, options }),
    get: (id: Id, options?: RequestOptions) => this.request<Cluster>("GET", `/api/v1/clusters/${id}`, { options }),
    create: (body: CreateClusterRequest, options?: RequestOptions) =>
      this.request<Cluster>("POST", "/clusters", { body, team: true, options }),
    update: (id: Id, body: UpdateClusterRequest, options?: RequestOptions) =>
      this.request<Cluster>("PATCH", `/api/v1/clusters/${id}`, { body, options }),
    suspend: (id: Id, options?: RequestOptions) =>
      this.request<Cluster>("POST", `/api/v1/clusters/${id}/suspend`, { options }),
    resume: (id: Id, options?: RequestOptions) =>
      this.request<Cluster>("POST", `/api/v1/clusters/${id}/resume`, { options }),
    delete: (id: Id, options?: RequestOptions) =>
      this.request<Cluster>("DELETE", `/api/v1/clusters/${id}`, { options }),
    boost: (id: Id, body: BoostClusterRequest, options?: RequestOptions) =>
      this.request<Cluster>("POST", `/api/v1/clusters/${id}/boost`, { body, options }),
    extendBoost: (id: Id, body: ExtendBoostRequest, options?: RequestOptions) =>
      this.request<Cluster>("POST", `/api/v1/clusters/${id}/extend_boost`, { body, options }),
    cancelBoost: (id: Id, options?: RequestOptions) =>
      this.request<Cluster>("POST", `/api/v1/clusters/${id}/cancel_boost`, { options }),
    reactivate: (id: Id, options?: RequestOptions) =>
      this.request<Cluster>("POST", `/api/v1/clusters/${id}/reactivate`, { options }),
    autoBoost: (id: Id, body: AutoBoostRequest, options?: RequestOptions) =>
      this.request<Cluster>("PATCH", `/api/v1/clusters/${id}/auto_boost`, { body, options }),
  };

  readonly network = {
    list: (query?: NetworkQuery, options?: RequestOptions) =>
      this.request<NetworkIp[]>("GET", "/network", { query, team: true, options }),
    create: (body: NetworkCreateRequest, options?: RequestOptions) =>
      this.request<NetworkIp>("POST", "/network", { body, team: true, options }),
    assign: (body: NetworkAssignRequest, options?: RequestOptions) =>
      this.request<NetworkIp>("POST", "/network/assign", { body, team: true, options }),
    unassign: (body: NetworkClusterRequest, options?: RequestOptions) =>
      this.request<NetworkIp>("POST", "/network/unassign", { body, team: true, options }),
    switch: (body: NetworkClusterRequest, options?: RequestOptions) =>
      this.request<NetworkIp>("POST", "/network/switch", { body, team: true, options }),
    release: (body: NetworkReleaseRequest, options?: RequestOptions) =>
      this.request<NetworkIp>("POST", "/network/release", { body, team: true, options }),
    warmup: (body: NetworkWarmupRequest, options?: RequestOptions) =>
      this.request<NetworkIp>("POST", "/network/warmup", { body, team: true, options }),
  };

  readonly ipPools = {
    list: (query?: IpPoolQuery, options?: RequestOptions) =>
      this.request<IpPool[]>("GET", "/ip_pools", { query, team: true, options }),
    get: (id: Id, options?: RequestOptions) => this.request<IpPool>("GET", `/api/v1/ip_pools/${id}`, { options }),
    create: (body: CreateIpPoolRequest, options?: RequestOptions) =>
      this.request<IpPool>("POST", "/ip_pools", { body, team: true, options }),
    update: (id: Id, body: UpdateIpPoolRequest, options?: RequestOptions) =>
      this.request<IpPool>("PATCH", `/api/v1/ip_pools/${id}`, { body, options }),
    delete: (id: Id, options?: RequestOptions) => this.request<IpPool>("DELETE", `/api/v1/ip_pools/${id}`, { options }),
    addIp: (id: Id, body: IpPoolAddIpRequest, options?: RequestOptions) =>
      this.request<IpPool>("POST", `/api/v1/ip_pools/${id}/add_ip`, { body, options }),
    removeIp: (id: Id, body: IpPoolRemoveIpRequest, options?: RequestOptions) =>
      this.request<IpPool>("POST", `/api/v1/ip_pools/${id}/remove_ip`, { body, options }),
    attach: (id: Id, body: IpPoolClusterRequest, options?: RequestOptions) =>
      this.request<IpPool>("POST", `/api/v1/ip_pools/${id}/attach`, { body, options }),
    detach: (id: Id, body: IpPoolClusterRequest, options?: RequestOptions) =>
      this.request<IpPool>("POST", `/api/v1/ip_pools/${id}/detach`, { body, options }),
  };

  readonly sendingDomains = {
    list: (options?: RequestOptions) =>
      this.request<SendingDomain[]>("GET", "/sending_domains", { team: true, options }),
    get: (id: Id, options?: RequestOptions) =>
      this.request<SendingDomain>("GET", `/api/v1/sending_domains/${id}`, { options }),
    create: (body: CreateSendingDomainRequest, options?: RequestOptions) =>
      this.request<SendingDomain>("POST", "/sending_domains", { body, team: true, options }),
    update: (id: Id, body: UpdateSendingDomainRequest, options?: RequestOptions) =>
      this.request<SendingDomain>("PATCH", `/api/v1/sending_domains/${id}`, { body, options }),
    refresh: (id: Id, options?: RequestOptions) =>
      this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/refresh`, { options }),
    verify: (id: Id, options?: RequestOptions) =>
      this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/verify`, { options }),
    suspend: (id: Id, options?: RequestOptions) =>
      this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/suspend`, { options }),
    resume: (id: Id, options?: RequestOptions) =>
      this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/resume`, { options }),
    makePrimary: (id: Id, options?: RequestOptions) =>
      this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/make_primary`, { options }),
    flushQueue: (id: Id, options?: RequestOptions) =>
      this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/flush_queue`, { options }),
    move: (id: Id, body: MoveSendingDomainRequest, options?: RequestOptions) =>
      this.request<SendingDomain>("POST", `/api/v1/sending_domains/${id}/move`, { body, options }),
    delete: (id: Id, options?: RequestOptions) =>
      this.request<Empty>("DELETE", `/api/v1/sending_domains/${id}`, { options }),
  };

  readonly tenants = {
    list: (options?: RequestOptions) => this.request<Tenant[]>("GET", "/tenants", { team: true, options }),
    get: (id: Id, options?: RequestOptions) => this.request<Tenant>("GET", `/api/v1/tenants/${id}`, { options }),
    create: (body: CreateTenantRequest, options?: RequestOptions) =>
      this.request<Tenant>("POST", "/tenants", { body, team: true, options }),
    update: (id: Id, body: UpdateTenantRequest, options?: RequestOptions) =>
      this.request<Tenant>("PATCH", `/api/v1/tenants/${id}`, { body, options }),
    delete: (id: Id, options: DeleteTenantOptions & RequestOptions = {}) => {
      const { destination_tenant_id, ...rest } = options;
      return this.request<Empty>("DELETE", `/api/v1/tenants/${id}`, { query: { destination_tenant_id }, options: rest });
    },
  };

  readonly inboxes = {
    list: (options?: RequestOptions) => this.request<Inbox[]>("GET", "/inboxes", { team: true, options }),
    get: (id: Id, options?: RequestOptions) => this.request<Inbox>("GET", `/api/v1/inboxes/${id}`, { options }),
    create: (body: CreateInboxRequest, options?: RequestOptions) =>
      this.request<Inbox>("POST", "/inboxes", { body, team: true, options }),
    update: (id: Id, body: UpdateInboxRequest, options?: RequestOptions) =>
      this.request<Inbox>("PATCH", `/api/v1/inboxes/${id}`, { body, options }),
    verify: (id: Id, options?: RequestOptions) =>
      this.request<Inbox>("POST", `/api/v1/inboxes/${id}/verify`, { options }),
    delete: (id: Id, options?: RequestOptions) => this.request<Inbox>("DELETE", `/api/v1/inboxes/${id}`, { options }),
  };

  readonly messages = {
    list: (inboxId: Id, options?: RequestOptions) =>
      this.request<InboundMessage[]>("GET", `/api/v1/inboxes/${inboxId}/inbound_messages`, { options }),
    get: (inboxId: Id, id: Id, options?: RequestOptions) =>
      this.request<InboundMessage>("GET", `/api/v1/inboxes/${inboxId}/inbound_messages/${id}`, { options }),
    downloadAttachment: (inboxId: Id, id: Id, index: number, options?: RequestOptions) =>
      this.request<ArrayBuffer>("GET", `/api/v1/inboxes/${inboxId}/inbound_messages/${id}/attachments/${index}`, {
        binary: true,
        options,
      }),
  };

  readonly events = {
    listTeam: (query?: TeamEventQuery, options?: RequestOptions) =>
      this.request<MessageEvent[]>("GET", "/message_events", { query, team: true, options }),
    list: (clusterId: Id, query?: EventQuery, options?: RequestOptions) =>
      this.request<MessageEvent[]>("GET", `/clusters/${clusterId}/message_events`, { query, team: true, options }),
    get: (id: Id, options?: RequestOptions) =>
      this.request<MessageEvent>("GET", `/api/v1/message_events/${id}`, { options }),
  };

  readonly smtpCredentials = {
    create: (clusterId: Id, body: CreateSmtpCredentialRequest, options?: RequestOptions) =>
      this.request<SmtpCredential>("POST", `/clusters/${clusterId}/smtp_credentials`, { body, team: true, options }),
    delete: (clusterId: Id, id: Id, options?: RequestOptions) =>
      this.request<SmtpCredential>("DELETE", `/clusters/${clusterId}/smtp_credentials/${id}`, { team: true, options }),
  };

  readonly webhooks = {
    list: (options?: RequestOptions) =>
      this.request<WebhookEndpoint[]>("GET", "/webhook_endpoints", { team: true, options }),
    get: (id: Id, options?: RequestOptions) =>
      this.request<WebhookEndpoint>("GET", `/api/v1/webhook_endpoints/${id}`, { options }),
    create: (body: CreateWebhookEndpointRequest, options?: RequestOptions) =>
      this.request<WebhookEndpoint>("POST", "/webhook_endpoints", { body, team: true, options }),
    update: (id: Id, body: UpdateWebhookEndpointRequest, options?: RequestOptions) =>
      this.request<WebhookEndpoint>("PATCH", `/api/v1/webhook_endpoints/${id}`, { body, options }),
    delete: (id: Id, options?: RequestOptions) =>
      this.request<Empty>("DELETE", `/api/v1/webhook_endpoints/${id}`, { options }),
    /** Sends one signed test event to the endpoint now and returns the endpoint's reply code. */
    sendTest: (id: Id, options?: RequestOptions) =>
      this.request<WebhookTestResult>("POST", `/api/v1/webhook_endpoints/${id}/send_test`, { options }),
    verify: (rawBody: string, timestamp: string, signature: string, secret: string) =>
      verifySignature(rawBody, timestamp, signature, secret),
  };

  readonly templates = {
    list: (options?: RequestOptions) => this.request<EmailTemplate[]>("GET", "/templates", { team: true, options }),
    get: (id: Id, options?: RequestOptions) =>
      this.request<EmailTemplate>("GET", `/api/v1/templates/${id}`, { options }),
    create: (body: CreateTemplateRequest, options?: RequestOptions) =>
      this.request<EmailTemplate>("POST", "/templates", { body, team: true, options }),
    update: (id: Id, body: UpdateTemplateRequest, options?: RequestOptions) =>
      this.request<EmailTemplate>("PATCH", `/api/v1/templates/${id}`, { body, options }),
    publish: (id: Id, options?: RequestOptions) =>
      this.request<EmailTemplate>("POST", `/api/v1/templates/${id}/publish`, { options }),
    duplicate: (id: Id, options?: RequestOptions) =>
      this.request<EmailTemplate>("POST", `/api/v1/templates/${id}/duplicate`, { options }),
    delete: (id: Id, options?: RequestOptions) => this.request<Empty>("DELETE", `/api/v1/templates/${id}`, { options }),
  };

  readonly suppressions = {
    list: (query?: SuppressionQuery, options?: RequestOptions) =>
      this.request<Suppression[]>("GET", "/suppressions", { query, team: true, options }),
    create: (body: CreateSuppressionRequest, options?: RequestOptions) =>
      this.request<Suppression>("POST", "/suppressions", { body, team: true, options }),
    import: (body: ImportSuppressionsRequest, options?: RequestOptions) =>
      this.request<SuppressionImport>("POST", "/suppressions/import", { body, team: true, options }),
    /** Deletes up to one batch of matching rows. Call again while `more` is `true`. */
    bulkDelete: (body: BulkDeleteSuppressionsRequest, options?: RequestOptions) =>
      this.request<SuppressionBulkDelete>("POST", "/suppressions/bulk_delete", { body, team: true, options }),
    delete: (id: Id, options?: RequestOptions) =>
      this.request<Empty>("DELETE", `/api/v1/suppressions/${id}`, { options }),
  };

  readonly firewall = {
    get: (options?: RequestOptions) => this.request<Firewall>("GET", "/firewall", { team: true, options }),
    update: (body: UpdateFirewallRequest, options?: RequestOptions) =>
      this.request<Firewall>("PATCH", "/firewall", { body, team: true, options }),
    addEntry: (body: CreateFirewallEntryRequest, options?: RequestOptions) =>
      this.request<FirewallEntry>("POST", "/firewall_entries", { body, team: true, options }),
    deleteEntry: (id: Id, options?: RequestOptions) =>
      this.request<Empty>("DELETE", `/api/v1/firewall_entries/${id}`, { options }),
  };

  readonly outboundMessages = {
    list: (query?: OutboundMessageQuery, options?: RequestOptions) =>
      this.request<OutboundMessage[]>("GET", "/outbound_messages", { query, team: true, options }),
    get: (id: Id, options?: RequestOptions) =>
      this.request<OutboundMessage>("GET", `/api/v1/outbound_messages/${id}`, { options }),
    /** The stored message as raw MIME bytes. */
    raw: (id: Id, options?: RequestOptions) =>
      this.request<ArrayBuffer>("GET", `/api/v1/outbound_messages/${id}/raw`, { binary: true, options }),
    downloadAttachment: (id: Id, index: number, options?: RequestOptions) =>
      this.request<ArrayBuffer>("GET", `/api/v1/outbound_messages/${id}/attachments/${index}`, { binary: true, options }),
  };

  readonly outboundRetention = {
    get: (options?: RequestOptions) =>
      this.request<OutboundRetention>("GET", "/outbound_retention", { team: true, options }),
    update: (body: UpdateOutboundRetentionRequest, options?: RequestOptions) =>
      this.request<OutboundRetention>("PATCH", "/outbound_retention", { body, team: true, options }),
  };

  readonly dkimSigning = {
    get: (options?: RequestOptions) => this.request<DkimSigning>("GET", "/dkim_signing", { team: true, options }),
    update: (body: UpdateDkimSigningRequest, options?: RequestOptions) =>
      this.request<DkimSigning>("PATCH", "/dkim_signing", { body, team: true, options }),
  };

  readonly recipients = {
    /** What the platform knows about one address: suppressions, firewall result and recent sends. */
    get: (email: string, options?: RequestOptions) =>
      this.request<Recipient>("GET", "/recipients", { query: { email }, team: true, options }),
  };

  readonly analytics = {
    get: (query?: AnalyticsQuery, options?: RequestOptions) =>
      this.request<Analytics>("GET", "/analytics", { query, team: true, options }),
  };

  readonly status = {
    get: (options?: RequestOptions) => this.request<TeamStatus>("GET", "/status", { team: true, options }),
  };

  readonly shieldSites = {
    list: (options?: RequestOptions) => this.request<ShieldSite[]>("GET", "/shield_sites", { team: true, options }),
    get: (id: Id, options?: RequestOptions) =>
      this.request<ShieldSite>("GET", `/api/v1/shield_sites/${id}`, { options }),
    create: (body: CreateShieldSiteRequest, options?: RequestOptions) =>
      this.request<ShieldSite>("POST", "/shield_sites", { body, team: true, options }),
    update: (id: Id, body: UpdateShieldSiteRequest, options?: RequestOptions) =>
      this.request<ShieldSite>("PATCH", `/api/v1/shield_sites/${id}`, { body, options }),
    delete: (id: Id, options?: RequestOptions) =>
      this.request<Empty>("DELETE", `/api/v1/shield_sites/${id}`, { options }),
    rotateSecret: (id: Id, options?: RequestOptions) =>
      this.request<ShieldSite>("POST", `/api/v1/shield_sites/${id}/rotate_secret`, { options }),
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
