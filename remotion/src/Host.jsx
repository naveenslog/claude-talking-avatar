// The talking host: PNG poses (library/host/<name>) + a mouth drawn on the measured lip line.
// Mouth = Rhubarb viseme (shape: how wide / round) × voice loudness (how open), smoothed over 3 frames,
// so it eases between shapes like the reference reel instead of snapping. Blinks, phrase tilts, a talking nod.
import React, { useId } from "react";
import { interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData } from "@remotion/media-utils";

const OPEN = { A: 0.08, B: 0.3, C: 0.6, D: 0.95, E: 0.68, F: 0.42, G: 0.22, H: 0.5, X: 0 };
const WIDE = { A: 0.95, B: 1, C: 0.95, D: 1, E: 0.72, F: 0.52, G: 1, H: 0.9, X: 1 };

const cueAt = (cues, t) => {
  let lo = 0, hi = cues.length - 1, ans = "X";
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (cues[mid][0] <= t) { ans = cues[mid][1]; lo = mid + 1; } else hi = mid - 1; }
  return ans;
};

/** RMS loudness around t (0..1, speech ≈ 0.4–1 after -16 LUFS mastering) */
const loudness = (audio, t) => {
  if (!audio) return 0.6;
  const ch = audio.channelWaveforms[0], sr = audio.sampleRate;
  const a = Math.max(0, Math.floor((t - 0.03) * sr)), b = Math.min(ch.length, Math.floor((t + 0.03) * sr));
  let s = 0; for (let i = a; i < b; i += 4) s += ch[i] * ch[i];
  const rms = Math.sqrt(s / Math.max(1, (b - a) / 4));
  return Math.min(1, rms / 0.11);
};

const blinkAt = (t) => {
  // fixed uneven rhythm, some double blinks — deterministic
  for (let tb = 1.1, k = 0; tb < t + 0.2; tb += 2.3 + ((k * 7) % 5) * 0.47, k++) {
    for (const off of k % 4 === 2 ? [0, 0.24] : [0]) {
      const d = t - (tb + off);
      if (d >= 0 && d < 0.17) return Math.sin((Math.PI * d) / 0.17);
    }
  }
  return 0;
};

export const Pose = ({ host, pose, src, open, wide, blink, opacity }) => {
  const [W, H] = host.size;
  const uid = "m" + useId().replace(/[^a-zA-Z0-9]/g, ""); // unique per instance: crossfades / check sheets draw a pose twice
  const m = host.mouth?.[pose];
  const ang = m?.[3] || 0; // lip-line tilt (°) and smile sag (px), traced by tools/host-pose.mjs
  let mouth = null;
  if (m && open > 0.06) {
    const [mx, my, w0] = m;
    const sag = (m[4] || 0) * wide;
    const mw = w0 * wide, hh = w0 * 0.6 * (host.open || 1.3) * open;
    // drawn in the lip line's own frame (origin = midpoint between the lip corners, x along the line):
    // the jaw drops (opens down), the upper lip stays, both edges follow the smile curve
    const d = `M${-mw / 2} 0 Q0 ${2 * sag - hh * 0.18} ${mw / 2} 0 Q0 ${2 * sag + hh * 1.5} ${-mw / 2} 0Z`;
    mouth = (
      <g transform={`translate(${mx} ${my}) rotate(${ang})`}>
        <defs><clipPath id={uid}><path d={d} /></clipPath></defs>
        <path d={d} fill={host.mouthColor || "#2a1210"} />
        <g clipPath={`url(#${uid})`}>
          {open > 0.38 && <rect x={-mw / 2} y={sag - hh * 0.2} width={mw} height={hh * 0.32} fill={host.teethColor || "#e6ddd0"} />}
          {open > 0.55 && <ellipse cx={0} cy={sag + hh * 0.95} rx={mw * 0.3} ry={hh * 0.3} fill="#a8433e" />}
        </g>
        {host.outlineColor && <path d={d} fill="none" stroke={host.outlineColor} strokeWidth={5} strokeLinejoin="round" />}
        <path d={d} fill="none" stroke={host.lipColor || "#d27a68"} strokeWidth={host.outlineColor ? 2.2 : 2.6} />
      </g>
    );
  }
  const lids = blink > 0.02 ? (host.eyes?.[pose] || []).map(([ex, ey, ew, eh], i) => {
    const rx = ew / 2 + 8, ry = eh / 2 + 7, top = ey - ry; // padded to cover the eye outline
    return (
      <g key={i} transform={`rotate(${ang} ${ex} ${ey})`}>
        <g transform={`translate(0 ${top}) scale(1 ${blink}) translate(0 ${-top})`}>
          <ellipse cx={ex} cy={ey} rx={rx} ry={ry} fill={host.skinColor || "#e48d5e"} />
          <path d={`M${ex - rx + 3} ${ey + ry * 0.2} Q${ex} ${ey + ry * 0.95} ${ex + rx - 3} ${ey + ry * 0.2}`} fill="none" stroke={host.lashColor || "#3a2015"} strokeWidth={3.2} strokeLinecap="round" />
        </g>
      </g>
    );
  }) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", opacity }}>
      <image href={staticFile(src)} width={W} height={H} />
      {mouth}
      {lids}
    </svg>
  );
};

export const Host = ({ host, shots, mouth, audio, format }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const t = frame / fps;
  const data = useAudioData(staticFile(audio));
  const box = host.box?.[format] || { w: 400, bottom: -20, right: -10 };

  // pose per shot, crossfade 0.15 s, spring hop on every change
  const i = Math.max(0, shots.findIndex((s, k) => t >= s.start && (k === shots.length - 1 || t < shots[k + 1].start)));
  const poseOf = (s) => { const n = s?.host; return host.poses[n] ? n : host.poses[host.aliases?.[n]] ? host.aliases[n] : "idle"; };
  const cur = poseOf(shots[i]), prev = i > 0 ? poseOf(shots[i - 1]) : cur;
  const since = t - (shots[i]?.start || 0);
  const fade = interpolate(since, [0, 0.15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hop = spring({ frame: Math.round(since * fps), fps, config: { damping: 11, stiffness: 170, mass: 0.7 } });

  // mouth: viseme × loudness, smoothed over 3 frames
  const sample = (fr) => { const tt = fr / fps; const v = cueAt(mouth, tt); return [OPEN[v] ?? 0, WIDE[v] ?? 1, v === "X" ? 0 : loudness(data, tt)]; };
  const [a, b, c] = [sample(frame), sample(frame - 1), sample(frame - 2)];
  const mix = (k) => a[k] * 0.5 + b[k] * 0.3 + c[k] * 0.2;
  const loud = mix(2), gate = Math.min(1, Math.max(0, (loud - 0.1) / 0.25)); // voice fading → mouth closes, no lingering at word ends
  const open = Math.min(1, mix(0) * (0.8 + 0.55 * loud) * gate), wide = mix(1);

  // phrase starts (X → talking) tilt the head, alternating sides; talking lifts it a touch
  const starts = [];
  for (let k = 1; k < mouth.length; k++) if (mouth[k - 1][1] === "X" && mouth[k][1] !== "X") starts.push(mouth[k][0]);
  const n = starts.filter((s) => s <= t).length;
  const target = (k) => (k === 0 ? 0 : k % 2 ? -1.6 : 1.4);
  const sp = n ? spring({ frame: Math.round((t - starts[n - 1]) * fps), fps, config: { damping: 14, stiffness: 90 } }) : 1;
  const rot = target(n - 1) + (target(n) - target(n - 1)) * sp + (1 - hop) * -3;
  const nod = -mix(2) * 7 * u * (open > 0.06 ? 1 : 0);
  const bob = Math.sin((t * 2 * Math.PI) / 2.8) * 5 * u;
  const y = bob + nod + (1 - hop) * 34 * u;
  const blink = blinkAt(t);

  return (
    <div style={{ position: "absolute", right: box.right * u, bottom: box.bottom * u, width: box.w * u, height: box.w * 1.2 * u, transform: `translateY(${y}px) rotate(${rot}deg)`, transformOrigin: "50% 100%" }}>
      {prev !== cur && fade < 1 && <Pose host={host} pose={prev} src={host.poses[prev]} open={0} wide={1} blink={0} opacity={1 - fade} />}
      <Pose host={host} pose={cur} src={host.poses[cur]} open={open} wide={wide} blink={blink} opacity={prev !== cur ? fade : 1} />
    </div>
  );
};

/** px from the frame bottom to the top of the host box (captions and content stay above it) */
export const hostTop = (host, format, u) => {
  const box = host?.box?.[format];
  return box ? (1.2 * box.w + box.bottom) * u : host ? 460 * u : 0;
};
