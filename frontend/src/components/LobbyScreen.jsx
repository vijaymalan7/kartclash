// src/components/LobbyScreen.jsx
import { useState } from "react";

export default function LobbyScreen({ lobbyData, myId, onReady, onStart, onLeave, send }) {
  const { players = [], host, code, name } = lobbyData;
  const [copied, setCopied] = useState(false);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const me = players.find((p) => p.id === myId);
  const isHost = host === myId;
  const allReady = players.length >= 2 && players.every((p) => p.ready);

  function copyCode() {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyLink() {
    const url = `${window.location.origin}?code=${code}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function sendChat(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    send({ type: "chat", text: chatInput.trim() });
    setChatInput("");
  }

  return (
    <div className="lobby">
      <div className="lobby-bg" />
      <div className="lobby-inner">
        {/* Header */}
        <div className="lobby-header">
          <h2 className="lobby-title">🏎️ {name}</h2>
          <button className="btn btn-sm btn-ghost" onClick={onLeave}>← Leave</button>
        </div>

        {/* Code share */}
        <div className="code-bar">
          <div className="code-label">Room Code</div>
          <div className="code-value">{code}</div>
          <button className="btn btn-sm" onClick={copyCode}>
            {copied ? "✓ Copied!" : "Copy Code"}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={copyLink}>
            🔗 Share Link
          </button>
        </div>

        <div className="lobby-body">
          {/* Players list */}
          <div className="players-panel">
            <h3>Players <span className="muted">({players.length}/10)</span></h3>
            <div className="players-grid">
              {players.map((p) => (
                <div key={p.id} className={`player-card ${p.ready ? "ready" : ""} ${p.id === myId ? "me" : ""}`}>
                  <div className="player-kart" style={{ background: p.color }}>🏎️</div>
                  <div className="player-info">
                    <div className="player-name">
                      {p.name}
                      {p.id === host && <span className="badge-host">HOST</span>}
                      {p.id === myId && <span className="badge-me">YOU</span>}
                    </div>
                    <div className={`ready-status ${p.ready ? "yes" : "no"}`}>
                      {p.ready ? "✓ Ready" : "Not Ready"}
                    </div>
                  </div>
                  <div className="color-dot" style={{ background: p.color }} />
                </div>
              ))}
              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 10 - players.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="player-card empty">
                  <div className="player-kart empty-slot">?</div>
                  <div className="player-info muted">Waiting...</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="lobby-actions">
              <button
                className={`btn ${me?.ready ? "btn-ghost" : "btn-ready"}`}
                onClick={onReady}
              >
                {me?.ready ? "✗ Unready" : "✓ Ready Up"}
              </button>
              {isHost && (
                <button
                  className="btn btn-start"
                  onClick={onStart}
                  disabled={players.length < 1}
                >
                  ▶ Force Start
                </button>
              )}
            </div>
            {allReady && <p className="start-hint">🚀 All ready! Starting game...</p>}
            {players.length < 2 && <p className="muted" style={{ marginTop: 8 }}>Waiting for more players... Share the code!</p>}
          </div>

          {/* Chat */}
          <div className="chat-panel">
            <h3>💬 Chat</h3>
            <div className="chat-messages">
              {chat.length === 0 && <p className="muted">Say hello! 👋</p>}
              {chat.map((m, i) => (
                <div key={i} className="chat-msg">
                  <span className="chat-from">{m.from}:</span> {m.text}
                </div>
              ))}
            </div>
            <form className="chat-input-row" onSubmit={sendChat}>
              <input
                className="inp"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={120}
              />
              <button className="btn btn-sm" type="submit">Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
