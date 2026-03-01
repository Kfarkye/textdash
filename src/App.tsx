import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

type Message = {
  id: string;
  clinician_name: string;
  message_content: string;
  has_attachment: boolean;
  received_at: string;
  created_at: string;
  draft_reply: string | null;
  status: string;
  phone_number: string | null;
  specialty: string | null;
};

type Tab = "send" | "edit" | "questions" | "all";

function relativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  return `${diffD}d ago`;
}

function statusColor(s: string): string {
  switch (s) {
    case "unread": return "var(--amber)";
    case "awaiting_response": return "var(--blue)";
    case "sent": return "var(--green)";
    case "needs_info": return "var(--rose)";
    case "read": return "var(--slate)";
    default: return "var(--slate)";
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "unread": return "NEEDS REPLY";
    case "awaiting_response": return "AWAITING";
    case "sent": return "SENT";
    case "needs_info": return "NEEDS INFO";
    case "read": return "READ";
    default: return s.toUpperCase();
  }
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("send");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [commentId, setCommentId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("clinician_messages")
      .select("*")
      .order("received_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    setMessages(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("clinician_messages").update({ status }).eq("id", id);
    showToast(`Status → ${statusLabel(status)}`);
    fetchMessages();
  };

  const saveDraft = async (id: string) => {
    await supabase.from("clinician_messages").update({ draft_reply: editDraft }).eq("id", id);
    setEditingId(null);
    setEditDraft("");
    showToast("Draft saved");
    fetchMessages();
  };

  const saveComment = async (id: string) => {
    const msg = messages.find(m => m.id === id);
    const existing = msg?.message_content ?? "";
    const updated = existing + "\n\n[KOFI NOTE] " + comment;
    await supabase.from("clinician_messages").update({ message_content: updated }).eq("id", id);
    setCommentId(null);
    setComment("");
    showToast("Comment added");
    fetchMessages();
  };

  const filtered = messages.filter((m) => {
    switch (tab) {
      case "send": return m.status === "unread" && m.draft_reply;
      case "edit": return m.status === "unread" && !m.draft_reply || m.status === "awaiting_response";
      case "questions": return m.status === "needs_info";
      case "all": return true;
    }
  });

  const counts = {
    send: messages.filter(m => m.status === "unread" && m.draft_reply).length,
    edit: messages.filter(m => (m.status === "unread" && !m.draft_reply) || m.status === "awaiting_response").length,
    questions: messages.filter(m => m.status === "needs_info").length,
    all: messages.length,
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="loader" />
        <p className="loader-text">Loading messages…</p>
      </div>
    );
  }

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}

      <header className="header">
        <div className="header-left">
          <h1 className="logo">TextDash</h1>
          <span className="subtitle">Clinician Message Center</span>
        </div>
        <button className="refresh-btn" onClick={fetchMessages}>↻ Refresh</button>
      </header>

      <nav className="tabs">
        {(["send", "edit", "questions", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "tab-active" : ""}`}
            onClick={() => setTab(t)}
          >
            <span className="tab-label">
              {t === "send" ? "📤 Ready to Send" :
                t === "edit" ? "✏️ Needs Edit" :
                  t === "questions" ? "❓ Need Info" : "📋 All Messages"}
            </span>
            <span className="tab-count" style={{ background: counts[t] > 0 ? statusColor(t === "send" ? "unread" : t === "edit" ? "awaiting_response" : t === "questions" ? "needs_info" : "read") : "var(--surface-3)" }}>
              {counts[t]}
            </span>
          </button>
        ))}
      </nav>

      <main className="messages">
        {filtered.length === 0 && (
          <div className="empty">
            <p className="empty-icon">{tab === "send" ? "✅" : tab === "questions" ? "🎉" : "📭"}</p>
            <p className="empty-text">
              {tab === "send" ? "No messages ready to send" :
                tab === "questions" ? "No open questions" :
                  tab === "edit" ? "Nothing needs editing" : "No messages yet"}
            </p>
          </div>
        )}

        {filtered.map((m) => (
          <div key={m.id} className="card">
            <div className="card-header">
              <div className="card-meta">
                <h3 className="card-name">{m.clinician_name}</h3>
                {m.specialty && <span className="badge">{m.specialty}</span>}
                {m.phone_number && <span className="phone">{m.phone_number}</span>}
              </div>
              <div className="card-right">
                <span className="time">{relativeTime(m.received_at)}</span>
                <span className="status-pill" style={{ background: statusColor(m.status) }}>
                  {statusLabel(m.status)}
                </span>
              </div>
            </div>

            <div className="card-body">
              <div className="message-bubble inbound">
                <p className="bubble-label">Their message</p>
                <p>{m.message_content}</p>
                {m.has_attachment && <span className="attachment-tag">📎 Attachment</span>}
              </div>

              {m.draft_reply && editingId !== m.id && (
                <div className="message-bubble outbound">
                  <p className="bubble-label">Your draft reply</p>
                  <p>{m.draft_reply}</p>
                </div>
              )}

              {editingId === m.id && (
                <div className="edit-area">
                  <textarea
                    className="edit-textarea"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={4}
                    placeholder="Edit your reply…"
                  />
                  <div className="edit-actions">
                    <button className="btn btn-primary" onClick={() => saveDraft(m.id)}>💾 Save Draft</button>
                    <button className="btn btn-ghost" onClick={() => { setEditingId(null); setEditDraft(""); }}>Cancel</button>
                  </div>
                </div>
              )}

              {commentId === m.id && (
                <div className="edit-area">
                  <textarea
                    className="edit-textarea"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    placeholder="Add your note or comment…"
                  />
                  <div className="edit-actions">
                    <button className="btn btn-primary" onClick={() => saveComment(m.id)}>💬 Add Note</button>
                    <button className="btn btn-ghost" onClick={() => { setCommentId(null); setComment(""); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <div className="card-actions">
              {editingId !== m.id && (
                <button className="btn btn-outline" onClick={() => {
                  setEditingId(m.id);
                  setEditDraft(m.draft_reply ?? "");
                  setCommentId(null);
                }}>✏️ Edit Reply</button>
              )}
              {commentId !== m.id && editingId !== m.id && (
                <button className="btn btn-outline" onClick={() => {
                  setCommentId(m.id);
                  setComment("");
                  setEditingId(null);
                }}>💬 Add Note</button>
              )}
              <div className="status-actions">
                {m.status !== "sent" && m.draft_reply && (
                  <button className="btn btn-green" onClick={() => updateStatus(m.id, "sent")}>✅ Mark Sent</button>
                )}
                {m.status !== "needs_info" && (
                  <button className="btn btn-rose" onClick={() => updateStatus(m.id, "needs_info")}>❓ Need Info</button>
                )}
                {m.status === "needs_info" && (
                  <button className="btn btn-amber" onClick={() => updateStatus(m.id, "unread")}>↩ Back to Unread</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
