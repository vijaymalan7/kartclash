// src/App.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useGame, apiCreateRoom, apiJoinRoom } from "./hooks/useGame";
import LandingScreen from "./components/LandingScreen";
import LobbyScreen from "./components/LobbyScreen";
import GameScreen from "./components/GameScreen";
import "./App.css";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function App() {
  const [screen, setScreen] = useState("landing"); // landing | lobby | game
  const [playerId] = useState(() => {
    let id = localStorage.getItem("kart_pid");
    if (!id) { id = genId(); localStorage.setItem("kart_pid", id); }
    return id;
  });
  const [roomCode, setRoomCode] = useState(null);
  const [lobbyData, setLobbyData] = useState(null);
  const [gameState, setGameState] = useState(null);
  const { connect, disconnect, send, on, connected } = useGame();
  const chatBufferRef = useRef([]);

  // Check URL for room code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      // Pre-fill code — will prompt user to enter name
      sessionStorage.setItem("kart_joincode", code.toUpperCase());
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Register WS listeners
  useEffect(() => {
    on("lobby", (data) => {
      setLobbyData(data);
      if (data.state === "playing") setScreen("game");
    });
    on("state", (data) => {
      setGameState(data);
      if (data.state !== "lobby" && screen !== "game") setScreen("game");
    });
    on("chat", (msg) => {
      chatBufferRef.current = [...chatBufferRef.current.slice(-49), msg];
    });
  }, [on, screen]);

  async function handleCreateRoom(playerName, roomName) {
    const res = await apiCreateRoom(playerName, playerId, roomName);
    setRoomCode(res.code);
    connect(res.code, playerId);
    setScreen("lobby");
  }

  async function handleJoinRoom(playerName, code) {
    await apiJoinRoom(code, playerName, playerId);
    setRoomCode(code);
    connect(code, playerId);
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
    setScreen("landing");
    setLobbyData(null);
    setGameState(null);
    setRoomCode(null);
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
        />
      )}
      {screen === "game" && (
        <GameScreen
          gameState={gameState}
          myId={playerId}
          send={send}
          onLeave={handleLeave}
        />
      )}
    </>
  );
}
