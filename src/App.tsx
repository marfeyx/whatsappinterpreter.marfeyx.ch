import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadAttachmentUrl, parseWhatsAppZip, terminateZipParser } from "./parser";
import type { Attachment, ChatMessage, LoadedAttachmentUrl, MessageFilter, ParsedChat } from "./types";

type ParticipantStats = {
  name: string;
  messages: number;
  words: number;
  attachments: number;
  responseCount: number;
  totalResponseMs: number;
  averageResponseMs: number | null;
};

type TimestampedParticipantMessage = ChatMessage & {
  sender: string;
  timestamp: Date;
  isSystem: false;
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

type AuthMode = "login" | "register";

const filters: Array<{ id: MessageFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "text", label: "Text" },
  { id: "images", label: "Images" },
  { id: "media", label: "Media" },
];

const maxResponseGapMs = 16 * 60 * 60 * 1000;
const maxAuthAttempts = 5;
const authLockoutMs = 60 * 1000;
const maxAuthSubmissions = 5;
const authRateLimitWindowMs = 60 * 1000;
const initialTimelineRenderCount = 700;
const timelineRenderBatchSize = 700;

function App() {
  const [chat, setChat] = useState<ParsedChat | null>(null);
  const [myName, setMyName] = useState("");
  const [query, setQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [filter, setFilter] = useState<MessageFilter>("all");
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [accountActionError, setAccountActionError] = useState("");
  const [authFailures, setAuthFailures] = useState(0);
  const [authLockedUntil, setAuthLockedUntil] = useState<number | null>(null);
  const [authRateLimitedUntil, setAuthRateLimitedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, LoadedAttachmentUrl>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const authSubmissionTimes = useRef<number[]>([]);
  const attachmentUrlsRef = useRef<Record<string, LoadedAttachmentUrl>>({});
  const pendingAttachmentLoads = useRef(new Map<string, Promise<LoadedAttachmentUrl | null>>());
  const activeArchiveId = useRef<number | null>(null);

  const isAuthLocked = Boolean(authLockedUntil && authLockedUntil > now);
  const isAuthRateLimited = Boolean(authRateLimitedUntil && authRateLimitedUntil > now);
  const isAuthBlocked = isAuthLocked || isAuthRateLimited;
  const lockoutSeconds = authLockedUntil ? Math.max(0, Math.ceil((authLockedUntil - now) / 1000)) : 0;
  const rateLimitSeconds = authRateLimitedUntil ? Math.max(0, Math.ceil((authRateLimitedUntil - now) / 1000)) : 0;
  const authBlockSeconds = Math.max(lockoutSeconds, rateLimitSeconds);
  const authBlockMessage = isAuthLocked
    ? `Too many failed attempts. Try again in ${lockoutSeconds} seconds.`
    : isAuthRateLimited
      ? `Too many login attempts. Try again in ${rateLimitSeconds} seconds.`
      : "";

  useEffect(() => {
    return () => {
      revokeLoadedAttachmentUrls(attachmentUrlsRef.current);
      terminateZipParser();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

      if (!isMounted) return;
      setAuthUser(data.user);
      setIsAuthReady(true);
    });

    const {
      data: { subscription },
      setAuthUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthBlocked) return;

    const intervalId = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(intervalId);
  }, [isAuthBlocked]);

  useEffect(() => {
    activeArchiveId.current = chat?.archiveId ?? null;
  }, [chat]);

  useEffect(() => {
    attachmentUrlsRef.current = attachmentUrls;
  }, [attachmentUrls]);

  useEffect(() => {
    return () => {
      if (profilePictureUrl) URL.revokeObjectURL(profilePictureUrl);
    };
  }, [profilePictureUrl]);

  const visibleMessages = useMemo(() => {
    if (!chat) return [];
    const search = query.trim().toLowerCase();
    return chat.messages.filter((message) => {
      if (message.isHiddenNotice) return false;
      if (!matchesFilter(message, filter)) return false;
      if (dateQuery && message.dateKey !== dateQuery) return false;
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

  const ensureAttachmentUrl = useCallback((attachment: Attachment): Promise<LoadedAttachmentUrl | null> => {
    const cached = attachmentUrlsRef.current[attachment.path];
    if (cached) return Promise.resolve(cached);

    const pending = pendingAttachmentLoads.current.get(attachment.path);
    if (pending) return pending;

    const archiveId = attachment.archiveId;
    const promise = loadAttachmentUrl(attachment)
      .then((loaded) => {
        pendingAttachmentLoads.current.delete(attachment.path);

        if (activeArchiveId.current !== archiveId) {
          URL.revokeObjectURL(loaded.url);
          return null;
        }

        setAttachmentUrls((current) => {
          if (current[attachment.path]) {
            URL.revokeObjectURL(loaded.url);
            return current;
          }

          const next = { ...current, [attachment.path]: loaded };
          attachmentUrlsRef.current = next;
          return next;
        });

        return loaded;
      })
      .catch((caught) => {
        pendingAttachmentLoads.current.delete(attachment.path);
        throw caught;
      });

    pendingAttachmentLoads.current.set(attachment.path, promise);
    return promise;
  }, []);

  function handleUploadClick() {
    setError("");

    if (!authUser) {
      setAuthError("");
      setIsAuthModalOpen(true);
      return;
    }

    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setError("");

    try {
      const parsed = await parseWhatsAppZip(file);
      activeArchiveId.current = parsed.archiveId;
      clearLoadedAttachmentUrls();
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
    clearLoadedAttachmentUrls();
    activeArchiveId.current = null;
    terminateZipParser();
    setChat(null);
    setMyName("");
    setQuery("");
    setDateQuery("");
    setFilter("all");
    setError("");
    setProfilePictureUrl("");
  }

  function clearLoadedAttachmentUrls() {
    revokeLoadedAttachmentUrls(attachmentUrlsRef.current);
    attachmentUrlsRef.current = {};
    pendingAttachmentLoads.current.clear();
    setAttachmentUrls({});
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isAuthBlocked) {
      setAuthError(authBlockMessage);
      return;
    }

    const email = normalizeEmail(authEmail);
    const displayName = authDisplayName.trim();
    const validationError = validateCredentials(email, authPassword, authMode === "register" ? displayName : undefined);
    if (validationError) {
      setAuthError(validationError);
      return;
    }

    const rateLimitError = registerAuthSubmission();
    if (rateLimitError) {
      setAuthError(rateLimitError);
      return;
    }

    setIsAuthenticating(true);
    setAuthError("");

    try {
      const result =
        authMode === "login"
              email,
              password: authPassword,
              options: { data: { display_name: displayName, username: displayName } },
            });

      if (result.error) {
        if (shouldCountAuthFailure(result.error, authMode)) {
          registerAuthFailure();
        }

        setAuthError(getAuthErrorMessage(result.error, authMode));
        return;
      }

      setAuthFailures(0);
      setAuthLockedUntil(null);
      setAuthPassword("");
      setIsAuthModalOpen(false);

      if (authMode === "register" && !result.data.session) {
        setAuthError("Check your email to confirm your account before signing in.");
        setAuthMode("login");
        setIsAuthModalOpen(true);
        return;
      }

      window.setTimeout(() => fileInputRef.current?.click(), 0);
    } catch {
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handleLogout() {
    setAuthUser(null);
  }

  async function handleChangeAccount() {
    setAuthUser(null);
    setAuthEmail("");
    setAuthPassword("");
    setAuthDisplayName("");
    setAuthMode("login");
    setAuthError("");
    setAccountActionError("");
    setIsAuthModalOpen(true);
  }

  function registerAuthSubmission(): string {
    const timestamp = Date.now();
    const windowStart = timestamp - authRateLimitWindowMs;
    authSubmissionTimes.current = authSubmissionTimes.current.filter((attemptedAt) => attemptedAt > windowStart);

    if (authSubmissionTimes.current.length >= maxAuthSubmissions) {
      const retryAt = authSubmissionTimes.current[0] + authRateLimitWindowMs;
      setAuthRateLimitedUntil(retryAt);
      setNow(timestamp);
      return `Too many login attempts. Try again in ${Math.ceil((retryAt - timestamp) / 1000)} seconds.`;
    }

    authSubmissionTimes.current.push(timestamp);
    return "";
  }

  function registerAuthFailure() {
    const nextFailures = authFailures + 1;
    setAuthFailures(nextFailures);

    if (nextFailures >= maxAuthAttempts) {
      setAuthLockedUntil(Date.now() + authLockoutMs);
      setNow(Date.now());
      setAuthFailures(0);
    }
  }

  return (
    <>
      <MobileDisabled />
      <main className="app-shell">
        <section className="control-panel" aria-label="Import controls">
          <div>
            <p className="eyebrow">Local-only viewer</p>
            <h1>WhatsApp Backup Interpreter</h1>
          </div>

        <input
          ref={fileInputRef}
          className="hidden-file-input"
          type="file"
          accept=".zip,application/zip"
          onChange={handleFileChange}
        />
        <button className="file-drop" type="button" onClick={handleUploadClick} disabled={!isAuthReady || isParsing}>
          <span className="file-icon" aria-hidden="true">
            +
          </span>
          <span>{isParsing ? "Reading ZIP locally..." : "Choose WhatsApp export ZIP"}</span>
        </button>

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
            <strong>Login required, chat stays local.</strong>
            <span>
              messages and media are kept in memory only.
            </span>
          </div>
        )}
        <footer className="site-footer">
          <div className="footer-links">
            <a href="privacy.html">Privacy Policy</a>
            <a href="mailto:contact.marfeyx@gmail.com?subject=WhatsApp%20Backup%20Interpreter%20Issue">Report issues</a>
          </div>

          <div className="footer-account" aria-label="Account state">
            <span>{authUser ? `Signed in as ${getDisplayUsername(authUser)}` : "Not signed in"}</span>
            <div className="footer-account-actions">
              {authUser ? (
                <>
                  <button type="button" onClick={handleLogout}>
                    Sign out
                  </button>
                  <button type="button" onClick={handleChangeAccount}>
                    Change account
                  </button>
                  <a
                    className="footer-account-button danger"
                    href={`mailto:contact.marfeyx@gmail.com?subject=Delete%20account%20request&body=${encodeURIComponent(
                      `Please delete my WhatsApp Backup Interpreter account.\n\nAccount: ${authUser.email ?? getDisplayUsername(authUser)}`,
                    )}`}
                  >
                    Delete account request
                  </a>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                    setAccountActionError("");
                    setIsAuthModalOpen(true);
                  }}
                >
                  Login
                </button>
              )}
            </div>
            {accountActionError ? <p className="footer-account-error">{accountActionError}</p> : null}
          </div>
        </footer>
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
                onChange={handleProfilePictureChange}
              />
              <div className="chat-title">
                <strong>{getChatTitle(chat, myName)}</strong>
              </div>
            </div>
          </div>

          <div className="message-list">
            {chat ? (
              <Timeline
                messages={visibleMessages}
                myName={myName}
                attachmentUrls={attachmentUrls}
                onLoadAttachment={ensureAttachmentUrl}
              />
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
      {isAuthModalOpen ? (
        <AuthModal
          mode={authMode}
          email={authEmail}
          password={authPassword}
          displayName={authDisplayName}
          error={authError}
          isSubmitting={isAuthenticating}
          isLocked={isAuthBlocked}
          lockoutSeconds={authBlockSeconds}
          lockedMessage={authBlockMessage}
          onModeChange={(mode) => {
            setAuthMode(mode);
            setAuthError("");
          }}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onDisplayNameChange={setAuthDisplayName}
          onClose={() => {
            if (!isAuthenticating) setIsAuthModalOpen(false);
          }}
          onSubmit={handleAuthSubmit}
        />
      ) : null}
    </>
  );
}

function AuthModal({
  mode,
  email,
  password,
  displayName,
  error,
  isSubmitting,
  isLocked,
  lockoutSeconds,
  lockedMessage,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onDisplayNameChange,
  onClose,
  onSubmit,
}: {
  mode: AuthMode;
  email: string;
  password: string;
  displayName: string;
  error: string;
  isSubmitting: boolean;
  isLocked: boolean;
  lockoutSeconds: number;
  lockedMessage: string;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const title = mode === "login" ? "Login to upload" : "Create account";
  const submitText = mode === "login" ? "Login" : "Register";

  return (
    <div className="auth-backdrop" role="presentation">
      <form className="auth-modal" onSubmit={onSubmit} aria-label={title}>
        <div className="auth-modal-header">
          <div>
            <p className="eyebrow">Account required</p>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close login popup" disabled={isSubmitting}>
            x
          </button>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => onModeChange("login")}>
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => onModeChange("register")}
          >
            Register
          </button>
        </div>

        <label className="field">
          <span>Email</span>
          <input
            autoFocus
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="you@example.com"
          />
        </label>

        {mode === "register" ? (
          <label className="field">
            <span>Display name</span>
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              placeholder="Your display name"
              minLength={2}
              maxLength={40}
            />
          </label>
        ) : null}

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="At least 8 characters"
          />
        </label>

        {error ? <p className="error-message">{error}</p> : null}
        {isLocked ? <p className="auth-hint">{lockedMessage || `Try again in ${lockoutSeconds} seconds.`}</p> : null}

        <button className="auth-submit" type="submit" disabled={isSubmitting || isLocked}>
          {isSubmitting ? "Checking..." : submitText}
        </button>

        <p className="auth-hint">
        </p>
      </form>
    </div>
  );
}

function MobileDisabled() {
  return (
    <main className="mobile-disabled" aria-label="Mobile disabled notice">
      <div className="mobile-disabled-card">
        <div className="mobile-disabled-mark" aria-hidden="true">
          WA
        </div>
        <p className="eyebrow">Desktop only</p>
        <h1>Disabled on mobile due to performance problems</h1>
        <p>
          WhatsApp ZIP exports can contain thousands of messages and media files. Open this page on a laptop or desktop
          browser for the full local viewer.
        </p>
      </div>
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
            <ResponseMetric stat={stat} />
          </div>
        ))}
      </div>
      </section>
    </>
  );
}

function ResponseMetric({ stat }: { stat: ParticipantStats }) {
  return (
    <div className="stat-counter">
      <span>Avg response time</span>
      <strong>
        {formatDuration(stat.averageResponseMs)} · {stat.responseCount.toLocaleString()} replies
      </strong>
    </div>
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

function Avatar({
  imageUrl,
  fallback,
  onChange,
}: {
  imageUrl: string;
  fallback: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="avatar" title="Change profile picture">
      <input type="file" accept="image/*" onChange={onChange} />
      {imageUrl ? <img src={imageUrl} alt="Chat profile" /> : <span>{fallback}</span>}
    </label>
  );
}

function Timeline({
  messages,
  myName,
  attachmentUrls,
  onLoadAttachment,
}: {
  messages: ChatMessage[];
  myName: string;
  attachmentUrls: Record<string, LoadedAttachmentUrl>;
  onLoadAttachment: (attachment: Attachment) => Promise<LoadedAttachmentUrl | null>;
}) {
  const [renderCount, setRenderCount] = useState(initialTimelineRenderCount);
  let lastDay = "";

  useEffect(() => {
    setRenderCount(initialTimelineRenderCount);
  }, [messages]);

  if (!messages.length) {
    return <p className="no-results">No messages match the current view.</p>;
  }

  const displayedMessages = messages.slice(0, renderCount);
  const remainingMessages = Math.max(0, messages.length - displayedMessages.length);

  return (
    <>
      {displayedMessages.map((message) => {
        const day = formatDay(message.timestamp);
        const showDay = day !== lastDay;
        lastDay = day;

        return (
          <div className="timeline-item" key={message.id}>
            {showDay ? <div className="day-separator">{day}</div> : null}
            <MessageBubble
              message={message}
              outgoing={Boolean(message.sender && message.sender === myName)}
              attachmentUrls={attachmentUrls}
              onLoadAttachment={onLoadAttachment}
            />
          </div>
        );
      })}
      {remainingMessages > 0 ? (
        <button
          className="load-more-messages"
          type="button"
          onClick={() =>
            setRenderCount((current) => Math.min(current + timelineRenderBatchSize, messages.length))
          }
        >
          Show next {Math.min(timelineRenderBatchSize, remainingMessages).toLocaleString()} messages
        </button>
      ) : null}
    </>
  );
}

function MessageBubble({
  message,
  outgoing,
  attachmentUrls,
  onLoadAttachment,
}: {
  message: ChatMessage;
  outgoing: boolean;
  attachmentUrls: Record<string, LoadedAttachmentUrl>;
  onLoadAttachment: (attachment: Attachment) => Promise<LoadedAttachmentUrl | null>;
}) {
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
          <AttachmentPreview
            attachment={attachment}
            loadedAttachment={attachmentUrls[attachment.path]}
            key={attachment.path}
            onLoad={onLoadAttachment}
          />
        ))}
        {visibleText ? <p>{visibleText}</p> : null}
        <time>{formatTime(message.timestamp)}</time>
      </div>
    </article>
  );
}

function AttachmentPreview({
  attachment,
  loadedAttachment,
  onLoad,
}: {
  attachment: Attachment;
  loadedAttachment?: LoadedAttachmentUrl;
  onLoad: (attachment: Attachment) => Promise<LoadedAttachmentUrl | null>;
}) {
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loadError, setLoadError] = useState("");
  const url = loadedAttachment?.url;
  const size = loadedAttachment?.size || attachment.size;

  useEffect(() => {
    if (url || shouldLoad) return;

    const element = placeholderRef.current;
    if (!element || !("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "640px 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldLoad, url]);

  useEffect(() => {
    if (!shouldLoad || url || loadError) return;

    let isActive = true;
    onLoad(attachment).catch(() => {
      if (isActive) setLoadError("Could not load this file.");
    });

    return () => {
      isActive = false;
    };
  }, [attachment, loadError, onLoad, shouldLoad, url]);

  if (!url) {
    return (
      <div className="attachment-placeholder" ref={placeholderRef}>
        <span>{loadError || "Loading local file..."}</span>
        {loadError ? (
          <button
            type="button"
            onClick={() => {
              setLoadError("");
              setShouldLoad(true);
            }}
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (attachment.kind === "image") {
    return <img className="attachment-image" src={url} alt={attachment.name} loading="lazy" />;
  }

  if (attachment.kind === "video") {
    return <video className="attachment-video" src={url} controls preload="metadata" />;
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
        <audio src={url} controls preload="metadata" />
      </div>
    );
  }

  return (
    <a className="attachment-card" href={url} target="_blank" rel="noreferrer">
      <span className="attachment-glyph">doc</span>
      <span>
        <strong>{attachment.name}</strong>
        <small>{formatBytes(size)}</small>
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
  if (filter === "text") return !message.isSystem && message.hasRenderableText;
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

function getChatStats(chat: ParsedChat): ChatStats {
  const meaningfulMessages = chat.messages.filter((message) => !message.isHiddenNotice);
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
        responseCount: 0,
        totalResponseMs: 0,
        averageResponseMs: null,
      } satisfies ParticipantStats);

    existing.messages += 1;
    existing.words += message.wordCount;
    existing.attachments += message.attachments.length;
    byParticipant.set(message.sender, existing);
  }

  addResponseTimes(messages, byParticipant);

  return Array.from(byParticipant.values()).sort((a, b) => b.messages - a.messages || b.words - a.words);
}

function addResponseTimes(messages: ChatMessage[], byParticipant: Map<string, ParticipantStats>) {
  const responseWindowMessages = getResponseWindowMessages(messages);
  let lastParticipantMessage: ChatMessage | null = null;

  for (const message of responseWindowMessages) {
    if (
      lastParticipantMessage?.sender &&
      lastParticipantMessage.timestamp &&
      lastParticipantMessage.sender !== message.sender
    ) {
      const responseMs = message.timestamp.getTime() - lastParticipantMessage.timestamp.getTime();
      const stats = byParticipant.get(message.sender);

      if (stats && responseMs >= 0 && responseMs <= maxResponseGapMs) {
        stats.responseCount += 1;
        stats.totalResponseMs += responseMs;
        stats.averageResponseMs = Math.round(stats.totalResponseMs / stats.responseCount);
      }
    }

    lastParticipantMessage = message;
  }
}

function getResponseWindowMessages(messages: ChatMessage[]): TimestampedParticipantMessage[] {
  return messages
    .filter((message): message is TimestampedParticipantMessage =>
      Boolean(message.sender && !message.isSystem && message.timestamp),
    )
    .slice(-1000);
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

function revokeLoadedAttachmentUrls(attachmentUrls: Record<string, LoadedAttachmentUrl>) {
  Object.values(attachmentUrls).forEach((attachment) => URL.revokeObjectURL(attachment.url));
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

function formatBytes(bytes: number): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "Not enough replies";

  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const totalMinutes = Math.floor(totalSeconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  if (seconds > 0) return `${seconds}s`;
  return `${minutes}m`;
}

function getAuthErrorMessage(error: AuthError, mode: AuthMode): string {
  const code = getAuthErrorCode(error);
  const message = error.message.toLowerCase();

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Confirm your email address before signing in.";
  }

  if (code === "user_already_exists" || message.includes("already registered") || message.includes("already exists")) {
    return "An account already exists for this email. Login instead.";
  }

  if (code === "weak_password" || message.includes("weak password")) {
    return "Use a stronger password.";
  }

  if (code === "signup_disabled" || message.includes("signups not allowed") || message.includes("signup disabled")) {
    return "New account registration is currently disabled.";
  }

  if (code === "email_address_invalid" || message.includes("invalid email")) {
    return "Enter a valid email address.";
  }

  if (code === "over_email_send_rate_limit") {
    return "Too many confirmation emails were requested. Wait a moment and try again.";
  }

  if (code === "over_request_rate_limit" || error.status === 429) {
    return "Too many requests. Wait a moment and try again.";
  }

  if (code === "user_banned") {
    return "This account is disabled. Contact support if this seems wrong.";
  }

  if (error.status && error.status >= 500) {
  }

  return mode === "login" ? "Login failed. Check your email and password." : "Registration failed. Check your details.";
}

function shouldCountAuthFailure(error: AuthError, mode: AuthMode): boolean {
  if (mode !== "login") return false;

  const code = getAuthErrorCode(error);
  const message = error.message.toLowerCase();
  return code === "invalid_credentials" || message.includes("invalid login credentials");
}

function getAuthErrorCode(error: AuthError): string {
  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" ? code : "";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateCredentials(email: string, password: string, displayName?: string): string {
  if (!/^[\w.-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(email)) {
    return "Enter a valid email address.";
  }

  if (displayName !== undefined) {
    if (!displayName) {
      return "Enter a display name.";
    }

    if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,39}$/u.test(displayName)) {
      return "Use a display name with 2-40 letters, numbers, spaces, dots, underscores, or hyphens.";
    }
  }

  if (password.length < 8) {
    return "Use a password with at least 8 characters.";
  }

  return "";
}

function getEmailUsername(email: string): string {
  return email.split("@")[0] || "user";
}

function getDisplayUsername(user: User | null): string {
  if (!user) return "";

  const metadataDisplayName = user.user_metadata?.display_name;
  if (typeof metadataDisplayName === "string" && metadataDisplayName.trim()) {
    return metadataDisplayName.trim();
  }

  const metadataUsername = user.user_metadata?.username;
  if (typeof metadataUsername === "string" && metadataUsername.trim()) {
    return metadataUsername.trim();
  }

  return user.email?.split("@")[0] ?? "user";
}

export default App;
