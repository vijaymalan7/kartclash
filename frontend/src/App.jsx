// src/App.jsx
import { useState, useEffect, useRef } from "react";
import { useGame, apiCreateRoom, apiJoinRoom } from "./hooks/useGame";
import LandingScreen from "./components/LandingScreen";
import LobbyScreen from "./components/LobbyScreen";
import GameScreen from "./components/GameScreen";
import "./App.css";

/** Persist across refresh (sessionStorage can be unreliable in some embedded browsers). */
const SESSION_ROOM = "kart_session_room";
const SESSION_NAME = "kart_session_name";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function App() {
  const [screen, setScreen] = useState("landing"); // landing | lobby | game
  const [playerId] = useState(() => {
    let id = localStorage.getItem("kart_pid");
    if (!id) {
      id = genId();
      localStorage.setItem("kart_pid", id);
    }
    return id;
  });
  const [lobbyData, setLobbyData] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [lobbyChat, setLobbyChat] = useState([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [awaitingRoom, setAwaitingRoom] = useState(false);
  const restoreGenRef = useRef(0);
  const { connect, disconnect, send, on } = useGame();

  function persistSession(code, playerName) {
    try {
      localStorage.setItem(SESSION_ROOM, code.toUpperCase());
      localStorage.setItem(SESSION_NAME, playerName);
    } catch {
      /* private mode etc. */
    }
  }

  function clearStoredSession() {
    try {
      localStorage.removeItem(SESSION_ROOM);
      localStorage.removeItem(SESSION_NAME);
    } catch {
      /* ignore */
    }
  }

  // URL join hint (runs early)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      sessionStorage.setItem("kart_joincode", code.toUpperCase());
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // WS handlers MUST register before reconnect attempts (first tick).
  useEffect(() => {
    const unsubs = [
      on("lobby", (data) => {
        setLobbyData(data);
        setAwaitingRoom(false);
        if (data.state && data.state !== "lobby") {
          setScreen("game");
        } else {
          setScreen("lobby");
        }
      }),
      on("state", (data) => {
        setGameState(data);
        setAwaitingRoom(false);
        if (data.state !== "lobby") {
          setScreen("game");
        }
      }),
      on("chat", (msg) => {
        setLobbyChat((prev) => [...prev.slice(-49), { from: msg.from, text: msg.text }]);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [on]);

  // Restore room after refresh (runs after handlers exist).
  useEffect(() => {
    const gen = ++restoreGenRef.current;
    let cancelled = false;

    (async () => {
      const code = localStorage.getItem(SESSION_ROOM);
      const name = localStorage.getItem(SESSION_NAME);
      if (code && name) {
        setAwaitingRoom(true);
        try {
          await apiJoinRoom(code, name, playerId);
          if (cancelled || restoreGenRef.current !== gen) return;
          connect(code.toUpperCase(), playerId);
        } catch {
          clearStoredSession();
          setAwaitingRoom(false);
        }
      }
      if (!cancelled && restoreGenRef.current === gen) {
        setSessionReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playerId, connect]);

  // If the server never answers (bad URL, offline), leave splash instead of hanging forever.
  useEffect(() => {
    if (!awaitingRoom) return undefined;
    const t = window.setTimeout(() => setAwaitingRoom(false), 12000);
    return () => window.clearTimeout(t);
  }, [awaitingRoom]);

  function clearJoinCodeHint() {
    try {
      sessionStorage.removeItem("kart_joincode");
    } catch {
      /* ignore */
    }
  }

  async function handleCreateRoom(playerName, roomName) {
    const res = await apiCreateRoom(playerName, playerId, roomName);
    setLobbyChat([]);
    clearJoinCodeHint();
    persistSession(res.code, playerName);
    connect(res.code, playerId);
    setScreen("lobby");
  }

  async function handleJoinRoom(playerName, code) {
    await apiJoinRoom(code, playerName, playerId);
    setLobbyChat([]);
    const normalized = code.toUpperCase();
    clearJoinCodeHint();
    persistSession(normalized, playerName);
    connect(normalized, playerId);
    setScreen("lobby");
  }

  function handleReady() {
    const me = lobbyData?.players?.find((p) => p.id === playerId);
    send({ type: "ready", ready: !me?.ready });
  }

  function handleStart() {
    send({ type: "start" });
  }

  function handleLeave() {
    disconnect();
    clearStoredSession();
    clearJoinCodeHint();
    setScreen("landing");
    setLobbyData(null);
    setGameState(null);
    setLobbyChat([]);
  }

  const showReconnectSplash = !sessionReady || (awaitingRoom && !lobbyData && !gameState);

  if (showReconnectSplash) {
    return (
      <div className="app-rehydrate" aria-busy="true" role="status">
        <p className="app-rehydrate__text">{awaitingRoom ? "Reconnecting to room…" : "Loading…"}</p>
      </div>
    );
  }

  return (
    <>
      {screen === "landing" && (
        <LandingScreen
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      )}
      {screen === "lobby" && lobbyData && (
        <LobbyScreen
          lobbyData={lobbyData}
          myId={playerId}
          onReady={handleReady}
          onStart={handleStart}
          onLeave={handleLeave}
          send={send}
          chatMessages={lobbyChat}
        />
      )}
      {screen === "game" && (
        <GameScreen
          gameState={gameState}
          myId={playerId}
          send={send}
          onLeave={handleLeave}
          registerWsHandler={on}
        />
      )}
    </>
  );
}
