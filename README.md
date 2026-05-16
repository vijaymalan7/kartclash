# 🏎️ KartClash — Multiplayer Kart Battle Game

A real-time browser-based multiplayer kart battle game inspired by SmashKarts.
Built with **FastAPI** (Python) backend and **React + Canvas** frontend.

---

## 🎮 Features

- **Room-based multiplayer** — Up to 10 players per room
- **Shareable room codes** — 6-character codes to invite friends
- **Share link** — One-click link sharing
- **Real-time physics** — Server-authoritative 30 tick/sec game loop
- **Items** — Boost ⚡, Bomb 💣, Shield 🛡️, Missile 🚀
- **Camera** — Follows your kart with smooth clamping
- **Minimap** — Top-down overview
- **HUD** — HP bar, score, item slot, boost/shield indicators
- **Chat** — In-lobby chat
- **Mobile touch** — D-pad + USE button for touchscreens
- **Browse rooms** — Join open rooms from the lobby list

---

## 🗂️ Project Structure

```
smashkart/
├── backend/
│   ├── main.py            # FastAPI server (REST + WebSocket)
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── App.jsx            # Root, screen router
        ├── App.css            # All UI styles
        ├── main.jsx
        ├── hooks/
        │   └── useGame.js     # WebSocket hook + API calls
        ├── game/
        │   └── renderer.js    # Canvas rendering engine
        └── components/
            ├── LandingScreen.jsx  # Home / Create / Join
            ├── LobbyScreen.jsx    # Waiting room
            └── GameScreen.jsx     # Live game + HUD
```

---

## 🚀 Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend runs at: http://localhost:8000
API docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
cp .env.example .env        # edit VITE_API_URL if needed
npm install
npm run dev
```

Frontend runs at: http://localhost:5173

---

## 🕹️ Controls

| Action      | Keys              |
|-------------|-------------------|
| Accelerate  | W / ↑             |
| Brake/Reverse | S / ↓           |
| Turn Left   | A / ←             |
| Turn Right  | D / →             |
| Use Item    | Space             |

---

## 🌐 Multiplayer Flow

```
Player A                        Player B
   │                               │
   ├─ Create Room ──► POST /rooms  │
   │  Gets code: "ABC123"          │
   │                               │
   ├─ Shares code to Player B ────►│
   │                               ├─ POST /rooms/ABC123/join
   │                               │
   ├─ WS /ws/ABC123/{pidA} ◄──────►├─ WS /ws/ABC123/{pidB}
   │                               │
   ├─ Ready Up ──────────────────► │
   │ ◄────────────────── Ready Up ─┤
   │                               │
   └──────── Game Starts (auto) ───┘
             30 tick/sec game loop
             Server broadcasts state
             Clients send key inputs
```

---

## 🧱 API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/rooms` | Create room |
| GET | `/rooms` | List open rooms |
| GET | `/rooms/{code}` | Room info |
| POST | `/rooms/{code}/join` | Join room |
| WS | `/ws/{code}/{player_id}` | Real-time game |

### WebSocket Messages (Client → Server)

```json
{ "type": "ready", "ready": true }
{ "type": "start" }
{ "type": "keys", "keys": { "up": true, "left": false, ... } }
{ "type": "chat", "text": "Hello!" }
```

### WebSocket Messages (Server → Client)

```json
{ "type": "lobby", "players": [...], "host": "...", "code": "..." }
{ "type": "state", "state": "playing", "players": [...], "items": [...] }
{ "type": "chat", "from": "PlayerName", "text": "Hello!" }
```

---

## 🎯 Game Mechanics

### Items
| Item | Effect |
|------|--------|
| ⚡ Boost | 1.8× speed for 3 seconds |
| 🛡️ Shield | Blocks 1 hit |
| 💣 Bomb | Lobs explosive (50 damage) |
| 🚀 Missile | Fires projectile (35 damage) |

### Damage & HP
- All karts start with 100 HP
- Bomb: 50 damage
- Missile: 35 damage
- Shield absorbs one hit completely
- Eliminated kart becomes a ghost 💀

### Win Condition
- Last kart alive wins
- Score tracked by eliminations

---

## 🚢 Deployment

### Backend (e.g. Railway / Render)
```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend (e.g. Vercel / Netlify)
```bash
npm run build
# set VITE_API_URL=https://your-backend.railway.app
```

---

## 📦 Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11+, FastAPI, WebSockets, asyncio |
| Frontend | React 18, Vite, HTML5 Canvas |
| Physics | Custom 2D physics (server-side) |
| Styling | Pure CSS with CSS variables |
| Fonts | Press Start 2P, Exo 2 (Google Fonts) |

---

## 🔧 Configuration

Edit `backend/main.py` constants to tune gameplay:
```python
ARENA_W, ARENA_H = 1200, 800     # Arena size
KART_SPEED = 220                 # Max speed
KART_ROT_SPEED = 3.2             # Turn rate
MAX_PLAYERS = 10                 # Players per room
ITEM_SPAWN_INTERVAL = 8          # Seconds between items
GAME_TICK = 1 / 30               # Server tick rate
```




#---------------------------------------
to create docker image for backed :
docker build -t smashkart-backend .

run command:
docker run -p 8000:8000 smashkart-backend


#-----------------------------
to run the entire application with one command with backend and frontend
docker compose up