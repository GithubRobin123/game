import { GAME_CONFIG, clamp } from "./config";
import type { ExtendedImage, WorldState } from "./types";

export const drawWarehouseBackground = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = "#3f4246";
  ctx.fillRect(0, 0, GAME_CONFIG.world.width, GAME_CONFIG.world.height);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  const tile = 120;
  for (let x = 0; x < GAME_CONFIG.world.width; x += tile) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GAME_CONFIG.world.height); ctx.stroke();
  }
  for (let y = 0; y < GAME_CONFIG.world.height; y += tile) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GAME_CONFIG.world.width, y); ctx.stroke();
  }
  ctx.fillStyle = "#2b2e31";
  ctx.fillRect(0, 0, GAME_CONFIG.world.width, 50);
  ctx.fillRect(0, GAME_CONFIG.world.height - 50, GAME_CONFIG.world.width, 50);
  ctx.fillRect(0, 0, 50, GAME_CONFIG.world.height);
  ctx.fillRect(GAME_CONFIG.world.width - 50, 0, 50, GAME_CONFIG.world.height);
};

export const draw3DContainers = (ctx: CanvasRenderingContext2D, state: WorldState) => {
  state.containers.forEach((c) => {
    ctx.fillStyle = "#34516A";
    ctx.fillRect(c.x, c.y, c.w, c.h);

    ctx.fillStyle = "#496D89";
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + 12, c.y - 12);
    ctx.lineTo(c.x + c.w + 12, c.y - 12);
    ctx.lineTo(c.x + c.w, c.y);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = "#293B4C";
    ctx.beginPath();
    ctx.moveTo(c.x + c.w, c.y);
    ctx.lineTo(c.x + c.w + 12, c.y - 12);
    ctx.lineTo(c.x + c.w + 12, c.y + c.h - 12);
    ctx.lineTo(c.x + c.w, c.y + c.h);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 3;
    for (let x = c.x + 10; x < c.x + c.w; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, c.y); ctx.lineTo(x, c.y + c.h); ctx.stroke();
    }
  });
};

export const drawWeaponPickup = (
  ctx: CanvasRenderingContext2D,
  gunImgCache: Record<string, ExtendedImage>,
  px: number, py: number, weaponName: string
) => {
  const g = ctx.createRadialGradient(px, py, 6, px, py, 40);
  g.addColorStop(0, "rgba(255,215,0,0.6)");
  g.addColorStop(1, "rgba(255,215,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(px - 40, py - 40, 80, 80);

  const img = gunImgCache[weaponName];
  if (img && img._loaded && !img._broken && img.naturalWidth > 0) {
    try {
      ctx.drawImage(img, px - 40, py - 12, 80, 24);
    } catch { ctx.fillStyle = "#ddc241"; ctx.fillRect(px - 40, py - 10, 80, 20); }
  } else {
    ctx.fillStyle = "#ddc241"; ctx.fillRect(px - 40, py - 10, 80, 20);
  }

  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
  ctx.textAlign = "center"; ctx.font = "bold 12px Arial";
  ctx.strokeText(weaponName, px, py + 32); ctx.fillText(weaponName, px, py + 32);
};

export const drawAmmoBox = (ctx: CanvasRenderingContext2D, ax: number, ay: number) => {
  const gr = ctx.createRadialGradient(ax, ay, 6, ax, ay, 34);
  gr.addColorStop(0, "rgba(46,204,113,0.6)");
  gr.addColorStop(1, "rgba(46,204,113,0)");
  ctx.fillStyle = gr; ctx.fillRect(ax - 34, ay - 34, 68, 68);

  ctx.fillStyle = "#27ae60"; ctx.fillRect(ax - 20, ay - 14, 40, 28);
  ctx.strokeStyle = "#1f8a4b"; ctx.lineWidth = 3; ctx.strokeRect(ax - 20, ay - 14, 40, 28);
  ctx.fillStyle = "#fff"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center";
  ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.strokeText("AMMO", ax, ay + 30); ctx.fillText("AMMO", ax, ay + 30);
};

export const drawCharacter = (
  ctx: CanvasRenderingContext2D,
  gunImgCache: Record<string, ExtendedImage>,
  state: WorldState,
  x: number, y: number, rot: number,
  isPlayer: boolean, healthPct?: number, walkCycle = 0
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath(); ctx.ellipse(0, 30, 26, 10, 0, 0, Math.PI * 2); ctx.fill();

  const legOffset = Math.sin(walkCycle) * 6;
  ctx.fillStyle = "#2b2b30";
  ctx.fillRect(-16, 6 + legOffset, 14, 26);
  ctx.fillRect(2, 6 - legOffset, 14, 26);

  ctx.fillStyle = isPlayer ? "#2c3e50" : "#6d4c41";
  ctx.fillRect(-20, -14, 40, 40);

  ctx.strokeStyle = "#d6a475"; ctx.lineWidth = 8; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-18, -4); ctx.lineTo(-34, 8);
  ctx.moveTo(18, -4); ctx.lineTo(34, 8); ctx.stroke();

  if (isPlayer) {
    const img = gunImgCache[state.player.weapon.name];
    if (img && img._loaded && !img._broken && img.naturalWidth > 0) {
      try {
        ctx.save(); ctx.translate(18, -2); ctx.drawImage(img, -10, -8, 70, 20); ctx.restore();
      } catch {}
    } else {
      ctx.fillStyle = "#111"; ctx.fillRect(6, -6, 36, 8);
    }
  }

  ctx.fillStyle = "#e6c29b";
  ctx.beginPath(); ctx.arc(0, -28, 14, 0, Math.PI * 2); ctx.fill();

  if (isPlayer) {
    ctx.fillStyle = "#28343f";
    ctx.beginPath(); ctx.arc(0, -32, 15, Math.PI, 0); ctx.fill();
  }

  ctx.restore();

  if (typeof healthPct === "number") {
    ctx.fillStyle = "black"; ctx.fillRect(x - 32, y - 48, 64, 7);
    ctx.fillStyle = healthPct > 0.5 ? "#2ecc71" : "#e74c3c";
    ctx.fillRect(x - 32, y - 48, 64 * clamp(healthPct, 0, 1), 7);
  }
};
