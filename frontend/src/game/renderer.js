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
  const time = Date.now() / 1000;

  ctx.save();
  ctx.translate(-camX, -camY);

  // ── Background — checker floor + depth tint + moving spotlight ──
  const tileSize = 80;
  for (let tx = 0; tx < ARENA_W; tx += tileSize) {
    for (let ty = 0; ty < ARENA_H; ty += tileSize) {
      const isLight = (Math.floor(tx / tileSize) + Math.floor(ty / tileSize)) % 2 === 0;
      const depth = ty / ARENA_H;
      let c1 = isLight ? "#1a1a2e" : "#16213e";
      let c2 = isLight ? "#141428" : "#121c32";
      ctx.fillStyle = depth > 0.55 ? c2 : c1;
      ctx.fillRect(tx, ty, tileSize, tileSize);
    }
  }

  const depthShade = ctx.createLinearGradient(0, 0, 0, ARENA_H);
  depthShade.addColorStop(0, "rgba(255,255,255,0.06)");
  depthShade.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = depthShade;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  const spotX = ARENA_W * 0.5 + Math.sin(time * 0.35) * 120;
  const spotY = ARENA_H * 0.45 + Math.cos(time * 0.28) * 80;
  const spot = ctx.createRadialGradient(spotX, spotY, 40, spotX, spotY, 420);
  spot.addColorStop(0, "rgba(255, 71, 87, 0.09)");
  spot.addColorStop(0.45, "rgba(30, 144, 255, 0.04)");
  spot.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

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
    const bob = Math.sin(time * 4 + p.x * 0.01 + p.y * 0.01) * 1.2;
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.angle);

    const isMe = p.id === myId;
    const r = 18;

    // Shadow (offset for fake height)
    ctx.beginPath();
    ctx.ellipse(4, 7, r + 4, r - 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.38)";
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

    // Side skirt (dark, "3D" lower body)
    ctx.beginPath();
    ctx.roundRect(-r + 1, -r + 9, r * 2 - 2, r * 2 - 14, 5);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    // Kart top body — beveled gradient
    const grad = ctx.createRadialGradient(-6, -8, 3, 0, -2, r * 1.2);
    grad.addColorStop(0, lighten(p.color, 55));
    grad.addColorStop(0.55, p.color);
    grad.addColorStop(1, darkenHex(p.color, 35));
    ctx.beginPath();
    ctx.roundRect(-r, -r + 2, r * 2, r * 2 - 10, 7);
    ctx.fillStyle = grad;
    if (isMe) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 22;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // Front lip / bumper highlight
    ctx.beginPath();
    ctx.roundRect(r - 10, -r + 6, 12, r * 2 - 16, 3);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();

    // Cockpit bubble
    ctx.beginPath();
    ctx.ellipse(2, -2, 9, 7, 0, 0, Math.PI * 2);
    const cg = ctx.createRadialGradient(0, -4, 1, 2, -2, 10);
    cg.addColorStop(0, "rgba(255,255,255,0.45)");
    cg.addColorStop(0.6, "rgba(0,0,0,0.45)");
    cg.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = cg;
    ctx.fill();

    // Wheels with rim highlight
    const wpos = [[r - 1, -r + 5], [r - 1, r - 5], [-r + 1, -r + 5], [-r + 1, r - 5]];
    wpos.forEach(([wx, wy]) => {
      ctx.beginPath();
      ctx.ellipse(wx, wy, 5, 4, Math.PI / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#151515";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(wx * 0.98, wy * 0.98, 2.2, 1.8, Math.PI / 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fill();
    });

    // Direction arrow for self
    if (isMe) {
      ctx.beginPath();
      ctx.moveTo(r + 6, 0);
      ctx.lineTo(r + 15, -5);
      ctx.lineTo(r + 15, 5);
      ctx.closePath();
      ctx.fillStyle = "#fff";
      ctx.fill();
    }

    ctx.restore();

    // Name tag + HP bar (screen-space labels, follow bob)
    ctx.save();
    ctx.translate(p.x, p.y + bob);
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

function darkenHex(hex, amount) {
  const raw = hex.replace("#", "");
  const num = parseInt(raw, 16);
  if (Number.isNaN(num)) return "rgb(30,30,50)";
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `rgb(${r},${g},${b})`;
}
