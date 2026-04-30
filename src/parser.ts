import JSZip from "jszip";
import type { Attachment, AttachmentKind, ChatMessage, ParsedChat } from "./types";

const textExtensions = new Set([".txt"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".bmp"]);
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".3gp", ".avi", ".webm"]);
const audioExtensions = new Set([".opus", ".ogg", ".mp3", ".m4a", ".aac", ".wav", ".amr"]);

const messagePatterns = [
  /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]\s([^:]+?):\s([\s\S]*)$/i,
  /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\s-\s([^:]+?):\s([\s\S]*)$/i,
];

const systemPatterns = [
  /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]\s([\s\S]*)$/i,
  /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\s-\s([\s\S]*)$/i,
];

export async function parseWhatsAppZip(file: File): Promise<ParsedChat> {
  const zip = await JSZip.loadAsync(file);
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  const textFile = pickChatTextFile(files.map((entry) => entry.name));

  if (!textFile) {
    throw new Error("No WhatsApp chat .txt file was found in this ZIP.");
  }

  const mediaEntries = files.filter((entry) => !textExtensions.has(getExtension(entry.name)));
  const attachments = await Promise.all(
    mediaEntries.map(async (entry) => {
      const blob = await entry.async("blob");
      const mime = getMimeType(entry.name, blob.type);
      return {
        name: getBaseName(entry.name),
        path: entry.name,
        url: URL.createObjectURL(new Blob([blob], { type: mime })),
        mime,
        kind: getAttachmentKind(entry.name, mime),
        size: blob.size,
      } satisfies Attachment;
    }),
  );

  const text = await zip.file(textFile)!.async("string");
  const messages = parseChatText(text, attachments);
  const participants = Array.from(
    new Set(messages.map((message) => message.sender).filter((sender): sender is string => Boolean(sender))),
  ).sort((a, b) => a.localeCompare(b));

  return {
    sourceName: file.name,
    messages,
    participants,
    attachments,
  };
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
      messages.push({
        id: `m-${messages.length}`,
        timestamp: parsed.timestamp,
        sender: parsed.sender,
        text: parsed.text,
        isSystem: !parsed.sender,
        attachments: [],
      });
      continue;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      lastMessage.text = `${lastMessage.text}\n${line}`;
    }
  }

  for (const message of messages) {
    message.attachments = findAttachments(message.text, byName);
  }

  return messages;
}

function pickChatTextFile(paths: string[]): string | null {
  const textFiles = paths.filter((path) => textExtensions.has(getExtension(path)));
  return (
    textFiles.find((path) => getBaseName(path).toLowerCase() === "_chat.txt") ??
    textFiles.find((path) => /chat/i.test(getBaseName(path))) ??
    textFiles[0] ??
    null
  );
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
  const lowerText = text.toLowerCase();

  for (const [name, attachment] of byName) {
    if (lowerText.includes(name)) {
      matches.set(attachment.path, attachment);
    }
  }

  const explicit = text.match(/<attached:\s*([^>]+)>/gi) ?? [];
  for (const token of explicit) {
    const name = token.replace(/<attached:\s*/i, "").replace(/>$/, "").trim().toLowerCase();
    const attachment = byName.get(name);
    if (attachment) {
      matches.set(attachment.path, attachment);
    }
  }

  return Array.from(matches.values());
}

function getAttachmentKind(path: string, mime: string): AttachmentKind {
  const extension = getExtension(path);
  if (mime.startsWith("image/") || imageExtensions.has(extension)) return "image";
  if (mime.startsWith("video/") || videoExtensions.has(extension)) return "video";
  if (mime.startsWith("audio/") || audioExtensions.has(extension)) return "audio";
  if (extension) return "document";
  return "unknown";
}

function getMimeType(path: string, fallback: string): string {
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
  };
  return known[extension] ?? fallback ?? "application/octet-stream";
}

function getExtension(path: string): string {
  const name = getBaseName(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function getBaseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function cleanInvisible(value: string): string {
  return value.replace(/[\u200e\u200f\u202a-\u202e]/g, "");
}
