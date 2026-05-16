// src/components/LobbyScreen.jsx
import { useState } from "react";

/** Small CSS 3D kart badge for each player row */
function KartBadge3D({ color }) {
  return (
    <div className="kart-badge-3d" style={{ "--kart": color }} aria-hidden>
      <div className="kart-badge-3d__spin">
        <span className="kart-badge-3d__nose" />
        <span className="kart-badge-3d__hull" />
        <span className="kart-badge-3d__roof" />
        <span className="kart-badge-3d__wheel kart-badge-3d__wheel--fl" />
        <span className="kart-badge-3d__wheel kart-badge-3d__wheel--fr" />
        <span className="kart-badge-3d__wheel kart-badge-3d__wheel--bl" />
        <span className="kart-badge-3d__wheel kart-badge-3d__wheel--br" />
      </div>
    </div>
  );
}

/** Hero showcase above the lobby (continuous gentle 3D motion) */
function LobbyShowcase3D() {
  return (
    <div className="lobby-showcase" aria-hidden>
      <div className="lobby-showcase__glow" />
      <div className="lobby-showcase__track" />
      <div className="lobby-showcase__kart">
        <div className="lobby-showcase__kart-inner">
          <span className="lobby-kart__body" />
          <span className="lobby-kart__spoiler" />
          <span className="lobby-kart__cockpit" />
          <span className="lobby-kart__wheel lobby-kart__wheel--1" />
          <span className="lobby-kart__wheel lobby-kart__wheel--2" />
          <span className="lobby-kart__wheel lobby-kart__wheel--3" />
          <span className="lobby-kart__wheel lobby-kart__wheel--4" />
        </div>
      </div>
      <p className="lobby-showcase__tag">Room lobby</p>
    </div>
  );
}

export default function LobbyScreen({ lobbyData, myId, onReady, onStart, onLeave, send, chatMessages = [] }) {
  const { players = [], host, code, name } = lobbyData;
  const [copied, setCopied] = useState(false);
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
        <LobbyShowcase3D />
        {/* Header */}
        <div className="lobby-header">
          <h2 className="lobby-title">🏎️ {name}</h2>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onLeave}>← Leave</button>
        </div>

        {/* Code share */}
        <div className="code-bar">
          <div className="code-label">Room Code</div>
          <div className="code-value">{code}</div>
          <button type="button" className="btn btn-sm" onClick={copyCode}>
            {copied ? "✓ Copied!" : "Copy Code"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={copyLink}>
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
                  <KartBadge3D color={p.color} />
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
                type="button"
                className={`btn ${me?.ready ? "btn-ghost" : "btn-ready"}`}
                onClick={onReady}
              >
                {me?.ready ? "✗ Unready" : "✓ Ready Up"}
              </button>
              {isHost && (
                <button
                  type="button"
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
              {chatMessages.length === 0 && <p className="muted">Say hello! 👋</p>}
              {chatMessages.map((m, i) => (
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
              <button type="submit" className="btn btn-sm">Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
