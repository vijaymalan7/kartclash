import asyncio
import json
import math
import random
import string
import time
from collections import defaultdict
from typing import Dict, List, Optional, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="SmashKart API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Constants ────────────────────────────────────────────────
ARENA_W, ARENA_H = 1200, 800
KART_SPEED = 220
KART_ROT_SPEED = 3.2
KART_RADIUS = 18
MAX_PLAYERS = 10
ITEM_SPAWN_INTERVAL = 8
GAME_TICK = 1 / 30
ITEM_TYPES = ["boost", "bomb", "shield", "missile"]
KART_COLORS = [
    "#FF4757","#2ED573","#1E90FF","#FFD700","#FF6B81",
    "#70A1FF","#FF6348","#ECCC68","#A29BFE","#00D2D3"
]
SPAWN_POINTS = [
    (200,200),(400,200),(600,200),(800,200),(1000,200),
    (200,600),(400,600),(600,600),(800,600),(1000,600),
]

# ─── Game State ───────────────────────────────────────────────
rooms: Dict[str, dict] = {}
room_connections: Dict[str, Dict[str, WebSocket]] = defaultdict(dict)
room_tasks: Dict[str, asyncio.Task] = {}


def gen_code(n=6):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


def make_player(player_id: str, name: str, color: str, spawn: tuple):
    return {
        "id": player_id,
        "name": name,
        "color": color,
        "x": spawn[0],
        "y": spawn[1],
        "angle": 0.0,
        "speed": 0.0,
        "hp": 100,
        "score": 0,
        "item": None,
        "shield": False,
        "boost_timer": 0,
        "alive": True,
        "ready": False,
        "keys": {"up": False, "down": False, "left": False, "right": False, "use": False},
    }


def make_room(host_id: str, host_name: str, room_name: str):
    code = gen_code()
    color = KART_COLORS[0]
    spawn = SPAWN_POINTS[0]
    player = make_player(host_id, host_name, color, spawn)
    return {
        "code": code,
        "name": room_name,
        "host": host_id,
        "state": "lobby",   # lobby | playing | finished
        "players": {host_id: player},
        "items": [],        # {id, type, x, y}
        "projectiles": [],  # {id, owner, type, x, y, angle, speed, ttl}
        "last_item_spawn": time.time(),
        "game_start_time": None,
        "tick": 0,
    }


def spawn_item(room: dict):
    margin = 80
    return {
        "id": gen_code(8),
        "type": random.choice(ITEM_TYPES),
        "x": random.randint(margin, ARENA_W - margin),
        "y": random.randint(margin, ARENA_H - margin),
    }


# ─── REST Endpoints ───────────────────────────────────────────
class CreateRoomBody(BaseModel):
    player_name: str
    room_name: str
    player_id: str

class JoinRoomBody(BaseModel):
    player_name: str
    player_id: str

@app.post("/rooms")
def create_room(body: CreateRoomBody):
    room = make_room(body.player_id, body.player_name, body.room_name)
    rooms[room["code"]] = room
    return {"code": room["code"], "room_name": room["name"]}

@app.get("/rooms/{code}")
def get_room(code: str):
    room = rooms.get(code.upper())
    if not room:
        raise HTTPException(404, "Room not found")
    return {
        "code": room["code"],
        "name": room["name"],
        "state": room["state"],
        "player_count": len(room["players"]),
        "max_players": MAX_PLAYERS,
    }

@app.post("/rooms/{code}/join")
def join_room(code: str, body: JoinRoomBody):
    room = rooms.get(code.upper())
    if not room:
        raise HTTPException(404, "Room not found")
    if room["state"] != "lobby":
        raise HTTPException(400, "Game already started")
    if len(room["players"]) >= MAX_PLAYERS:
        raise HTTPException(400, "Room is full")
    if body.player_id in room["players"]:
        return {"ok": True}  # rejoin
    idx = len(room["players"])
    color = KART_COLORS[idx % len(KART_COLORS)]
    spawn = SPAWN_POINTS[idx % len(SPAWN_POINTS)]
    room["players"][body.player_id] = make_player(body.player_id, body.player_name, color, spawn)
    return {"ok": True}

@app.get("/rooms")
def list_rooms():
    return [
        {"code": r["code"], "name": r["name"], "state": r["state"],
         "player_count": len(r["players"])}
        for r in rooms.values() if r["state"] == "lobby"
    ]


# ─── Physics Tick ─────────────────────────────────────────────
def update_room(room: dict, dt: float):
    now = time.time()
    room["tick"] += 1

    # Spawn items
    if now - room["last_item_spawn"] > ITEM_SPAWN_INTERVAL and len(room["items"]) < 8:
        room["items"].append(spawn_item(room))
        room["last_item_spawn"] = now

    alive_players = [p for p in room["players"].values() if p["alive"]]

    for p in alive_players:
        k = p["keys"]
        # Rotation
        if k["left"]:
            p["angle"] -= KART_ROT_SPEED * dt
        if k["right"]:
            p["angle"] += KART_ROT_SPEED * dt

        # Acceleration
        speed_cap = KART_SPEED * (1.8 if p["boost_timer"] > 0 else 1.0)
        if k["up"]:
            p["speed"] = min(p["speed"] + 600 * dt, speed_cap)
        elif k["down"]:
            p["speed"] = max(p["speed"] - 500 * dt, -speed_cap * 0.5)
        else:
            p["speed"] *= (1 - 3.5 * dt)  # friction
            if abs(p["speed"]) < 2:
                p["speed"] = 0

        if p["boost_timer"] > 0:
            p["boost_timer"] -= dt

        # Move
        p["x"] += math.cos(p["angle"]) * p["speed"] * dt
        p["y"] += math.sin(p["angle"]) * p["speed"] * dt

        # Wall bounce
        if p["x"] < KART_RADIUS:
            p["x"] = KART_RADIUS
            p["speed"] *= -0.5
        if p["x"] > ARENA_W - KART_RADIUS:
            p["x"] = ARENA_W - KART_RADIUS
            p["speed"] *= -0.5
        if p["y"] < KART_RADIUS:
            p["y"] = KART_RADIUS
            p["speed"] *= -0.5
        if p["y"] > ARENA_H - KART_RADIUS:
            p["y"] = ARENA_H - KART_RADIUS
            p["speed"] *= -0.5

        # Use item
        if k["use"] and p["item"]:
            item_type = p["item"]
            p["item"] = None
            k["use"] = False
            if item_type == "boost":
                p["boost_timer"] = 3.0
            elif item_type == "shield":
                p["shield"] = True
            elif item_type in ("bomb", "missile"):
                proj = {
                    "id": gen_code(8),
                    "owner": p["id"],
                    "type": item_type,
                    "x": p["x"],
                    "y": p["y"],
                    "angle": p["angle"],
                    "speed": 420 if item_type == "missile" else 0,
                    "ttl": 4.0,
                    "radius": 60 if item_type == "bomb" else 12,
                }
                room["projectiles"].append(proj)

    # Update projectiles
    remaining_proj = []
    for proj in room["projectiles"]:
        proj["ttl"] -= dt
        proj["x"] += math.cos(proj["angle"]) * proj["speed"] * dt
        proj["y"] += math.sin(proj["angle"]) * proj["speed"] * dt
        exploded = proj["ttl"] <= 0
        if proj["x"] < 0 or proj["x"] > ARENA_W or proj["y"] < 0 or proj["y"] > ARENA_H:
            exploded = True
        if not exploded:
            for p in alive_players:
                if p["id"] == proj["owner"]:
                    continue
                dist = math.hypot(p["x"] - proj["x"], p["y"] - proj["y"])
                if dist < KART_RADIUS + proj["radius"]:
                    exploded = True
                    if p["shield"]:
                        p["shield"] = False
                    else:
                        dmg = 35 if proj["type"] == "missile" else 50
                        p["hp"] = max(0, p["hp"] - dmg)
                        p["speed"] *= -0.6
                        owner = room["players"].get(proj["owner"])
                        if owner:
                            owner["score"] += 10
                        if p["hp"] <= 0:
                            p["alive"] = False
                            p["hp"] = 0
                    break
        if not exploded:
            remaining_proj.append(proj)
    room["projectiles"] = remaining_proj

    # Kart-kart collision
    plist = alive_players
    for i in range(len(plist)):
        for j in range(i + 1, len(plist)):
            a, b = plist[i], plist[j]
            dx, dy = b["x"] - a["x"], b["y"] - a["y"]
            dist = math.hypot(dx, dy)
            min_dist = KART_RADIUS * 2
            if dist < min_dist and dist > 0.1:
                overlap = (min_dist - dist) / 2
                nx, ny = dx / dist, dy / dist
                a["x"] -= nx * overlap
                a["y"] -= ny * overlap
                b["x"] += nx * overlap
                b["y"] += ny * overlap
                # Exchange some speed
                rel = a["speed"] - b["speed"]
                a["speed"] -= rel * 0.5
                b["speed"] += rel * 0.5

    # Item pickup
    remaining_items = []
    for item in room["items"]:
        picked = False
        for p in alive_players:
            if p["item"] is None:
                dist = math.hypot(p["x"] - item["x"], p["y"] - item["y"])
                if dist < KART_RADIUS + 22:
                    p["item"] = item["type"]
                    picked = True
                    break
        if not picked:
            remaining_items.append(item)
    room["items"] = remaining_items

    # Check win condition
    if len(alive_players) <= 1 and len(room["players"]) > 1:
        room["state"] = "finished"


async def game_loop(code: str):
    last = time.time()
    while True:
        await asyncio.sleep(GAME_TICK)
        room = rooms.get(code)
        if not room or room["state"] not in ("playing", "finished"):
            break
        now = time.time()
        dt = min(now - last, 0.1)
        last = now
        if room["state"] == "playing":
            update_room(room, dt)
        # Broadcast state
        conns = room_connections.get(code, {})
        msg = build_state_msg(room)
        disconnected = []
        for pid, ws in list(conns.items()):
            try:
                await ws.send_text(msg)
            except Exception:
                disconnected.append(pid)
        for pid in disconnected:
            conns.pop(pid, None)
        if room["state"] == "finished":
            break


def build_state_msg(room: dict) -> str:
    players_out = []
    for p in room["players"].values():
        players_out.append({
            "id": p["id"], "name": p["name"], "color": p["color"],
            "x": round(p["x"], 1), "y": round(p["y"], 1),
            "angle": round(p["angle"], 3), "speed": round(p["speed"], 1),
            "hp": p["hp"], "score": p["score"], "item": p["item"],
            "shield": p["shield"], "boost": p["boost_timer"] > 0,
            "alive": p["alive"], "ready": p["ready"],
        })
    return json.dumps({
        "type": "state",
        "state": room["state"],
        "players": players_out,
        "items": room["items"],
        "projectiles": [
            {"id": pr["id"], "type": pr["type"],
             "x": round(pr["x"], 1), "y": round(pr["y"], 1)}
            for pr in room["projectiles"]
        ],
        "tick": room["tick"],
    })


async def broadcast_lobby(code: str):
    room = rooms.get(code)
    if not room:
        return
    conns = room_connections.get(code, {})
    msg = json.dumps({
        "type": "lobby",
        "players": [
            {"id": p["id"], "name": p["name"], "color": p["color"], "ready": p["ready"]}
            for p in room["players"].values()
        ],
        "host": room["host"],
        "code": room["code"],
        "name": room["name"],
    })
    for ws in list(conns.values()):
        try:
            await ws.send_text(msg)
        except Exception:
            pass


# ─── WebSocket ────────────────────────────────────────────────
@app.websocket("/ws/{code}/{player_id}")
async def ws_endpoint(websocket: WebSocket, code: str, player_id: str):
    await websocket.accept()
    room = rooms.get(code.upper())
    if not room or player_id not in room["players"]:
        await websocket.close(1008)
        return

    room_connections[code][player_id] = websocket
    await broadcast_lobby(code)

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "ready":
                room["players"][player_id]["ready"] = data.get("ready", True)
                # Auto-start if all ready and >= 2 players
                all_ready = all(p["ready"] for p in room["players"].values())
                if all_ready and len(room["players"]) >= 2 and room["state"] == "lobby":
                    room["state"] = "playing"
                    room["game_start_time"] = time.time()
                    task = asyncio.create_task(game_loop(code))
                    room_tasks[code] = task
                else:
                    await broadcast_lobby(code)

            elif msg_type == "keys":
                p = room["players"].get(player_id)
                if p:
                    p["keys"].update(data.get("keys", {}))

            elif msg_type == "start" and player_id == room["host"] and room["state"] == "lobby":
                if len(room["players"]) >= 1:
                    # Set all as ready and start
                    for p in room["players"].values():
                        p["ready"] = True
                    room["state"] = "playing"
                    room["game_start_time"] = time.time()
                    task = asyncio.create_task(game_loop(code))
                    room_tasks[code] = task

            elif msg_type == "chat":
                chat_msg = json.dumps({
                    "type": "chat",
                    "from": room["players"][player_id]["name"],
                    "text": str(data.get("text", ""))[:120],
                })
                for ws in list(room_connections.get(code, {}).values()):
                    try:
                        await ws.send_text(chat_msg)
                    except Exception:
                        pass

    except WebSocketDisconnect:
        pass
    finally:
        room_connections[code].pop(player_id, None)
        await broadcast_lobby(code)
