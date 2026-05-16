// src/components/GameScreen.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useFullscreen } from "../hooks/useFullscreen";
import { useGameVoice } from "../hooks/useGameVoice";
import { renderGame } from "../game/renderer";

const ITEM_ICONS = { boost: "⚡", bomb: "💣", shield: "🛡️", missile: "🚀" };
const MINIMAP_STORAGE_KEY = "kart_show_minimap";

function useNeedsLandscapeLock() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const portraitMq = window.matchMedia("(orientation: portrait)");
    const narrowMq = window.matchMedia("(max-width: 896px)");
    const coarseMq = window.matchMedia("(pointer: coarse)");
    const update = () => {
      const portrait = portraitMq.matches;
      const phoneLike = narrowMq.matches || coarseMq.matches;
      setBlocked(portrait && phoneLike);
    };
    update();
    portraitMq.addEventListener("change", update);
    narrowMq.addEventListener("change", update);
    coarseMq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      portraitMq.removeEventListener("change", update);
      narrowMq.removeEventListener("change", update);
      coarseMq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return blocked;
}

export default function GameScreen({ gameState, myId, send, onLeave, registerWsHandler }) {
  const screenRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const keysRef = useRef({});
  const animRef = useRef(null);
  const cameraRef = useRef({ x: 0, y: 0 });
  const prevKeysRef = useRef({});
  const [minimap, setMinimap] = useState([]);
  const [showMinimap, setShowMinimap] = useState(() => {
    try {
      return localStorage.getItem(MINIMAP_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const portraitBlock = useNeedsLandscapeLock();
  const { fullscreen, toggleFullscreen, enterFullscreen } = useFullscreen();

  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);

  const peerIds = useMemo(() => {
    const ids = (gameState?.players || []).map((p) => p.id).filter((id) => id !== myId);
    return [...new Set(ids)].sort();
  }, [gameState?.players, myId]);

  const voiceEnabled =
    !!(gameState && (gameState.state === "playing" || gameState.state === "finished") && peerIds.length > 0);

  const { voiceError, voiceActive } = useGameVoice({
    myId,
    peerIds,
    enabled: voiceEnabled,
    micMuted,
    deafened,
    send,
    registerWsHandler,
  });

  function toggleMinimap() {
    setShowMinimap((v) => {
      const next = !v;
      try {
        localStorage.setItem(MINIMAP_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const ARENA_W = 1200;
  const ARENA_H = 800;

  // Match visible viewport on mobile (shrinks when URL bar shows/hides)
  useEffect(() => {
    const root = screenRef.current;
    const vv = window.visualViewport;
    if (!root || !vv) return undefined;

    const sync = () => {
      root.style.height = `${vv.height}px`;
      root.style.top = `${vv.offsetTop}px`;
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      root.style.height = "";
      root.style.top = "";
    };
  }, []);

  // Prefer landscape on phones (best-effort; may require user gesture / HTTPS)
  useEffect(() => {
    (async () => {
      try {
        const o = screen.orientation;
        if (o && typeof o.lock === "function") await o.lock("landscape-primary");
      } catch {
        /* not supported or denied */
      }
    })();
    return () => {
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Size canvas to the flex arena (responsive; visualViewport tracks mobile browser chrome)
  useEffect(() => {
    const wrap = canvasWrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const syncSize = () => {
      const w = Math.max(1, Math.floor(wrap.clientWidth));
      const h = Math.max(1, Math.floor(wrap.clientHeight));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(wrap);
    window.visualViewport?.addEventListener("resize", syncSize);
    window.visualViewport?.addEventListener("scroll", syncSize);
    window.addEventListener("resize", syncSize);
    return () => {
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", syncSize);
      window.visualViewport?.removeEventListener("scroll", syncSize);
      window.removeEventListener("resize", syncSize);
    };
  }, []);

  // Best-effort fullscreen once the player touches the arena (user gesture required)
  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap || fullscreen) return;
    const onFirstPlay = () => {
      enterFullscreen();
    };
    wrap.addEventListener("pointerdown", onFirstPlay, { once: true });
    return () => wrap.removeEventListener("pointerdown", onFirstPlay);
  }, [fullscreen, enterFullscreen]);

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

  // Send keys throttled (touch / coarse pointers: always send gas + left/right/use)
  useEffect(() => {
    const interval = setInterval(() => {
      const raw = { ...keysRef.current };
      const coarse =
        typeof window !== "undefined" &&
        window.matchMedia("(pointer: coarse)").matches;
      const curr = coarse
        ? {
            up: true,
            down: !!raw.down,
            left: !!raw.left,
            right: !!raw.right,
            use: !!raw.use,
          }
        : {
            up: !!raw.up,
            down: !!raw.down,
            left: !!raw.left,
            right: !!raw.right,
            use: !!raw.use,
          };
      const prev = prevKeysRef.current;
      const changed =
        Object.keys(curr).some((k) => curr[k] !== prev[k]) ||
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

  function setTouchDir(dir, active) {
    keysRef.current[dir] = active;
  }

  function releaseSteerTouch() {
    keysRef.current.left = false;
    keysRef.current.right = false;
  }

  const dpadBind = (dir) => ({
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setTouchDir(dir, true);
    },
    onPointerUp: (e) => {
      setTouchDir(dir, false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    onPointerCancel: () => setTouchDir(dir, false),
    onLostPointerCapture: () => setTouchDir(dir, false),
  });

  const useBind = {
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setTouchDir("use", true);
    },
    onPointerUp: (e) => {
      setTouchDir("use", false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    onPointerCancel: () => setTouchDir("use", false),
    onLostPointerCapture: () => setTouchDir("use", false),
  };

  return (
    <div ref={screenRef} className="game-screen">
      {portraitBlock && (
        <div className="rotate-device-overlay" role="dialog" aria-modal="true" aria-label="Rotate device">
          <div className="rotate-device-card">
            <div className="rotate-device-kart" aria-hidden>
              <div className="rotate-device-kart-inner">
                <span className="rotate-kart__body" />
                <span className="rotate-kart__wing rotate-kart__wing--l" />
                <span className="rotate-kart__wing rotate-kart__wing--r" />
              </div>
            </div>
            <h2 className="rotate-device-title">Rotate to landscape</h2>
            <p className="rotate-device-hint">
              KartClash is built for wide screens. Turn your phone sideways for the full arena.
            </p>
            <div className="rotate-device-icon" aria-hidden>↻</div>
          </div>
        </div>
      )}

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
          {voiceEnabled && (
            <div className="hud-voice" role="group" aria-label="Voice chat">
              <button
                type="button"
                className={`btn btn-sm hud-voice-btn ${micMuted ? "hud-voice-btn--off" : ""}`}
                onClick={() => setMicMuted((v) => !v)}
                aria-pressed={micMuted}
                title={micMuted ? "Unmute microphone" : "Mute microphone"}
              >
                <span aria-hidden>{micMuted ? "🔇" : "🎙️"}</span>
                <span className="hud-voice-btn__lbl">{micMuted ? "Mic off" : "Mic"}</span>
              </button>
              <button
                type="button"
                className={`btn btn-sm hud-voice-btn ${deafened ? "hud-voice-btn--off" : ""}`}
                onClick={() => setDeafened((v) => !v)}
                aria-pressed={deafened}
                title={deafened ? "Unmute others" : "Mute others (can't hear team)"}
              >
                <span aria-hidden>{deafened ? "🚫" : "🔊"}</span>
                <span className="hud-voice-btn__lbl">{deafened ? "Mute all" : "Hear"}</span>
              </button>
              {voiceError && (
                <span className="hud-voice-err" title={voiceError}>
                  ⚠️ Voice
                </span>
              )}
              {!voiceError && voiceActive && (
                <span className="hud-voice-live" title="Voice connected">
                  ●
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            className="btn btn-sm btn-ghost hud-map-toggle"
            onClick={toggleMinimap}
            aria-pressed={showMinimap}
            aria-label={showMinimap ? "Hide minimap" : "Show minimap"}
            title={showMinimap ? "Hide minimap" : "Show minimap"}
          >
          <span className="hud-map-toggle__icon" aria-hidden>🗺️</span>
          <span className="hud-map-toggle__txt">{showMinimap ? "On" : "Off"}</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost hud-fs-btn"
            onClick={toggleFullscreen}
            aria-pressed={fullscreen}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen (hides browser bar)"}
          >
            {fullscreen ? "⤢" : "⛶"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onLeave}>⏸ Leave</button>
        </div>
      </div>

      <div className="game-arena">
        <div ref={canvasWrapRef} className="game-canvas-wrap">
          <canvas ref={canvasRef} className="game-canvas" />
        </div>
      </div>

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

      {/* Minimap (optional) */}
      {showMinimap && (
        <div className="minimap">
          <svg className="minimap-svg" viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} preserveAspectRatio="xMidYMid meet">
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
      )}

      {/* Mobile: invisible left / right halves to steer; USE button only visible control */}
      <div
        className="touch-steer-zones"
        onPointerLeave={releaseSteerTouch}
      >
        <div
          className="steer-zone steer-zone--left"
          role="button"
          aria-label="Steer left (hold left side of screen)"
          {...dpadBind("left")}
        />
        <div
          className="steer-zone steer-zone--right"
          role="button"
          aria-label="Steer right (hold right side of screen)"
          {...dpadBind("right")}
        />
      </div>
      <div className="touch-use-corner">
        <p className="touch-use-hint" aria-hidden>Item</p>
        <button type="button" className="use-btn" {...useBind} aria-label="Use item">
          <span className="use-btn__emoji">{me?.item ? ITEM_ICONS[me.item] : "🎁"}</span>
          <span className="use-btn__text">USE</span>
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
            <button type="button" className="btn btn-create" onClick={onLeave} style={{ marginTop: 20 }}>
              🏠 Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
