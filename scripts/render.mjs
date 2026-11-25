#!/usr/bin/env node
// render.mjs — a character + a voice-over → a lip-synced talking-head video (Remotion).
//   node scripts/render.mjs --character <dir|male|female> --audio <voice.wav|mp3|m4a> [--text script.txt] [--timeline cues.json]
//        [--format portrait|landscape|square] [--bg "#23263a"|transparent] [--scale 1] [--phonetic] [--out out.mp4]
//   node scripts/render.mjs --character <dir> --check [--out mouths.png]     lip-sync check sheet of every pose
// 1. voice → mono WAV at −16 LUFS (Host.jsx reads mouth openness from loudness on that scale)
// 2. Rhubarb → mouth cues, cached as <audio>.mouth.json; prints the phrase starts to hang pose changes on
// 3. timeline [{ "at": 0, "pose": "wave" }, …] → pose changes (default: "talk" all through)
// 4. npx remotion render TalkingHead → mp4 (transparent → ProRes 4444 .mov for overlaying in an editor)
import "./_node.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REMOTION = path.join(SKILL, "remotion");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : d; };
const file = (p) => p && path.resolve(String(p).replace(/^~/, os.homedir()));
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };
// where setup.sh / setup.ps1 put rhubarb, so it works without a PATH edit
const rhubarbDirs = [path.join(os.homedir(), ".local/bin"), path.join(os.homedir(), ".local/opt/rhubarb-1.14.0/Rhubarb-Lip-Sync-1.14.0-Windows")];
process.env.PATH = [...rhubarbDirs, process.env.PATH].join(path.delimiter);
const run = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, { stdio: "inherit", ...o });
  if (r.error) die(`${cmd} not found — run setup (setup.sh, or setup.ps1 on Windows)`);
  if (r.status !== 0) die(`${cmd} ${a[0]} failed`);
};

// ── character: host.json + <pose>.png → props.host, poses copied into a throwaway public dir ──
// --character male | female (the ready starters) | <your character dir>; left out → ask which starter
let pick = opt("character");
if (!pick) {
  if (!process.stdin.isTTY) die("--character male | female | <your character dir> — pick a ready starter or your own character");
  const rl = (await import("node:readline/promises")).createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("No --character given. Use the male or female starter? [m/f] ").catch(() => die("no character picked"));
  pick = /^f/i.test(answer) ? "female" : "male";
  rl.close();
}
const starter = path.join(SKILL, "starters", pick);
const charDir = /^[\w-]+$/.test(pick) && fs.existsSync(starter) ? starter : file(pick);
if (!charDir || !fs.existsSync(path.join(charDir, "host.json"))) die("--character <dir> needs a host.json — make the character first: node scripts/poses.mjs <dir>");
const pub = fs.mkdtempSync(path.join(os.tmpdir(), "talking-avatar-"));
process.on("exit", () => fs.rmSync(pub, { recursive: true, force: true }));
fs.mkdirSync(path.join(pub, "poses"));
const poses = {}, sizes = {};
for (const f of fs.readdirSync(charDir).filter((f) => f.endsWith(".png"))) {
  fs.copyFileSync(path.join(charDir, f), path.join(pub, "poses", f));
  const png = fs.readFileSync(path.join(charDir, f));
  sizes[f.slice(0, -4)] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  poses[f.slice(0, -4)] = `poses/${f}`;
}
if (!poses.idle) die(`${charDir} has no idle.png — idle is the fallback pose`);
// every pose is drawn in idle's frame (host.json is measured in it): flag any image that doesn't match
const size = sizes.idle;
const odd = Object.keys(sizes).filter((p) => sizes[p].join() !== size.join());
if (odd.length) console.warn(`  ! not ${size.join("×")} like idle.png: ${odd.map((p) => `${p} (${sizes[p].join("×")})`).join(", ")} — re-run scripts/poses.mjs`);
const host = { ...read(path.join(charDir, "host.json")), poses, size };

// npm is npm.cmd on Windows, which only runs through a shell (the args here have no spaces)
if (!fs.existsSync(path.join(REMOTION, "node_modules"))) run("npm", ["install", "--no-audit", "--no-fund"], { cwd: REMOTION, shell: process.platform === "win32" });
const propsFile = path.join(pub, "props.json");
const remotion = (a, props) => {
  fs.writeFileSync(propsFile, JSON.stringify(props));
  // the CLI's JS entry run by this node: no npx, no shell, same on every OS
  run(process.execPath, [path.join(REMOTION, "node_modules/@remotion/cli/remotion-cli.js"), ...a, `--props=${propsFile}`, `--public-dir=${pub}`, "--log=warn"], { cwd: REMOTION });
};

if (args.includes("--check")) {
  const out = file(opt("out", path.join(charDir, "check", "mouths.png")));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  remotion(["still", "src/index.jsx", "HostCheck", out], { host });
  console.log(`✓ ${out} — look at every face: mouth on the lip line (tilted heads too), lids over the eyes`);
  process.exit(0);
}

// ── voice → WAV at −16 LUFS ──
const audioIn = file(opt("audio"));
if (!audioIn || !fs.existsSync(audioIn)) die("--audio <voice file> missing");
const wav = path.join(pub, "voice.wav");
run("ffmpeg", ["-v", "error", "-y", "-i", audioIn, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", wav]);
const dur = parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], { encoding: "utf8" }).stdout);

// ── Rhubarb mouth cues (cached next to the audio; redone when the audio is newer, or the script text / --phonetic changed) ──
const text = file(opt("text"));
if (text && !fs.existsSync(text)) die(`--text ${text} not found`);
const phonetic = args.includes("--phonetic");
const key = createHash("sha256").update(`${phonetic}\0${text ? fs.readFileSync(text, "utf8") : ""}`).digest("hex").slice(0, 16);
const cache = audioIn.replace(/\.[^.]+$/, "") + ".mouth.json";
const fresh = fs.existsSync(cache) && fs.statSync(cache).mtimeMs > fs.statSync(audioIn).mtimeMs && read(cache).key === key;
if (!fresh) {
  console.log("· rhubarb: lip-sync cues (about real time)…");
  run("rhubarb", ["-q", "-f", "json", ...(phonetic ? ["-r", "phonetic"] : []), ...(text ? ["-d", text] : []), "-o", cache, wav]);
  fs.writeFileSync(cache, JSON.stringify({ key, ...read(cache) }));
}
const mouth = read(cache).mouthCues.map((m) => [Math.round(m.start * 100) / 100, m.value]);
// phrase starts = first speech, then speech after ≥ 0.3 s of silence (X) — the natural places to change pose
const first = mouth.findIndex((c) => c[1] !== "X");
const phrases = mouth.filter((c, k) => k === first || (k > first && c[1] !== "X" && mouth[k - 1][1] === "X" && c[0] - mouth[k - 1][0] >= 0.3)).map((c) => c[0]);
console.log(`· ${dur.toFixed(1)} s · phrases start at: ${phrases.join(" ")}`);

// ── pose timeline ──
const timeline = opt("timeline") ? read(file(opt("timeline"))) : [{ at: 0, pose: poses.talk ? "talk" : "idle" }];
for (const c of timeline) if (!poses[c.pose] && !poses[host.aliases?.[c.pose]]) console.warn(`  ! pose "${c.pose}" not in the character — shows idle. Poses: ${Object.keys(poses).join(" ")}`);
const cues = timeline.map((c) => ({ start: Number(c.at), host: c.pose })).sort((a, b) => a.start - b.start);

// ── render ──
const format = opt("format", "portrait");
const [width, height] = { portrait: [1080, 1920], landscape: [1920, 1080], square: [1080, 1080] }[format] || die(`--format ${format}: portrait | landscape | square`);
const bg = opt("bg", "#23263a"), transparent = bg === "transparent";
const out = file(opt("out", audioIn.replace(/\.[^.]+$/, "") + (transparent ? "-talking.mov" : "-talking.mp4")));
fs.mkdirSync(path.dirname(out), { recursive: true });
const t0 = Date.now();
remotion(
  ["render", "src/index.jsx", "TalkingHead", out, ...(transparent ? ["--codec=prores", "--prores-profile=4444", "--pixel-format=yuva444p10le", "--image-format=png"] : ["--crf=18"])],
  { fps: 30, width, height, durationInFrames: Math.ceil(dur * 30), host, cues, mouth, audio: "voice.wav", background: transparent ? null : bg, scale: Number(opt("scale", 1)) },
);
console.log(`✓ ${out} · ${dur.toFixed(1)} s · ${(fs.statSync(out).size / 1e6).toFixed(1)} MB · ${((Date.now() - t0) / 1000).toFixed(0)} s to render`);
