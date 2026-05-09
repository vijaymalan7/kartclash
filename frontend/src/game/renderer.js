// src/game/renderer.js
const ARENA_W = 1200;
const ARENA_H = 800;

const ITEM_COLORS = {
  boost: "#FFD700",
  bomb: "#FF4757",
  shield: "#2ED573",
  missile: "#FF6B81",
};

const ITEM_ICONS = {
  boost: "⚡",
  bomb: "💣",
  shield: "🛡️",
  missile: "🚀",
};

export function renderGame(ctx, gameState, myId, cameraRef) {
  const { players = [], items = [], projectiles = [] } = gameState;
  const me = players.find((p) => p.id === myId);

  // Camera follows local player
  let camX = 0, camY = 0;
  if (me) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    camX = me.x - cw / 2;
    camY = me.y - ch / 2;
    // Clamp
    camX = Math.max(0, Math.min(camX, ARENA_W - cw));
    camY = Math.max(0, Math.min(camY, ARENA_H - ch));
  }
  if (cameraRef) {
    cameraRef.x = camX;
    cameraRef.y = camY;
  }

  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;

  ctx.save();
  ctx.translate(-camX, -camY);

  // ── Background ──────────────────────────────────────────────
  // Checkered race floor
  const tileSize = 80;
  for (let tx = 0; tx < ARENA_W; tx += tileSize) {
    for (let ty = 0; ty < ARENA_H; ty += tileSize) {
      const isLight = (Math.floor(tx / tileSize) + Math.floor(ty / tileSize)) % 2 === 0;
      ctx.fillStyle = isLight ? "#1a1a2e" : "#16213e";
      ctx.fillRect(tx, ty, tileSize, tileSize);
    }
  }

  // Arena border glow
  ctx.strokeStyle = "#FF4757";
  ctx.lineWidth = 8;
  ctx.shadowColor = "#FF4757";
  ctx.shadowBlur = 20;
  ctx.strokeRect(4, 4, ARENA_W - 8, ARENA_H - 8);
  ctx.shadowBlur = 0;

  // Inner track lines
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx < ARENA_W; gx += tileSize) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, ARENA_H);
    ctx.stroke();
  }
  for (let gy = 0; gy < ARENA_H; gy += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(ARENA_W, gy);
    ctx.stroke();
  }

  // ── Obstacles / decorative pillars ──────────────────────────
  const pillars = [
    [300, 300, 30], [600, 200, 25], [900, 300, 30],
    [300, 500, 30], [600, 600, 25], [900, 500, 30],
    [150, 400, 20], [1050, 400, 20],
  ];
  pillars.forEach(([px, py, pr]) => {
    const grad = ctx.createRadialGradient(px - 5, py - 5, 2, px, py, pr);
    grad.addColorStop(0, "#4a4a6a");
    grad.addColorStop(1, "#1a1a2e");
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#5555aa";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // ── Items ────────────────────────────────────────────────────
  items.forEach((item) => {
    const pulse = Math.sin(Date.now() / 300) * 4;
    ctx.save();
    ctx.translate(item.x, item.y);

    // Glow ring
    ctx.beginPath();
    ctx.arc(0, 0, 18 + pulse, 0, Math.PI * 2);
    ctx.strokeStyle = ITEM_COLORS[item.type] || "#fff";
    ctx.lineWidth = 3;
    ctx.shadowColor = ITEM_COLORS[item.type];
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Icon
    ctx.font = "20px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ITEM_ICONS[item.type] || "?", 0, 0);
    ctx.restore();
  });

  // ── Projectiles ──────────────────────────────────────────────
  projectiles.forEach((proj) => {
    ctx.save();
    ctx.translate(proj.x, proj.y);
    if (proj.type === "missile") {
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#FF6B81";
      ctx.shadowColor = "#FF6B81";
      ctx.shadowBlur = 20;
      ctx.fill();
    } else {
      ctx.font = "22px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💣", 0, 0);
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  });

  // ── Karts ────────────────────────────────────────────────────
  players.forEach((p) => {
    if (!p.alive) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    const isMe = p.id === myId;
    const r = 18;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(3, 5, r + 2, r - 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();

    // Shield aura
    if (p.shield) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "#2ED573";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#2ED573";
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Boost trail
    if (p.boost) {
      for (let i = 0; i < 3; i++) {
        const dist = 20 + i * 12;
        ctx.beginPath();
        ctx.arc(-dist, 0, 5 - i, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,215,0,${0.6 - i * 0.2})`;
        ctx.fill();
      }
    }

    // Kart body
    const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, r);
    grad.addColorStop(0, lighten(p.color, 40));
    grad.addColorStop(1, p.color);
    ctx.beginPath();
    ctx.roundRect(-r, -r + 4, r * 2, r * 2 - 8, 6);
    ctx.fillStyle = grad;
    if (isMe) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 20;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cockpit
    ctx.beginPath();
    ctx.ellipse(2, 0, 8, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();

    // Wheels
    [[r - 2, -r + 4], [r - 2, r - 4], [-r + 2, -r + 4], [-r + 2, r - 4]].forEach(([wx, wy]) => {
      ctx.beginPath();
      ctx.ellipse(wx, wy, 5, 4, Math.PI / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#222";
      ctx.fill();
    });

    // Direction arrow for self
    if (isMe) {
      ctx.beginPath();
      ctx.moveTo(r + 6, 0);
      ctx.lineTo(r + 14, -5);
      ctx.lineTo(r + 14, 5);
      ctx.closePath();
      ctx.fillStyle = "#fff";
      ctx.fill();
    }

    ctx.restore();

    // Name tag + HP bar (screen-space labels)
    ctx.save();
    ctx.translate(p.x, p.y);
    const labelY = -r - 22;

    // HP bar bg
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(-22, labelY - 4, 44, 6);
    ctx.fillStyle = p.hp > 50 ? "#2ED573" : p.hp > 25 ? "#FFD700" : "#FF4757";
    ctx.fillRect(-22, labelY - 4, (44 * p.hp) / 100, 6);

    // Name
    ctx.font = `bold ${isMe ? 13 : 11}px 'Press Start 2P', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isMe ? "#FFD700" : "#fff";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(p.name.slice(0, 8), 0, labelY - 14);
    ctx.shadowBlur = 0;

    // Held item icon
    if (p.item) {
      ctx.font = "14px serif";
      ctx.fillText(ITEM_ICONS[p.item], 0, labelY - 28);
    }
    ctx.restore();
  });

  // Dead player ghost
  players.filter(p => !p.alive).forEach((p) => {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.translate(p.x, p.y);
    ctx.font = "28px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💀", 0, 0);
    ctx.restore();
  });

  ctx.restore(); // end camera transform
}

function lighten(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}
