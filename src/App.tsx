import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { parseWhatsAppZip } from "./parser";
import type { Attachment, ChatMessage, MessageFilter, ParsedChat } from "./types";

type ParticipantStats = {
  name: string;
  messages: number;
  words: number;
  attachments: number;
};

type ChatStats = {
  participantStats: ParticipantStats[];
  totalParticipantMessages: number;
  totalParticipantWords: number;
  imageCount: number;
  videoCount: number;
  audioCount: number;
  documentCount: number;
  systemCount: number;
};

const filters: Array<{ id: MessageFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "text", label: "Text" },
  { id: "images", label: "Images" },
  { id: "media", label: "Media" },
];

function App() {
  const [chat, setChat] = useState<ParsedChat | null>(null);
  const [myName, setMyName] = useState("");
  const [query, setQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [filter, setFilter] = useState<MessageFilter>("all");
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const previousChat = useRef<ParsedChat | null>(null);

  useEffect(() => {
    return () => revokeAttachmentUrls(previousChat.current);
  }, []);

  useEffect(() => {
    previousChat.current = chat;
  }, [chat]);

  useEffect(() => {
    return () => {
      if (profilePictureUrl) URL.revokeObjectURL(profilePictureUrl);
    };
  }, [profilePictureUrl]);

  const visibleMessages = useMemo(() => {
    if (!chat) return [];
    const search = query.trim().toLowerCase();
    return chat.messages.filter((message) => {
      if (isHiddenWhatsAppNotice(message)) return false;
      if (!matchesFilter(message, filter)) return false;
      if (dateQuery && formatDateInputValue(message.timestamp) !== dateQuery) return false;
      if (!search) return true;
      return (
        message.text.toLowerCase().includes(search) ||
        (message.sender ?? "").toLowerCase().includes(search) ||
        message.attachments.some((attachment) => attachment.name.toLowerCase().includes(search))
      );
    });
  }, [chat, dateQuery, filter, query]);

  const chatStats = useMemo(() => (chat ? getChatStats(chat) : null), [chat]);

  const importedAt = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), [chat]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setError("");

    try {
      const parsed = await parseWhatsAppZip(file);
      revokeAttachmentUrls(chat);
      setChat(parsed);
      setMyName(parsed.participants[0] ?? "");
      setFilter("all");
      setQuery("");
      setDateQuery("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not parse this WhatsApp export.");
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  }

  function handleProfilePictureChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setProfilePictureUrl(URL.createObjectURL(file));
    event.target.value = "";
  }

  function clearChat() {
    revokeAttachmentUrls(chat);
    setChat(null);
    setMyName("");
    setQuery("");
    setDateQuery("");
    setFilter("all");
    setError("");
    setProfilePictureUrl("");
  }

  return (
    <main className="app-shell">
      <section className="control-panel" aria-label="Import controls">
        <div>
          <p className="eyebrow">Local-only viewer</p>
          <h1>WhatsApp Backup Interpreter</h1>
        </div>

        <label className="file-drop">
          <input type="file" accept=".zip,application/zip" onChange={handleFileChange} />
          <span className="file-icon" aria-hidden="true">
            +
          </span>
          <span>{isParsing ? "Reading ZIP locally..." : "Choose WhatsApp export ZIP"}</span>
        </label>

        {error ? <p className="error-message">{error}</p> : null}

        {chat ? (
          <>
            <div className="summary-grid">
              <SummaryTile label="Messages" value={chat.messages.length.toLocaleString()} />
              <SummaryTile label="People" value={chat.participants.length.toLocaleString()} />
              <SummaryTile label="Files" value={chat.attachments.length.toLocaleString()} />
            </div>

            <label className="field">
              <span>My name</span>
              <select value={myName} onChange={(event) => setMyName(event.target.value)}>
                {chat.participants.map((participant) => (
                  <option key={participant} value={participant}>
                    {participant}
                  </option>
                ))}
              </select>
            </label>

            <label className="profile-picker">
              <span>Profile picture</span>
              <input type="file" accept="image/*" onChange={handleProfilePictureChange} />
              <strong>{profilePictureUrl ? "Change picture" : "Choose local image"}</strong>
            </label>

            <label className="field">
              <span>Search</span>
              <input
                type="search"
                placeholder="Find text, sender, or file"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Date</span>
              <div className="date-search">
                <input
                  type="date"
                  value={dateQuery}
                  onChange={(event) => setDateQuery(event.target.value)}
                />
                {dateQuery ? (
                  <button type="button" onClick={() => setDateQuery("")} aria-label="Clear date filter">
                    Clear
                  </button>
                ) : null}
              </div>
            </label>

            <div className="filter-row" aria-label="Message filters">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filter === item.id ? "active" : ""}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

          </>
        ) : (
          <div className="privacy-note">
            <strong>No upload, no cloud processing.</strong>
            <span>
              The ZIP is read by your browser on this device. Imported messages and media are kept in memory only.
            </span>
          </div>
        )}
        <a
          className="issue-link"
          href="mailto:contact.marfeyx@gmail.com?subject=WhatsApp%20Backup%20Interpreter%20Issue"
        >
          <span>Report issues</span>
          <strong>contact.marfeyx@gmail.com</strong>
        </a>
      </section>

      <section className="phone-stage" aria-label="WhatsApp-style preview">
        <div className="phone-frame">
          <div className="phone-status">
            <span className="status-time">{importedAt}</span>
            <span className="dynamic-island" aria-hidden="true" />
          </div>
          <div className="chat-header">
            <button className="back-button" type="button" aria-label="Back">
              <span>‹</span>
            </button>
            <div className="contact-stack">
              <Avatar
                imageUrl={profilePictureUrl}
                fallback={getInitials(chat?.participants.filter((participant) => participant !== myName)[0])}
              />
              <div className="chat-title">
                <strong>{getChatTitle(chat, myName)}</strong>
              </div>
            </div>
          </div>

          <div className="message-list">
            {chat ? (
              <Timeline messages={visibleMessages} myName={myName} />
            ) : (
              <div className="empty-state">
                <div className="empty-lock" aria-hidden="true">
                  lock
                </div>
                <h2>Select a WhatsApp export ZIP</h2>
                <p>The rendered chat will appear here in a mobile WhatsApp-style view.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="details-panel" aria-label="Detailed chat statistics">
        <DetailedStats chat={chat} stats={chatStats} visibleCount={visibleMessages.length} />
      </aside>
    </main>
  );
}

function DetailedStats({
  chat,
  stats,
  visibleCount,
}: {
  chat: ParsedChat | null;
  stats: ChatStats | null;
  visibleCount: number;
}) {
  if (!chat || !stats) {
    return (
      <div className="details-empty">
        <p className="eyebrow">Detailed stats</p>
        <h2>Import a chat to see totals</h2>
        <p>Message counts, word totals, media counts, and participant comparisons will appear here.</p>
      </div>
    );
  }

  const averageWords = stats.totalParticipantMessages
    ? Math.round(stats.totalParticipantWords / stats.totalParticipantMessages)
    : 0;
  const topSender = stats.participantStats[0];
  const topTalker = [...stats.participantStats].sort((a, b) => b.words - a.words)[0];

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Detailed stats</p>
          <h2>Chat breakdown</h2>
        </div>
        <span>{visibleCount.toLocaleString()} shown</span>
      </div>

      <div className="details-grid">
        <SummaryTile label="Words" value={stats.totalParticipantWords.toLocaleString()} />
        <SummaryTile label="Avg words" value={averageWords.toLocaleString()} />
        <SummaryTile label="Images" value={stats.imageCount.toLocaleString()} />
        <SummaryTile label="Videos" value={stats.videoCount.toLocaleString()} />
      </div>

      <div className="highlight-grid">
        <div className="highlight-card">
          <span>Most messages</span>
          <strong>{topSender?.name ?? "None"}</strong>
          <small>{topSender?.messages.toLocaleString() ?? "0"} messages</small>
        </div>
        <div className="highlight-card">
          <span>Most words</span>
          <strong>{topTalker?.name ?? "None"}</strong>
          <small>{topTalker?.words.toLocaleString() ?? "0"} words</small>
        </div>
      </div>

      <section className="stats-panel" aria-label="Participant statistics">
        <div className="section-heading compact">
          <h2>Participants</h2>
          <span>{stats.participantStats.length} people</span>
        </div>
      <div className="stats-list">
        {stats.participantStats.map((stat) => (
          <div className="stat-row" key={stat.name}>
            <div className="stat-title">
              <strong>{stat.name}</strong>
              <span>{stat.attachments.toLocaleString()} files</span>
            </div>
            <StatMeter label="Messages" value={stat.messages} total={stats.totalParticipantMessages} />
            <StatMeter label="Words" value={stat.words} total={stats.totalParticipantWords} />
          </div>
        ))}
      </div>
      </section>
    </>
  );
}

function StatMeter({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="stat-meter">
      <div>
        <span>{label}</span>
        <strong>
          {value.toLocaleString()} · {percent}%
        </strong>
      </div>
      <div className="meter-track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Avatar({ imageUrl, fallback }: { imageUrl: string; fallback: string }) {
  return (
    <div className="avatar">
      {imageUrl ? <img src={imageUrl} alt="Chat profile" /> : <span>{fallback}</span>}
    </div>
  );
}

function Timeline({ messages, myName }: { messages: ChatMessage[]; myName: string }) {
  let lastDay = "";

  if (!messages.length) {
    return <p className="no-results">No messages match the current view.</p>;
  }

  return (
    <>
      {messages.map((message) => {
        const day = formatDay(message.timestamp);
        const showDay = day !== lastDay;
        lastDay = day;

        return (
          <div key={message.id}>
            {showDay ? <div className="day-separator">{day}</div> : null}
            <MessageBubble message={message} outgoing={Boolean(message.sender && message.sender === myName)} />
          </div>
        );
      })}
    </>
  );
}

function MessageBubble({ message, outgoing }: { message: ChatMessage; outgoing: boolean }) {
  if (message.isSystem) {
    return <div className="system-message">{message.text}</div>;
  }

  const visibleText = cleanMessageText(message.text);
  const isSticker = isStickerMessage(message, visibleText);
  const isVoice = isVoiceMessage(message, visibleText);

  return (
    <article className={`message-row ${outgoing ? "outgoing" : "incoming"}`}>
      <div className={`bubble ${isSticker ? "sticker-bubble" : ""} ${isVoice ? "voice-bubble" : ""}`}>
        {!outgoing && !isSticker ? <div className="sender-name">{message.sender}</div> : null}
        {message.attachments.map((attachment) => (
          <AttachmentPreview attachment={attachment} key={attachment.path} />
        ))}
        {visibleText ? <p>{visibleText}</p> : null}
        <time>{formatTime(message.timestamp)}</time>
      </div>
    </article>
  );
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === "image") {
    return <img className="attachment-image" src={attachment.url} alt={attachment.name} loading="lazy" />;
  }

  if (attachment.kind === "video") {
    return <video className="attachment-video" src={attachment.url} controls preload="metadata" />;
  }

  if (attachment.kind === "audio") {
    return (
      <div className="voice-note">
        <div className="voice-play" aria-hidden="true" />
        <div className="voice-wave" aria-hidden="true">
          {Array.from({ length: 22 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        <audio src={attachment.url} controls preload="metadata" />
      </div>
    );
  }

  return (
    <a className="attachment-card" href={attachment.url} target="_blank" rel="noreferrer">
      <span className="attachment-glyph">doc</span>
      <span>
        <strong>{attachment.name}</strong>
        <small>{formatBytes(attachment.size)}</small>
      </span>
    </a>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-tile">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function matchesFilter(message: ChatMessage, filter: MessageFilter): boolean {
  if (filter === "all") return true;
  if (filter === "system") return message.isSystem;
  if (filter === "text") return !message.isSystem && Boolean(cleanMessageText(message.text));
  if (filter === "images") return message.attachments.some((attachment) => attachment.kind === "image");
  if (filter === "media") {
    return message.attachments.some((attachment) => attachment.kind === "image" || attachment.kind === "video" || attachment.kind === "audio");
  }
  if (filter === "documents") {
    return message.attachments.some((attachment) => attachment.kind === "document" || attachment.kind === "unknown");
  }
  return true;
}

function isStickerMessage(message: ChatMessage, visibleText: string): boolean {
  return (
    !visibleText &&
    message.attachments.length > 0 &&
    message.attachments.every(
      (attachment) =>
        attachment.kind === "image" &&
        (attachment.mime === "image/webp" || attachment.name.toLowerCase().endsWith(".webp")),
    )
  );
}

function isVoiceMessage(message: ChatMessage, visibleText: string): boolean {
  return (
    !visibleText &&
    message.attachments.length === 1 &&
    message.attachments[0].kind === "audio"
  );
}

function isHiddenWhatsAppNotice(message: ChatMessage): boolean {
  const normalized = normalizeText(message.text);
  return (
    normalized.includes("nachrichten und anrufe sind ende zu ende verschlusselt") ||
    normalized.includes("nur personen in diesem chat konnen sie lesen anhore") ||
    normalized.includes("messages and calls are end to end encrypted") ||
    normalized.includes("no one outside of this chat not even whatsapp can read or listen")
  );
}

function getChatStats(chat: ParsedChat): ChatStats {
  const meaningfulMessages = chat.messages.filter((message) => !isHiddenWhatsAppNotice(message));
  const participantStats = getParticipantStats(meaningfulMessages);
  const totalParticipantMessages = participantStats.reduce((sum, stat) => sum + stat.messages, 0);
  const totalParticipantWords = participantStats.reduce((sum, stat) => sum + stat.words, 0);

  return {
    participantStats,
    totalParticipantMessages,
    totalParticipantWords,
    imageCount: chat.attachments.filter((attachment) => attachment.kind === "image").length,
    videoCount: chat.attachments.filter((attachment) => attachment.kind === "video").length,
    audioCount: chat.attachments.filter((attachment) => attachment.kind === "audio").length,
    documentCount: chat.attachments.filter(
      (attachment) => attachment.kind === "document" || attachment.kind === "unknown",
    ).length,
    systemCount: meaningfulMessages.filter((message) => message.isSystem).length,
  };
}

function getParticipantStats(messages: ChatMessage[]): ParticipantStats[] {
  const byParticipant = new Map<string, ParticipantStats>();

  for (const message of messages) {
    if (!message.sender || message.isSystem) {
      continue;
    }

    const existing =
      byParticipant.get(message.sender) ??
      ({
        name: message.sender,
        messages: 0,
        words: 0,
        attachments: 0,
      } satisfies ParticipantStats);

    existing.messages += 1;
    existing.words += countWords(cleanMessageText(message.text));
    existing.attachments += message.attachments.length;
    byParticipant.set(message.sender, existing);
  }

  return Array.from(byParticipant.values()).sort((a, b) => b.messages - a.messages || b.words - a.words);
}

function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu)?.length ?? 0;
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim();
}

function revokeAttachmentUrls(chat: ParsedChat | null) {
  chat?.attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url));
}

function getChatTitle(chat: ParsedChat | null, myName: string): string {
  if (!chat) return "WhatsApp Preview";
  const others = chat.participants.filter((participant) => participant !== myName);
  if (others.length === 1) return others[0];
  if (others.length > 1) return others.slice(0, 2).join(", ");
  return chat.sourceName.replace(/\.zip$/i, "");
}

function getInitials(name?: string): string {
  if (!name) return "WA";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function cleanMessageText(text: string): string {
  return text
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/<(attached|attachment|anhang|media|medium):\s*[^>]*>/gi, "")
    .replace(/<(attached|attachment|anhang|media|medium)\s+omitted>/gi, "")
    .replace(/\b(media omitted|bild weggelassen|video weggelassen|audio weggelassen|anhang weggelassen)\b/gi, "")
    .replace(/\b[\w(). -]+\.(jpe?g|png|gif|webp|heic|bmp|mp4|mov|m4v|3gp|webm|opus|ogg|mp3|m4a|aac|wav|amr|pdf|docx?|xlsx?|pptx?)\b/gi, "")
    .replace(/This message was deleted/gi, "This message was deleted")
    .trim();
}

function formatDay(date: Date | null): string {
  if (!date) return "Unknown date";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateInputValue(date: Date | null): string {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default App;
