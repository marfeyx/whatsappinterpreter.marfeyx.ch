import JSZip from "jszip";
import {
  getAttachmentKind,
  getBaseName,
  getMimeType,
  isTextFile,
  parseChatText,
  pickChatTextFile,
} from "./parserCore";
import type { Attachment, ParsedChat } from "./types";

type ParseRequest = {
  type: "parse";
  id: number;
  file: File;
};

type AttachmentRequest = {
  type: "load-attachment";
  id: number;
  archiveId: number;
  path: string;
};

type ClearRequest = {
  type: "clear";
  id: number;
};

type WorkerRequest = ParseRequest | AttachmentRequest | ClearRequest;

type ZipEntryWithSize = {
  _data?: {
    uncompressedSize?: number;
  };
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

let currentZip: JSZip | null = null;
let currentArchiveId = 0;
let nextArchiveId = 0;

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleMessage(event.data);
};

async function handleMessage(request: WorkerRequest) {
  try {
    if (request.type === "parse") {
      const archiveId = nextArchiveId + 1;
      const { chat, zip } = await parseZipFile(request.file, archiveId);

      currentZip = zip;
      currentArchiveId = archiveId;
      nextArchiveId = archiveId;

      workerScope.postMessage({ type: "parse-result", id: request.id, chat });
      return;
    }

    if (request.type === "load-attachment") {
      const blob = await loadAttachmentBlob(request.archiveId, request.path);
      workerScope.postMessage({
        type: "attachment-result",
        id: request.id,
        archiveId: request.archiveId,
        path: request.path,
        blob,
        size: blob.size,
      });
      return;
    }

    currentZip = null;
    currentArchiveId = 0;
    workerScope.postMessage({ type: "clear-result", id: request.id });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : "The ZIP could not be processed.",
    });
  }
}

async function parseZipFile(file: File, archiveId: number): Promise<{ chat: ParsedChat; zip: JSZip }> {
  const zip = await JSZip.loadAsync(file);
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  const textFile = pickChatTextFile(files.map((entry) => entry.name));

  if (!textFile) {
    throw new Error("No WhatsApp chat .txt file was found in this ZIP.");
  }

  const attachments = files
    .filter((entry) => !isTextFile(entry.name))
    .map((entry) => {
      const mime = getMimeType(entry.name);
      return {
        archiveId,
        name: getBaseName(entry.name),
        path: entry.name,
        mime,
        kind: getAttachmentKind(entry.name, mime),
        size: getZipEntrySize(entry),
      } satisfies Attachment;
    });

  const text = await zip.file(textFile)!.async("string");
  const messages = parseChatText(text, attachments);
  const participants = Array.from(
    new Set(messages.map((message) => message.sender).filter((sender): sender is string => Boolean(sender))),
  ).sort((a, b) => a.localeCompare(b));

  return {
    zip,
    chat: {
      archiveId,
      sourceName: file.name,
      messages,
      participants,
      attachments,
    },
  };
}

async function loadAttachmentBlob(archiveId: number, path: string): Promise<Blob> {
  if (!currentZip || archiveId !== currentArchiveId) {
    throw new Error("This attachment belongs to a chat that is no longer loaded.");
  }

  const entry = currentZip.file(path);
  if (!entry) {
    throw new Error("This attachment could not be found in the ZIP.");
  }

  return entry.async("blob");
}

function getZipEntrySize(entry: JSZip.JSZipObject): number {
  const size = (entry as unknown as ZipEntryWithSize)._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : 0;
}
