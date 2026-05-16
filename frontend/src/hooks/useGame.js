// src/hooks/useGame.js
import { useEffect, useRef, useCallback, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_BASE = API.replace(/^http/, "ws");

export function useGame() {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef({});

  /** Register a WS message handler. Returns unsubscribe so effects can avoid duplicates. */
  const on = useCallback((type, fn) => {
    const bucket = listenersRef.current[type] || (listenersRef.current[type] = []);
    bucket.push(fn);
    return () => {
      const b = listenersRef.current[type];
      if (!b) return;
      const i = b.indexOf(fn);
      if (i >= 0) b.splice(i, 1);
    };
  }, []);

  const send = useCallback((obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);

  const connect = useCallback((code, playerId) => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(`${WS_BASE}/ws/${code}/${playerId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const bucket = listenersRef.current[data.type];
        if (bucket?.length) bucket.forEach((fn) => fn(data));
      } catch {}
    };
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  return { connect, disconnect, send, on, connected };
}

export async function apiCreateRoom(playerName, playerID, roomName) {
  const r = await fetch(`${API}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player_name: playerName, player_id: playerID, room_name: roomName }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiJoinRoom(code, playerName, playerID) {
  const r = await fetch(`${API}/rooms/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player_name: playerName, player_id: playerID }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiGetRoom(code) {
  const r = await fetch(`${API}/rooms/${code}`);
  if (!r.ok) throw new Error("Room not found");
  return r.json();
}

export async function apiListRooms() {
  const r = await fetch(`${API}/rooms`);
  return r.json();
}
