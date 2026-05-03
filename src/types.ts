export type AttachmentKind = "image" | "video" | "audio" | "document" | "unknown";

export type Attachment = {
  archiveId: number;
  name: string;
  path: string;
  mime: string;
  kind: AttachmentKind;
  size: number;
};

export type ChatMessage = {
  id: string;
  timestamp: Date | null;
  sender: string | null;
  text: string;
  isSystem: boolean;
  attachments: Attachment[];
  dateKey: string;
  hasRenderableText: boolean;
  isHiddenNotice: boolean;
  wordCount: number;
};

export type ParsedChat = {
  archiveId: number;
  sourceName: string;
  messages: ChatMessage[];
  participants: string[];
  attachments: Attachment[];
};

export type LoadedAttachmentUrl = {
  url: string;
  size: number;
};

export type MessageFilter = "all" | "text" | "images" | "media" | "documents" | "system";
