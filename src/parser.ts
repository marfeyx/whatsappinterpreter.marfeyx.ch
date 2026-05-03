import type { Attachment, LoadedAttachmentUrl, ParsedChat } from "./types";

type ParseResult = {
  type: "parse-result";
  id: number;
  chat: ParsedChat;
};

type AttachmentResult = {
  type: "attachment-result";
  id: number;
  archiveId: number;
  path: string;
  blob: Blob;
  size: number;
};

type ClearResult = {
  type: "clear-result";
  id: number;
};

type WorkerError = {
  type: "error";
  id: number;
  message: string;
};

type WorkerResponse = ParseResult | AttachmentResult | ClearResult | WorkerError;

type PendingRequest<T> = {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest<unknown>>();

export async function parseWhatsAppZip(file: File): Promise<ParsedChat> {
  const result = await sendWorkerRequest<ParseResult>((id) => ({
    type: "parse",
    id,
    file,
  }));
  return result.chat;
}

export async function loadAttachmentUrl(attachment: Attachment): Promise<LoadedAttachmentUrl> {
  const result = await sendWorkerRequest<AttachmentResult>((id) => ({
    type: "load-attachment",
    id,
    archiveId: attachment.archiveId,
    path: attachment.path,
  }));
  const blob = result.blob.type === attachment.mime ? result.blob : result.blob.slice(0, result.blob.size, attachment.mime);

  return {
    url: URL.createObjectURL(blob),
    size: result.size || attachment.size,
  };
}

export function clearZipParser() {
  if (!worker) return;

  void sendWorkerRequest<ClearResult>((id) => ({
    type: "clear",
    id,
  })).catch(() => undefined);
}

export function terminateZipParser() {
  if (!worker) return;

  worker.terminate();
  worker = null;

  for (const request of pendingRequests.values()) {
    request.reject(new Error("ZIP parsing was cancelled."));
  }
  pendingRequests.clear();
}

function sendWorkerRequest<T>(createMessage: (id: number) => object): Promise<T> {
  const activeWorker = getWorker();
  const id = nextRequestId++;

  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    activeWorker.postMessage(createMessage(id));
  });
}

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("./zipParser.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (event) => {
    const error = new Error(event.message || "The ZIP worker crashed.");
    for (const request of pendingRequests.values()) {
      request.reject(error);
    }
    pendingRequests.clear();
    terminateZipParser();
  };

  return worker;
}

function handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
  const response = event.data;
  const request = pendingRequests.get(response.id);
  if (!request) return;

  pendingRequests.delete(response.id);

  if (response.type === "error") {
    request.reject(new Error(response.message));
    return;
  }

  request.resolve(response);
}
