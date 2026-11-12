import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  BoostClusterRequest,
  Cluster,
  CreateClusterRequest,
  CreateFirewallEntryRequest,
  CreateInboxRequest,
  CreateSendingDomainRequest,
  CreateSmtpCredentialRequest,
  CreateSuppressionRequest,
  CreateTemplateRequest,
  CreateTenantRequest,
  CreateWebhookEndpointRequest,
  EmailTemplate,
  Empty,
  ErrorBody,
  ExtendBoostRequest,
  Firewall,
  FirewallEntry,
  Id,
  ImportSuppressionsRequest,
  InboundMessage,
  Inbox,
  MessageEvent,
  NetworkAssignRequest,
  NetworkClusterRequest,
  NetworkCreateRequest,
  NetworkIp,
  NetworkReleaseRequest,
  SendEmailRequest,
  SendEmailResponse,
  SendingDomain,
  SmtpCredential,
  Suppression,
  SuppressionImport,
  Tenant,
  UpdateClusterRequest,
  UpdateFirewallRequest,
  UpdateSendingDomainRequest,
  UpdateTemplateRequest,
  UpdateWebhookEndpointRequest,
  User,
  WebhookEndpoint,
} from "./types.js";

export type * from "./types.js";

export type PostShibaOptions = {
  baseUrl?: string;
  teamId?: Id;
};

export type SendOptions = {
  clusterId?: Id;
};

export type ClusterSendOptions = {
  idempotencyKey?: string;
  sandbox?: boolean;
};

export class PostShibaError extends Error {
  readonly error: string;
  readonly field: string | null;

  constructor(attrs: { error?: string; field?: string | null; message?: string }) {
    super(attrs.message ?? attrs.error ?? "Request failed");
    this.name = "PostShibaError";
    this.error = attrs.error ?? "error";
    this.field = attrs.field ?? null;
  }
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

  constructor(apiKey: string, options: PostShibaOptions = {}) {
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? "https://app.postshiba.com").replace(/\/$/, "");
    this.teamId = options.teamId;
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
    opts: { body?: unknown; headers?: Record<string, string>; binary?: boolean; team?: boolean } = {},
  ): Promise<T> {
    const resolved = opts.team ? `/api/v1/teams/${this.requireTeamId()}${path}` : path;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      ...opts.headers,
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(`${this.baseUrl}${resolved}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

    if (!res.ok) {
      const payload = asErrorPayload(parseJson(await res.text()));
      throw new PostShibaError({
        error: payload.error,
        field: payload.field ?? null,
        message: payload.message,
      });
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
  };

  readonly network = {
    list: () => this.request<NetworkIp[]>("GET", "/network", { team: true }),
    create: (body: NetworkCreateRequest) => this.request<NetworkIp>("POST", "/network", { body, team: true }),
    assign: (body: NetworkAssignRequest) => this.request<NetworkIp>("POST", "/network/assign", { body, team: true }),
    unassign: (body: NetworkClusterRequest) => this.request<NetworkIp>("POST", "/network/unassign", { body, team: true }),
    switch: (body: NetworkClusterRequest) => this.request<NetworkIp>("POST", "/network/switch", { body, team: true }),
    release: (body: NetworkReleaseRequest) => this.request<NetworkIp>("POST", "/network/release", { body, team: true }),
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
    delete: (id: Id) => this.request<Empty>("DELETE", `/api/v1/sending_domains/${id}`),
  };

  readonly tenants = {
    list: () => this.request<Tenant[]>("GET", "/tenants", { team: true }),
    get: (id: Id) => this.request<Tenant>("GET", `/api/v1/tenants/${id}`),
    create: (body: CreateTenantRequest) => this.request<Tenant>("POST", "/tenants", { body, team: true }),
    delete: (id: Id) => this.request<Empty>("DELETE", `/api/v1/tenants/${id}`),
  };

  readonly inboxes = {
    list: () => this.request<Inbox[]>("GET", "/inboxes", { team: true }),
    get: (id: Id) => this.request<Inbox>("GET", `/api/v1/inboxes/${id}`),
    create: (body: CreateInboxRequest) => this.request<Inbox>("POST", "/inboxes", { body, team: true }),
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
    listTeam: () => this.request<MessageEvent[]>("GET", "/message_events", { team: true }),
    list: (clusterId: Id) => this.request<MessageEvent[]>("GET", `/clusters/${clusterId}/message_events`, { team: true }),
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
    list: () => this.request<Suppression[]>("GET", "/suppressions", { team: true }),
    create: (body: CreateSuppressionRequest) => this.request<Suppression>("POST", "/suppressions", { body, team: true }),
    import: (body: ImportSuppressionsRequest) => this.request<SuppressionImport>("POST", "/suppressions/import", { body, team: true }),
    delete: (id: Id) => this.request<Empty>("DELETE", `/api/v1/suppressions/${id}`),
  };

  readonly firewall = {
    get: () => this.request<Firewall>("GET", "/firewall", { team: true }),
    update: (body: UpdateFirewallRequest) => this.request<Firewall>("PATCH", "/firewall", { body, team: true }),
    addEntry: (body: CreateFirewallEntryRequest) => this.request<FirewallEntry>("POST", "/firewall_entries", { body, team: true }),
    deleteEntry: (id: Id) => this.request<Empty>("DELETE", `/api/v1/firewall_entries/${id}`),
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
