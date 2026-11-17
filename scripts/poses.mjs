#!/usr/bin/env node
// poses.mjs — turn generated pose images into a ready character: cut-outs + measured mouth and eyes in host.json.
//   node scripts/poses.mjs <character-dir> [--from <dir>] [--prefix <p>] [--only idle,talk] [--keep-bg]
// For every pose in <character-dir>/poses.json (else the skill's poses.json) with an image <from>/<prefix><pose>.png
// (default <character-dir>/raw/<pose>.png):
//   1. cut the background  → full/<pose>.png   (npx hyperframes@0.9.12 remove-background, local model, on demand;
//                                               --keep-bg when the images are already transparent)
//   2. resize to 720 px     → <pose>.png
//   3. trace the lip parting line → mouth [x, y, width, tilt°, smile sag] and find the eye whites (blink lids)
//   4. merge into host.json (poses listed in host.json "locked" keep their hand-tuned x, y, width)
//   5. write <character-dir>/check/sheet.png: every face zoomed with the mouth (red) and eyes (blue) boxed — LOOK at it.
import "./_node.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : d; };
if (!args[0] || args[0].startsWith("--")) { console.error("usage: node scripts/poses.mjs <character-dir> [--from <dir>] [--prefix <p>] [--only a,b] [--keep-bg]"); process.exit(1); }
const HOST = path.resolve(args[0].replace(/^~/, os.homedir()));
const posesFile = [path.join(HOST, "poses.json"), path.join(SKILL, "poses.json")].find((f) => fs.existsSync(f));
const from = (opt("from", path.join(HOST, "raw"))).replace(/^~/, os.homedir()), prefix = opt("prefix", "");
const only = opt("only") ? new Set(opt("only").split(",")) : null;
const run = (cmd, a, o = {}) => { const r = spawnSync(cmd, a, { encoding: "buffer", maxBuffer: 1 << 28, ...o }); if (r.status !== 0) throw new Error(`${cmd} failed: ${String(r.stderr).slice(0, 300)}`); return r.stdout; };
const W = 720;

/** RGBA pixels of a PNG via ffmpeg */
const pixels = (file) => { const buf = run("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"]); return { buf, h: buf.length / (W * 4) }; };

function measure(file) {
  const { buf, h } = pixels(file);
  const at = (x, y) => { const i = 4 * (y * W + x); return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]; };
  const lip = ([r, g, b, a]) => a > 200 && r > 195 && g < 150 && ((b > 88 && r - g > 70) || (b > 65 && r - g > 105)); // pink lips, or orange-toned lips (shrug)
  const dark = ([r, g, b, a]) => a > 200 && r < 70 && g < 55 && b < 45;
  const white = ([r, g, b, a]) => a > 200 && r > 225 && g > 225 && b > 225;
  // 1. lips: rows in the lower face with a long run of lip pixels
  const rows = [];
  for (let y = Math.round(h * 0.38); y < Math.round(h * 0.68); y++) {
    let best = null, st = null;
    for (let x = 200; x <= 520; x++) {
      const on = lip(at(x, y));
      if (on && st === null) st = x;
      if ((!on || x === 520) && st !== null) { const en = on ? x : x - 1; if (!best || en - st > best[1] - best[0]) best = [st, en]; st = null; }
    }
    if (best && best[1] - best[0] >= 25) rows.push([y, best[0], best[1]]);
  }
  if (rows.length < 4) return { error: "lips not found (mouth hidden? draw it by hand)" };
  const lipTop = rows[0][0], lipBot = rows[rows.length - 1][0];
  const lipX = Math.round(rows.reduce((s, r) => s + (r[1] + r[2]) / 2, 0) / rows.length);
  // 2. lip line, TRACED (tilted and turned heads need it — a flat mouth on a slanted lip line reads as a second,
  //    crooked mouth). Seed = darkest pixel between the top of the upper lip and the bottom of the lower lip in the
  //    lip-centre column (never in the moustache), then follow the dark parting line left and right (±4 px per
  //    column) until no lip pixels are near = the lip corners. A quadratic fit through the trace gives the corners →
  //    centre, width and tilt (angle), and how far the middle sags below the corner line (the smile curve).
  const lum = (x, y) => { const [r, g, b] = at(x, y); return r + g + b; };
  const darkest = (x, y0, y1) => { let yb = y0, bv = 1e9; for (let y = y0; y <= y1; y++) { const v = lum(x, y); if (v < bv) { bv = v; yb = y; } } return yb; };
  const lipYs = []; for (let y = lipTop - 4; y <= lipBot + 4; y++) if (lip(at(lipX, y))) lipYs.push(y);
  if (lipYs.length < 3) return { error: "lip centre column has no lips (mouth hidden? set it by hand and lock it)" };
  const seed = darkest(lipX, lipYs[0], lipYs[lipYs.length - 1]);
  const follow = (step) => {
    const pts = []; let y = seed;
    for (let x = lipX + step; Math.abs(x - lipX) < 160; x += step) {
      const yb = darkest(x, y - 4, y + 4);
      let near = 0; for (let yy = yb - 9; yy <= yb + 9; yy++) if (lip(at(x, yy))) near++;
      if (near < 2) break; // past the lip corner
      pts.push([x, yb]); y = yb;
    }
    return pts;
  };
  let pts = [...follow(-1).reverse(), [lipX, seed], ...follow(1)];
  if (pts.length < 40) return { error: `lip line traced over only ${pts.length} px — set it by hand and lock it` };
  // least-squares y = a·d² + b·d + c (d = x − lipX), twice, dropping points > 3 px off the curve
  const quad = (P) => {
    const S = Array(5).fill(0), T = Array(3).fill(0);
    for (const [x, y] of P) { const d = x - lipX; for (let k = 0; k < 5; k++) S[k] += d ** k; for (let k = 0; k < 3; k++) T[k] += y * d ** k; }
    const M = [[S[4], S[3], S[2], T[2]], [S[3], S[2], S[1], T[1]], [S[2], S[1], S[0], T[0]]];
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const f = M[j][i] / M[i][i]; for (let k = i; k < 4; k++) M[j][k] -= f * M[i][k]; }
    const c = M[2][3] / M[2][2], b = (M[1][3] - M[1][2] * c) / M[1][1], a = (M[0][3] - M[0][2] * c - M[0][1] * b) / M[0][0];
    return (x) => a * (x - lipX) ** 2 + b * (x - lipX) + c;
  };
  let f = quad(pts);
  for (let k = 0; k < 2; k++) { pts = pts.filter(([x, y]) => Math.abs(y - f(x)) <= 3); f = quad(pts); }
  const xL = pts[0][0], xR = pts[pts.length - 1][0], yL = f(xL), yR = f(xR);
  const ang = Math.atan2(yR - yL, xR - xL), cx = (xL + xR) / 2, cy = (yL + yR) / 2;
  const sag = (f(cx) - cy) * Math.cos(ang), span = Math.hypot(xR - xL, yR - yL);
  const r1 = (v) => Math.round(v * 10) / 10;
  // mouth = [x, y, width, angle°, sag px]: centre between the corners, width 92 % of corner-to-corner (the drawn
  // opening ends just inside the drawn lip corners, so the original parting line carries on to the corners)
  const mouth = [Math.round(cx), Math.round(cy), Math.round(0.92 * span), r1((ang * 180) / Math.PI), r1(sag)];
  const mx = mouth[0], lineY = mouth[1];
  // 5. eyes: white sclera boxes left/right of mx, 80–190 px above the lip line. Only white deep INSIDE the
  //    character counts (the sticker outline is white too), and a box bigger than a real eye is rejected —
  //    closed or covered eyes (laugh, celebrate, facepalm) then get no blink lid, which is right.
  const inside = (x, y) => [[-12, 0], [12, 0], [0, -12], [0, 12]].every(([dx, dy]) => at(x + dx, y + dy)[3] > 200);
  // Each side's white pixels are split into blobs (4-connected). One eye = the blobs at the same height within an
  // iris-width gap (the iris splits the white into two halves); the biggest eye-shaped group wins. A highlight or a
  // second white patch in the window must not merge with the eye into one huge half-empty box (that dropped an eye
  // on `no` and `magnifier`, so they blinked one eye = looked like a wink).
  const eyes = [];
  for (const side of [-1, 1]) {
    const X0 = side < 0 ? mx - 140 : mx + 10, X1 = side < 0 ? mx - 10 : mx + 140, Y0 = Math.max(0, lineY - 190), Y1 = lineY - 81;
    const on = new Set();
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (white(at(x, y)) && inside(x, y)) on.add(y * W + x);
    const blobs = [];
    for (const s0 of on) {
      const stack = [s0]; let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; on.delete(s0);
      while (stack.length) {
        const q = stack.pop(), x = q % W, y = (q - x) / W; n++;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (const nb of [q - 1, q + 1, q - W, q + W]) if (on.has(nb)) { on.delete(nb); stack.push(nb); }
      }
      if (n >= 15) blobs.push({ n, x0, x1, y0, y1, cy: (y0 + y1) / 2 });
    }
    blobs.sort((a, b) => b.n - a.n);
    let best = null;
    for (const seed of blobs.slice(0, 4)) {
      const g = blobs.filter((b) => Math.abs(b.cy - seed.cy) <= 14 && b.x0 - seed.x1 <= 45 && seed.x0 - b.x1 <= 45);
      const n = g.reduce((t, b) => t + b.n, 0), x0 = Math.min(...g.map((b) => b.x0)), x1 = Math.max(...g.map((b) => b.x1)), y0 = Math.min(...g.map((b) => b.y0)), y1 = Math.max(...g.map((b) => b.y1));
      const fill = n / Math.max(1, (x1 - x0) * (y1 - y0));
      if (n < 60 || x1 - x0 > 95 || y1 - y0 > 55 || x1 - x0 < 25 || fill < 0.22) continue; // not eye-shaped (an eye incl. its iris fills ≥ 22 %; a stray merged patch ≈ 13 %)
      if (!best || n > best.n) best = { n, box: [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2), x1 - x0 + 6, y1 - y0 + 6] };
    }
    if (best) eyes.push(best.box);
  }
  // skin = between the eyes (nose bridge), averaged 5×5 — the blink lids are painted in it
  let skin = null;
  if (eyes.length === 2) {
    const sx = Math.round((eyes[0][0] + eyes[1][0]) / 2), sy = Math.round((eyes[0][1] + eyes[1][1]) / 2), c = [0, 0, 0];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) at(sx + dx, sy + dy).slice(0, 3).forEach((v, k) => (c[k] += v / 25));
    skin = "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  }
  return { mouth, eyes, skin, lips: [lipTop, lipBot] };
}

const doc = JSON.parse(fs.readFileSync(posesFile, "utf8"));
const hostFile = path.join(HOST, "host.json");
const host = fs.existsSync(hostFile) ? JSON.parse(fs.readFileSync(hostFile, "utf8")) : {};
host.mouth ||= {}; host.eyes ||= {};
const locked = new Set(host.locked || []);
fs.mkdirSync(path.join(HOST, "full"), { recursive: true });
const checkDir = path.join(HOST, "check");
fs.mkdirSync(checkDir, { recursive: true });
const tiles = [];
for (const { name: pose } of doc.poses) {
  if (only && !only.has(pose)) continue;
  const src = path.join(from, `${prefix}${pose}.png`), full = path.join(HOST, "full", `${pose}.png`), out = path.join(HOST, `${pose}.png`);
  if (fs.existsSync(src) && (!fs.existsSync(full) || fs.statSync(full).mtimeMs < fs.statSync(src).mtimeMs)) {
    if (args.includes("--keep-bg")) fs.copyFileSync(src, full);
    else if (process.platform === "win32") // npx is npx.cmd: needs a shell, so quote the paths ourselves
      run(["npx", "--yes", "hyperframes@0.9.12", "remove-background", `"${src}"`, "-o", `"${full}"`].join(" "), [], { stdio: ["ignore", "ignore", "pipe"], shell: true });
    else run("npx", ["--yes", "hyperframes@0.9.12", "remove-background", src, "-o", full], { stdio: ["ignore", "ignore", "pipe"] });
    run("ffmpeg", ["-v", "error", "-y", "-i", full, "-vf", `scale=${W}:-1:flags=lanczos`, "-pix_fmt", "rgba", out]);
  }
  if (!fs.existsSync(out)) { console.log(`· ${pose}: no image yet (${path.relative(os.homedir(), src)})`); continue; }
  const m = measure(out);
  if (m.error) { console.log(`! ${pose}: ${m.error}`); continue; }
  // locked = hand-tuned x, y, width (kept); tilt + smile curve always come from the trace
  if (!host.skinColor && m.skin) host.skinColor = m.skin; // blink lids are painted in this colour
  if (!locked.has(pose)) { host.mouth[pose] = m.mouth; if (m.eyes.length) host.eyes[pose] = m.eyes; else delete host.eyes[pose]; }
  else host.mouth[pose] = [...host.mouth[pose].slice(0, 3), m.mouth[3], m.mouth[4]];
  const [mx, my, mw] = host.mouth[pose];
  console.log(`✓ ${pose.padEnd(13)} mouth ${JSON.stringify(host.mouth[pose])}${locked.has(pose) ? " (locked)" : ""} · eyes ${m.eyes.length} · lips ${m.lips.join("–")}`);
  // check tile: face crop (2×) with mouth (red) and eye (blue) boxes
  const boxes = [`drawbox=x=${mx - mw / 2}:y=${my - 4}:w=${mw}:h=8:c=red@0.9:t=2`, `drawbox=x=${mx - 1}:y=${my - 40}:w=2:h=56:c=red@0.9:t=fill`, ...(host.eyes[pose] || []).map(([ex, ey, ew, eh]) => `drawbox=x=${ex - ew / 2}:y=${ey - eh / 2}:w=${ew}:h=${eh}:c=blue@0.8:t=2`)];
  const tile = path.join(checkDir, `${pose}.png`);
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xdddddd:s=720x900", "-i", out, "-filter_complex", `[0][1]overlay,${boxes.join(",")},crop=320:300:${Math.max(0, mx - 160)}:${Math.max(0, my - 220)},scale=320:300`, "-frames:v", "1", tile]);
  tiles.push(tile);
}
fs.writeFileSync(hostFile, JSON.stringify(host, null, 2) + "\n");
const sheet = path.join(checkDir, "sheet.png");
if (tiles.length === 1) fs.copyFileSync(tiles[0], sheet); // xstack needs ≥ 2 inputs
else if (tiles.length) {
  const cols = Math.min(5, tiles.length), rowsN = Math.ceil(tiles.length / cols);
  const ins = tiles.flatMap((t) => ["-i", t]);
  for (let i = tiles.length; i < cols * rowsN; i++) ins.push("-f", "lavfi", "-i", "color=c=0x222222:s=320x300");
  const layout = Array.from({ length: cols * rowsN }, (_, i) => `${(i % cols) * 320}_${Math.floor(i / cols) * 300}`).join("|");
  run("ffmpeg", ["-v", "error", "-y", ...ins, "-filter_complex", `xstack=inputs=${cols * rowsN}:layout=${layout}`, "-frames:v", "1", sheet]);
}
if (tiles.length) console.log(`\n✓ host.json updated · check sheet: ${sheet} (red = mouth line + centre, blue = blink lids) — look before rendering`);
