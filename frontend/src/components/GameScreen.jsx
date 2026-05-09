// src/components/GameScreen.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { renderGame } from "../game/renderer";

const ITEM_ICONS = { boost: "⚡", bomb: "💣", shield: "🛡️", missile: "🚀" };

export default function GameScreen({ gameState, myId, send, onLeave }) {
  const canvasRef = useRef(null);
  const keysRef = useRef({});
  const animRef = useRef(null);
  const cameraRef = useRef({ x: 0, y: 0 });
  const prevKeysRef = useRef({});
  const [minimap, setMinimap] = useState([]);

  const ARENA_W = 1200, ARENA_H = 800;

  // Resize canvas
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.min(window.innerWidth, 1280);
      canvas.height = Math.min(window.innerHeight - 60, 720);
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Key handling
  const KEY_MAP = {
    ArrowUp: "up", w: "up", W: "up",
    ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
    " ": "use",
  };

  useEffect(() => {
    function onKeyDown(e) {
      const mapped = KEY_MAP[e.key];
      if (mapped) {
        e.preventDefault();
        keysRef.current[mapped] = true;
      }
    }
    function onKeyUp(e) {
      const mapped = KEY_MAP[e.key];
      if (mapped) {
        e.preventDefault();
        keysRef.current[mapped] = false;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Send keys throttled
  useEffect(() => {
    const interval = setInterval(() => {
      const curr = { ...keysRef.current };
      const prev = prevKeysRef.current;
      const changed = Object.keys(curr).some((k) => curr[k] !== prev[k]) ||
        Object.keys(prev).some((k) => curr[k] !== prev[k]);
      if (changed) {
        send({ type: "keys", keys: curr });
        prevKeysRef.current = { ...curr };
      }
    }, 33);
    return () => clearInterval(interval);
  }, [send]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (gameState) {
        renderGame(ctx, gameState, myId, cameraRef.current);
        // Update minimap
        setMinimap(gameState.players || []);
      }
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameState, myId]);

  const me = gameState?.players?.find((p) => p.id === myId);
  const sorted = [...(gameState?.players || [])].sort((a, b) => b.score - a.score);

  // Touch controls
  function handleTouch(dir, active) {
    keysRef.current[dir] = active;
  }

  return (
    <div className="game-screen">
      {/* HUD top bar */}
      <div className="hud-bar">
        <div className="hud-left">
          {me && (
            <>
              <div className="hud-hp">
                <span>HP</span>
                <div className="hp-track">
                  <div className="hp-fill" style={{ width: `${me.hp}%`, background: me.hp > 50 ? "#2ED573" : me.hp > 25 ? "#FFD700" : "#FF4757" }} />
                </div>
                <span>{me.hp}</span>
              </div>
              <div className="hud-item">
                {me.item ? (
                  <span className="item-badge">{ITEM_ICONS[me.item]} {me.item.toUpperCase()}</span>
                ) : (
                  <span className="muted">No item</span>
                )}
              </div>
              {me.boost && <div className="boost-badge">⚡ BOOST</div>}
              {me.shield && <div className="shield-badge">🛡️ SHIELD</div>}
            </>
          )}
        </div>

        <div className="hud-center">
          <span className="hud-state">
            {gameState?.state === "finished" ? "🏁 GAME OVER" : "🏎️ LIVE"}
          </span>
        </div>

        <div className="hud-right">
          <button className="btn btn-sm btn-ghost" onClick={onLeave}>⏸ Leave</button>
        </div>
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} className="game-canvas" />

      {/* Scoreboard sidebar */}
      <div className="scoreboard">
        <div className="score-title">Standings</div>
        {sorted.map((p, i) => (
          <div key={p.id} className={`score-row ${p.id === myId ? "me" : ""} ${!p.alive ? "dead" : ""}`}>
            <span className="score-rank">#{i + 1}</span>
            <span className="score-dot" style={{ background: p.color }} />
            <span className="score-name">{p.name.slice(0, 8)}</span>
            <span className="score-pts">{p.score}pts</span>
            {!p.alive && <span>💀</span>}
          </div>
        ))}
      </div>

      {/* Minimap */}
      <div className="minimap">
        <svg viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} width="160" height="100">
          <rect x="0" y="0" width={ARENA_W} height={ARENA_H} fill="#0d0d1a" stroke="#FF4757" strokeWidth="20" />
          {minimap.filter(p => p.alive).map((p) => (
            <circle
              key={p.id}
              cx={p.x} cy={p.y} r={p.id === myId ? 32 : 24}
              fill={p.color}
              stroke={p.id === myId ? "#fff" : "none"}
              strokeWidth="12"
            />
          ))}
        </svg>
      </div>

      {/* Mobile touch controls */}
      <div className="touch-controls">
        <div className="dpad">
          <button className="dpad-btn dpad-up" onPointerDown={() => handleTouch("up", true)} onPointerUp={() => handleTouch("up", false)}>▲</button>
          <div className="dpad-mid">
            <button className="dpad-btn" onPointerDown={() => handleTouch("left", true)} onPointerUp={() => handleTouch("left", false)}>◀</button>
            <button className="dpad-btn" onPointerDown={() => handleTouch("down", true)} onPointerUp={() => handleTouch("down", false)}>▼</button>
            <button className="dpad-btn" onPointerDown={() => handleTouch("right", true)} onPointerUp={() => handleTouch("right", false)}>▶</button>
          </div>
        </div>
        <button className="use-btn" onPointerDown={() => handleTouch("use", true)} onPointerUp={() => handleTouch("use", false)}>
          USE {me?.item ? ITEM_ICONS[me.item] : "🎁"}
        </button>
      </div>

      {/* Game Over overlay */}
      {gameState?.state === "finished" && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>🏁 Race Over!</h2>
            <div className="final-scores">
              {sorted.map((p, i) => (
                <div key={p.id} className={`final-row ${i === 0 ? "winner" : ""}`}>
                  <span>{i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                  <span style={{ color: p.color }}>{p.name}</span>
                  <span>{p.score} pts</span>
                </div>
              ))}
            </div>
            <button className="btn btn-create" onClick={onLeave} style={{ marginTop: 20 }}>
              🏠 Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
