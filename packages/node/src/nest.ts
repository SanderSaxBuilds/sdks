import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { PostShiba } from "./index.js";
import type { PostShibaOptions, SendEmailRequest } from "./index.js";

export { PostShiba, PostShibaError, PostShibaTimeoutError } from "./index.js";
export type { Id, Json, PostShibaOptions } from "./index.js";

export const POSTSHIBA = "POSTSHIBA";

export type MailFields = {
  to: string | string[];
  from: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: unknown[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  headers?: Record<string, string>;
  uniqueArgs?: Record<string, unknown>;
};

function asList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function uniqueArgsFromHeaders(headers: Record<string, string>): Record<string, unknown> | undefined {
  const key = Object.keys(headers).find((name) => name.toLowerCase() === "x-capsule-unique-args");
  if (!key) {
    return undefined;
  }
  const raw = headers[key];
  delete headers[key];
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function sendMail(client: PostShiba, mail: MailFields) {
  const body: SendEmailRequest = {
    from: mail.from,
    to: asList(mail.to),
    subject: mail.subject,
  };
  if (mail.html !== undefined) body.html = mail.html;
  if (mail.text !== undefined) body.text = mail.text;
  if (mail.attachments !== undefined) body.attachments = mail.attachments as SendEmailRequest["attachments"];
  if (mail.cc !== undefined) body.cc = asList(mail.cc);
  if (mail.bcc !== undefined) body.bcc = asList(mail.bcc);
  if (mail.replyTo) body.reply_to = mail.replyTo;

  const headers = mail.headers ? { ...mail.headers } : {};
  const fromHeader = uniqueArgsFromHeaders(headers);
  if (Object.keys(headers).length > 0) body.headers = headers;
  if (fromHeader) body.unique_args = fromHeader;
  if (mail.uniqueArgs && Object.keys(mail.uniqueArgs).length > 0) {
    body.unique_args = mail.uniqueArgs;
  }

  return client.emails.send(body);
}

@Module({})
export class PostShibaModule {
  static register(options: { apiKey: string } & PostShibaOptions): DynamicModule {
    return {
      module: PostShibaModule,
      providers: [
        {
          provide: POSTSHIBA,
          useValue: new PostShiba(options.apiKey, options),
        },
      ],
      exports: [POSTSHIBA],
    };
  }
}
