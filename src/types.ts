export type AttachmentKind = "image" | "video" | "audio" | "document" | "unknown";

export type Attachment = {
  name: string;
  path: string;
  url: string;
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
};

export type ParsedChat = {
  sourceName: string;
  messages: ChatMessage[];
  participants: string[];
  attachments: Attachment[];
};

export type MessageFilter = "all" | "text" | "images" | "media" | "documents" | "system";
