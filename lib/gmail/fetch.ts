// lib/gmail/fetch.ts
import { getGmailClient } from "./auth";
import type { RawEmail } from "../types";

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function getBody(payload: any): { html: string; text: string } {
  let html = "";
  let text = "";

  function walk(part: any) {
    if (!part) return;
    const mime = part.mimeType || "";
    const data = part.body?.data;

    if (mime === "text/html" && data) html = decodeBase64(data);
    if (mime === "text/plain" && data) text = decodeBase64(data);
    if (part.parts) part.parts.forEach(walk);
  }

  walk(payload);
  return { html, text };
}

export async function fetchUnreadPromoEmails(maxResults = 50): Promise<RawEmail[]> {
  const gmail = getGmailClient();

  // Fetch unread emails in the Promotions category
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread category:promotions",
    maxResults,
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return [];

  const emails: RawEmail[] = [];

  for (const msg of messages) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "full",
    });

    const headers = full.data.payload?.headers || [];
    const get = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

    const { html, text } = getBody(full.data.payload);

    emails.push({
      id: full.data.id!,
      threadId: full.data.threadId!,
      subject: get("Subject"),
      from: get("From"),
      date: get("Date"),
      htmlBody: html,
      textBody: text,
    });

    // Mark as read so we don't re-process it
    await gmail.users.messages.modify({
      userId: "me",
      id: msg.id!,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
  }

  return emails;
}