// src/components/LandingScreen.jsx
import { useState, useEffect } from "react";
import { apiListRooms } from "../hooks/useGame";

export default function LandingScreen({ onCreateRoom, onJoinRoom }) {
  const [tab, setTab] = useState("home"); // home | join | browse
  const [name, setName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === "browse") {
      apiListRooms().then(setRooms).catch(() => {});
      const t = setInterval(() => apiListRooms().then(setRooms).catch(() => {}), 3000);
      return () => clearInterval(t);
    }
  }, [tab]);

  async function handleCreate() {
    if (!name.trim()) return setError("Enter your name!");
    if (!roomName.trim()) return setError("Enter a room name!");
    setLoading(true);
    setError("");
    try {
      await onCreateRoom(name.trim(), roomName.trim());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleJoin() {
    if (!name.trim()) return setError("Enter your name!");
    if (!code.trim()) return setError("Enter a room code!");
    setLoading(true);
    setError("");
    try {
      await onJoinRoom(name.trim(), code.trim().toUpperCase());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="landing">
      <div className="stars" />
      <div className="landing-content">
        {/* Logo */}
        <div className="logo-area">
          <div className="logo-kart">🏎️</div>
          <h1 className="logo-title">KART<span>CLASH</span></h1>
          <p className="logo-sub">Multiplayer Mayhem · Up to 10 Players</p>
        </div>

        {/* Navigation tabs */}
        <div className="tab-row">
          {[["home", "🏠 Play"], ["browse", "🌐 Browse"]].map(([t, label]) => (
            <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => { setTab(t); setError(""); }}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "home" && (
          <div className="card">
            <input
              className="inp"
              placeholder="Your name..."
              maxLength={16}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="card-split">
              {/* Create */}
              <div className="panel">
                <h3>🏁 Create Room</h3>
                <input
                  className="inp"
                  placeholder="Room name..."
                  maxLength={24}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <button className="btn btn-create" onClick={handleCreate} disabled={loading}>
                  {loading ? "Creating..." : "Create & Host"}
                </button>
              </div>

              <div className="divider-v">OR</div>

              {/* Join */}
              <div className="panel">
                <h3>🔑 Join Room</h3>
                <input
                  className="inp inp-code"
                  placeholder="Room Code..."
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
                <button className="btn btn-join" onClick={handleJoin} disabled={loading}>
                  {loading ? "Joining..." : "Join Room"}
                </button>
              </div>
            </div>
            {error && <p className="err">{error}</p>}
          </div>
        )}

        {tab === "browse" && (
          <div className="card">
            <input
              className="inp"
              placeholder="Your name (to join)..."
              maxLength={16}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <h3 style={{ marginTop: 12 }}>🌐 Open Rooms</h3>
            {rooms.length === 0 && <p className="muted">No open rooms right now. Create one!</p>}
            <div className="room-list">
              {rooms.map((r) => (
                <div key={r.code} className="room-row">
                  <div>
                    <strong>{r.name}</strong>
                    <span className="muted"> · {r.player_count}/10 players</span>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      if (!name.trim()) return setError("Enter your name first!");
                      setError("");
                      setLoading(true);
                      try { await onJoinRoom(name.trim(), r.code); }
                      catch (e) { setError(e.message); }
                      setLoading(false);
                    }}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
            {error && <p className="err">{error}</p>}
          </div>
        )}

        {/* Controls hint */}
        <div className="controls-hint">
          <span>🕹️ WASD / Arrow Keys to drive</span>
          <span>·</span>
          <span>Space to use item</span>
          <span>·</span>
          <span>💥 Last kart standing wins!</span>
        </div>
      </div>
    </div>
  );
}
