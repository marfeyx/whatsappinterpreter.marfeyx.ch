import type { Attachment, AttachmentKind, ChatMessage } from "./types";

const textExtensions = new Set([".txt"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".bmp"]);
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".3gp", ".avi", ".webm"]);
const audioExtensions = new Set([".opus", ".ogg", ".mp3", ".m4a", ".aac", ".wav", ".amr"]);
const documentExtensions = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".vcf"]);
const matchableMediaExtensions = new Set([
  ...imageExtensions,
  ...videoExtensions,
  ...audioExtensions,
  ...documentExtensions,
]);

const mediaExtensionPattern = Array.from(matchableMediaExtensions)
  .map((extension) => extension.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const explicitAttachmentPattern = /<(?:attached|attachment|anhang|media|medium):\s*([^>]+)>/gi;
const looseAttachmentPattern = new RegExp(
  String.raw`[\p{L}\p{N}_@+.'()[\] -]{1,180}\.(?:${mediaExtensionPattern})`,
  "giu",
);

const messagePatterns = [
  /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]\s([^:]+?):\s([\s\S]*)$/i,
  /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\s-\s([^:]+?):\s([\s\S]*)$/i,
];

const systemPatterns = [
  /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]\s([\s\S]*)$/i,
  /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\s-\s([\s\S]*)$/i,
];

export function isTextFile(path: string): boolean {
  return textExtensions.has(getExtension(path));
}

export function parseChatText(text: string, attachments: Attachment[]): ChatMessage[] {
  const byName = new Map(attachments.map((attachment) => [attachment.name.toLowerCase(), attachment]));
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const messages: ChatMessage[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const parsed = parseLineStart(line);
    if (parsed) {
      messages.push(createMessage(messages.length, parsed.timestamp, parsed.sender, parsed.text));
      continue;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      lastMessage.text = `${lastMessage.text}\n${line}`;
    }
  }

  for (const message of messages) {
    message.attachments = findAttachments(message.text, byName);
    refreshDerivedMessageFields(message);
  }

  return messages;
}

export function pickChatTextFile(paths: string[]): string | null {
  const textFiles = paths.filter(isTextFile);
  return (
    textFiles.find((path) => getBaseName(path).toLowerCase() === "_chat.txt") ??
    textFiles.find((path) => /chat/i.test(getBaseName(path))) ??
    textFiles[0] ??
    null
  );
}

export function getAttachmentKind(path: string, mime: string): AttachmentKind {
  const extension = getExtension(path);
  if (mime.startsWith("image/") || imageExtensions.has(extension)) return "image";
  if (mime.startsWith("video/") || videoExtensions.has(extension)) return "video";
  if (mime.startsWith("audio/") || audioExtensions.has(extension)) return "audio";
  if (extension) return "document";
  return "unknown";
}

export function getMimeType(path: string, fallback = ""): string {
  const extension = getExtension(path);
  const known: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".bmp": "image/bmp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/mp4",
    ".3gp": "video/3gpp",
    ".webm": "video/webm",
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
    ".amr": "audio/amr",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".vcf": "text/vcard",
  };
  return known[extension] ?? fallback ?? "application/octet-stream";
}

export function getExtension(path: string): string {
  const name = getBaseName(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function getBaseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function cleanMessageText(text: string): string {
  return text
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/<(attached|attachment|anhang|media|medium):\s*[^>]*>/gi, "")
    .replace(/<(attached|attachment|anhang|media|medium)\s+omitted>/gi, "")
    .replace(/\b(media omitted|bild weggelassen|video weggelassen|audio weggelassen|anhang weggelassen)\b/gi, "")
    .replace(
      /\b[\w(). -]+\.(jpe?g|png|gif|webp|heic|bmp|mp4|mov|m4v|3gp|webm|opus|ogg|mp3|m4a|aac|wav|amr|pdf|docx?|xlsx?|pptx?)\b/gi,
      "",
    )
    .replace(/This message was deleted/gi, "This message was deleted")
    .trim();
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)?/gu)?.length ?? 0;
}

export function isHiddenWhatsAppNoticeText(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    normalized.includes("nachrichten und anrufe sind ende zu ende verschlusselt") ||
    normalized.includes("nur personen in diesem chat konnen sie lesen anhore") ||
    normalized.includes("messages and calls are end to end encrypted") ||
    normalized.includes("no one outside of this chat not even whatsapp can read or listen")
  );
}

export function getDateKey(date: Date | null): string {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createMessage(index: number, timestamp: Date | null, sender: string | null, text: string): ChatMessage {
  const message: ChatMessage = {
    id: `m-${index}`,
    timestamp,
    sender,
    text,
    isSystem: !sender,
    attachments: [],
    dateKey: getDateKey(timestamp),
    hasRenderableText: false,
    isHiddenNotice: false,
    wordCount: 0,
  };

  refreshDerivedMessageFields(message);
  return message;
}

function refreshDerivedMessageFields(message: ChatMessage) {
  const visibleText = cleanMessageText(message.text);
  message.hasRenderableText = Boolean(visibleText);
  message.isHiddenNotice = isHiddenWhatsAppNoticeText(message.text);
  message.wordCount = message.sender && !message.isSystem ? countWords(visibleText) : 0;
}

function parseLineStart(line: string): { timestamp: Date | null; sender: string | null; text: string } | null {
  const cleanedLine = cleanInvisible(line).trimStart();

  for (const pattern of messagePatterns) {
    const match = cleanedLine.match(pattern);
    if (match) {
      return {
        timestamp: buildDate(match[1], match[2], match[3], match[4], match[5], match[6], match[7]),
        sender: cleanInvisible(match[8]).trim(),
        text: cleanInvisible(match[9]).trim(),
      };
    }
  }

  for (const pattern of systemPatterns) {
    const match = cleanedLine.match(pattern);
    if (match) {
      return {
        timestamp: buildDate(match[1], match[2], match[3], match[4], match[5], match[6], match[7]),
        sender: null,
        text: cleanInvisible(match[8]).trim(),
      };
    }
  }

  return null;
}

function buildDate(
  dayText: string,
  monthText: string,
  yearText: string,
  hourText: string,
  minuteText: string,
  secondText = "0",
  meridiem?: string,
): Date | null {
  let year = Number(yearText);
  let hour = Number(hourText);

  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

  if (meridiem) {
    const upper = meridiem.toUpperCase();
    if (upper === "PM" && hour < 12) hour += 12;
    if (upper === "AM" && hour === 12) hour = 0;
  }

  const date = new Date(
    year,
    Number(monthText) - 1,
    Number(dayText),
    hour,
    Number(minuteText),
    Number(secondText || "0"),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function findAttachments(text: string, byName: Map<string, Attachment>): Attachment[] {
  const matches = new Map<string, Attachment>();

  for (const reference of extractAttachmentReferences(text)) {
    const attachment = byName.get(reference);
    if (attachment) {
      matches.set(attachment.path, attachment);
    }
  }

  return Array.from(matches.values());
}

function extractAttachmentReferences(text: string): string[] {
  const references = new Set<string>();

  for (const match of text.matchAll(explicitAttachmentPattern)) {
    addAttachmentReference(references, match[1]);
  }

  for (const match of text.matchAll(looseAttachmentPattern)) {
    addAttachmentReference(references, match[0]);
  }

  return Array.from(references);
}

function addAttachmentReference(references: Set<string>, value: string) {
  const normalized = normalizeAttachmentReference(value);
  if (normalized) {
    references.add(normalized);
  }
}

function normalizeAttachmentReference(value: string): string {
  const cleaned = cleanInvisible(value)
    .replace(/^<\s*(attached|attachment|anhang|media|medium):\s*/i, "")
    .replace(/>$/g, "")
    .replace(/\s+\((file attached|attached|media omitted|anhang)\)$/i, "")
    .trim()
    .toLowerCase();

  return getBaseName(cleaned);
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00df/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim();
}

function cleanInvisible(value: string): string {
  return value.replace(/[\u200e\u200f\u202a-\u202e]/g, "");
}
