// Procedural Canvas2D print artwork textures (zero external 404 assets)
// Every phone feed, falling broadsheet headline, server rack panel, and barcode monolith
// has finished editorial print artwork rather than flat colored rectangles.

import * as THREE from "three";

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  return [canvas, ctx];
}

function finalizeTexture(canvas: HTMLCanvasElement, repeatY = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = repeatY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Infinite social feed card texture for the glowing smartphone monolith and Bottomless Shaft walls.
 */
export function createFeedScreenTexture(variant: "cyan" | "magenta" | "angry"): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 1024);

  const bg = variant === "angry" ? "#1c0910" : variant === "magenta" ? "#160a1f" : "#0a1628";
  const accent = variant === "angry" ? "#ff1e56" : variant === "magenta" ? "#ff1e6e" : "#00d4ff";
  const accent2 = variant === "angry" ? "#ffd600" : "#ffd600";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 1024);

  // Subtle status bar
  ctx.fillStyle = "#f3ede0";
  ctx.font = "bold 24px monospace";
  ctx.fillText("03:00 AM", 28, 44);
  ctx.fillStyle = accent;
  ctx.fillText("LIVE FEED ●", 340, 44);

  // 4 stacked editorial social media cards
  const headlines =
    variant === "angry"
      ? ["OUTRAGE ALERT", "THEY LIED AGAIN", "WATCH NOW!", "BREAKING CRISIS"]
      : ["BREAKING NEWS", "JUST FOR YOU", "TRENDING NOW", "DON'T MISS THIS"];

  for (let i = 0; i < 4; i++) {
    const y = 78 + i * 230;
    ctx.fillStyle = "#f3ede0";
    ctx.fillRect(24, y, 464, 206);

    // Bold top bar
    ctx.fillStyle = i % 2 === 0 ? accent : "#101420";
    ctx.fillRect(24, y, 464, 46);

    ctx.fillStyle = i % 2 === 0 ? "#0a0d16" : accent2;
    ctx.font = "900 26px sans-serif";
    ctx.fillText(headlines[i], 40, y + 32);

    // Graphic media thumbnail block with diagonal halftone stripes
    ctx.fillStyle = i % 2 === 0 ? "#122442" : "#3a0e29";
    ctx.fillRect(40, y + 60, 220, 126);
    ctx.fillStyle = accent;
    for (let d = 0; d < 7; d++) {
      ctx.beginPath();
      ctx.arc(65 + d * 28, y + 123 + Math.sin(d + i) * 26, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fake article copy bars
    ctx.fillStyle = "#161a26";
    ctx.fillRect(278, y + 64, 190, 18);
    ctx.fillRect(278, y + 92, 165, 14);
    ctx.fillRect(278, y + 114, 180, 14);

    // Heart & engagement counter
    ctx.fillStyle = "#ff1e6e";
    ctx.beginPath();
    ctx.arc(294, y + 162, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#101420";
    ctx.font = "bold 22px monospace";
    ctx.fillText(`${(i + 2) * 14}.${i + 3}K`, 318, y + 170);
  }

  return finalizeTexture(canvas, true);
}

/**
 * Vintage newsprint tabloid broadsheet texture for "Headlines falling like the rain" and Angry Breakdown.
 */
export function createHeadlineSheetTexture(seedIdx: number, angry = false): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 640);

  ctx.fillStyle = angry ? "#fff0d6" : "#f3ede0";
  ctx.fillRect(0, 0, 512, 640);

  // Heavy comic ink border
  ctx.strokeStyle = "#0a0c14";
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 492, 620);

  // Masthead banner
  ctx.fillStyle = angry ? "#ff1e56" : seedIdx % 2 === 0 ? "#0a0c14" : "#00b4e6";
  ctx.fillRect(24, 26, 464, 86);

  const titles = angry
    ? ["FEAR SELLS", "OUTRAGE!!", "BAD NEWS", "CLICK NOW"]
    : ["BREAKING", "TRAGEDY", "3:00 A.M.", "SCROLL ON"];
  ctx.fillStyle = angry ? "#ffd600" : "#f3ede0";
  ctx.font = "900 62px sans-serif";
  ctx.fillText(titles[seedIdx % titles.length], 40, 90);

  // Bold editorial illustration box
  ctx.fillStyle = angry ? "#1a0a14" : "#10203a";
  ctx.fillRect(28, 132, 456, 230);

  // Graphic circular target / eye motif inside the news photo
  ctx.fillStyle = angry ? "#ff1e6e" : "#00d4ff";
  ctx.beginPath();
  ctx.arc(256, 247, 84, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd600";
  ctx.beginPath();
  ctx.arc(256, 247, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0c14";
  ctx.beginPath();
  ctx.arc(256, 247, 18, 0, Math.PI * 2);
  ctx.fill();

  // Multi-column newspaper text blocks
  ctx.fillStyle = "#141824";
  for (let col = 0; col < 2; col++) {
    const cx = 32 + col * 234;
    for (let row = 0; row < 9; row++) {
      const rw = row === 8 ? 140 : 210 - ((row * 37 + col * 19) % 36);
      ctx.fillRect(cx, 386 + row * 24, rw, 12);
    }
  }

  return finalizeTexture(canvas, false);
}

/**
 * Industrial server rack front-face texture with Cyan/Yellow LED status grids for Desert Server Cathedral.
 */
export function createServerRackTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 512);
  ctx.fillStyle = "#162030";
  ctx.fillRect(0, 0, 256, 512);

  for (let row = 0; row < 16; row++) {
    const y = 10 + row * 31;
    ctx.fillStyle = "#0c121e";
    ctx.fillRect(14, y, 228, 24);
    // Vent slats
    ctx.fillStyle = "#263850";
    ctx.fillRect(22, y + 6, 136, 4);
    ctx.fillRect(22, y + 14, 136, 4);
    // Indicator LEDs (Cyan & Yellow/Magenta)
    for (let led = 0; led < 4; led++) {
      const on = (row * 7 + led * 3) % 5 !== 0;
      ctx.fillStyle = !on ? "#1d2738" : led === 3 && row % 3 === 0 ? "#ff1e6e" : led % 2 === 0 ? "#00d4ff" : "#ffd600";
      ctx.fillRect(174 + led * 16, y + 7, 10, 10);
    }
  }
  return finalizeTexture(canvas, true);
}

/**
 * Bold monochrome + Yellow/Magenta barcode monolith texture for "I'm not the customer, I'm the product".
 */
export function createBarcodeTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = "#f3ede0";
  ctx.fillRect(0, 0, 512, 512);

  // Header price tag stripe
  ctx.fillStyle = "#ffd600";
  ctx.fillRect(0, 0, 512, 92);
  ctx.fillStyle = "#0a0c14";
  ctx.font = "900 44px monospace";
  ctx.fillText("USER #004921 // PROFIT", 24, 60);

  // Deterministic crisp barcode bars
  let x = 28;
  for (let i = 0; i < 42 && x < 484; i++) {
    const w = 4 + ((i * 17 + 5) % 14);
    if (i % 2 === 0) {
      ctx.fillStyle = i % 10 === 0 ? "#ff1e6e" : "#0a0c14";
      ctx.fillRect(x, 120, w, 310);
    }
    x += w + 3;
  }

  ctx.fillStyle = "#0a0c14";
  ctx.font = "bold 30px monospace";
  ctx.fillText("0  98412  00300  7", 96, 476);

  return finalizeTexture(canvas, false);
}
