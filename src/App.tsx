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

function statusClassName(s: string): string {
  switch (s) {
    case "unread": return "status-unread";
    case "awaiting_response": return "status-awaiting";
    case "sent": return "status-sent";
    case "needs_info": return "status-needs-info";
    case "read": return "status-read";
    default: return "status-read";
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "unread": return "Needs Reply";
    case "awaiting_response": return "Awaiting Response";
    case "sent": return "Sent";
    case "needs_info": return "Needs Info";
    case "read": return "Read";
    default: return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
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
    showToast(`Status shifted to ${statusLabel(status)}`);
    fetchMessages();
  };

  const saveDraft = async (id: string) => {
    await supabase.from("clinician_messages").update({ draft_reply: editDraft }).eq("id", id);
    setEditingId(null);
    setEditDraft("");
    showToast("Draft secured");
    fetchMessages();
  };

  const saveComment = async (id: string) => {
    const msg = messages.find(m => m.id === id);
    const existing = msg?.message_content ?? "";
    const updated = existing + "\n\n[ADMIN NOTE] " + comment;
    await supabase.from("clinician_messages").update({ message_content: updated }).eq("id", id);
    setCommentId(null);
    setComment("");
    showToast("Note appended");
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
        <p className="loader-text">Loading insights</p>
      </div>
    );
  }

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}

      <header className="header">
        <div className="header-left">
          <h1 className="logo">TextDash</h1>
          <span className="subtitle">Clinician communications</span>
        </div>
        <button className="refresh-btn" onClick={fetchMessages}>Refresh</button>
      </header>

      <nav className="tabs">
        {(["send", "edit", "questions", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "tab-active" : ""}`}
            onClick={() => setTab(t)}
          >
            <span className="tab-label">
              {t === "send" ? "Ready" :
                t === "edit" ? "Review" :
                  t === "questions" ? "Stalled" : "All"}
            </span>
            <span className="tab-count">
              {counts[t]}
            </span>
          </button>
        ))}
      </nav>

      <main className="messages">
        {filtered.length === 0 && (
          <div className="empty">
            <p className="empty-icon">⊘</p>
            <p className="empty-text">No data to display in this view.</p>
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
                <span className={`status-pill ${statusClassName(m.status)}`}>
                  {statusLabel(m.status)}
                </span>
                <span className="time">{relativeTime(m.received_at)}</span>
              </div>
            </div>

            <div className="card-body">
              <div className="message-bubble inbound">
                <p className="bubble-label">Incoming</p>
                <p>{m.message_content}</p>
                {m.has_attachment && <span className="attachment-tag">Attachment Present</span>}
              </div>

              {m.draft_reply && editingId !== m.id && (
                <div className="message-bubble outbound">
                  <p className="bubble-label">Drafted Payload</p>
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
                    placeholder="Refine draft payload..."
                  />
                  <div className="edit-actions">
                    <button className="btn btn-primary" onClick={() => saveDraft(m.id)}>Save changes</button>
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
                    placeholder="Add internal trace..."
                  />
                  <div className="edit-actions">
                    <button className="btn btn-primary" onClick={() => saveComment(m.id)}>Append</button>
                    <button className="btn btn-ghost" onClick={() => { setCommentId(null); setComment(""); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <div className="card-actions">
              <div className="edge-actions">
                {editingId !== m.id && (
                  <button className="btn btn-outline" onClick={() => {
                    setEditingId(m.id);
                    setEditDraft(m.draft_reply ?? "");
                    setCommentId(null);
                  }}>Modify</button>
                )}
                {commentId !== m.id && editingId !== m.id && (
                  <button className="btn btn-outline" onClick={() => {
                    setCommentId(m.id);
                    setComment("");
                    setEditingId(null);
                  }}>Annotate</button>
                )}
              </div>

              <div className="status-actions">
                {m.status !== "sent" && m.draft_reply && (
                  <button className="btn btn-primary" onClick={() => updateStatus(m.id, "sent")}>Push to Sender</button>
                )}
                {m.status !== "needs_info" && (
                  <button className="btn btn-ghost" onClick={() => updateStatus(m.id, "needs_info")}>Mark Stalled</button>
                )}
                {m.status === "needs_info" && (
                  <button className="btn btn-ghost" onClick={() => updateStatus(m.id, "unread")}>Restore</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
