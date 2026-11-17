// Lip-sync check sheet: every pose = a face view (blink lids closed) + the mouth zoomed at three openings, drawn by the real renderer.
// Render after any host.json / Host.jsx change and LOOK at every face (tilted and turned heads especially):
//   node scripts/render.mjs --character <dir> --check
import React from "react";
import { AbsoluteFill } from "remotion";
import { Pose } from "./Host.jsx";

const CELL = 230;
const View = ({ host, pose, open, zoom, cx, cy, blink = 0 }) => {
  const [W, H] = host.size;
  return (
    <div style={{ width: CELL, height: CELL, overflow: "hidden", position: "relative", outline: "1px solid #c9c2b5" }}>
      <div style={{ position: "absolute", width: W, height: H, left: CELL / 2 - cx * zoom, top: CELL / 2 - cy * zoom, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
        <Pose host={host} pose={pose} src={host.poses[pose]} open={open} wide={1} blink={blink} opacity={1} />
      </div>
    </div>
  );
};

export const HostCheck = ({ host }) => {
  if (!host) return null;
  return (
    <AbsoluteFill style={{ background: "#efebe3", display: "flex", flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", gap: 14, padding: 14, fontFamily: "monospace" }}>
      {Object.keys(host.poses).map((p) => {
        const [mx, my] = host.mouth?.[p] || [360, 460];
        return (
          <div key={p} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex" }}>
              <View host={host} pose={p} open={0.75} zoom={0.75} cx={mx} cy={my - 70} blink={1} />
              {[0.3, 0.65, 1].map((o) => <View key={o} host={host} pose={p} open={o} zoom={1.9} cx={mx} cy={my + 10} />)}
            </div>
            <div style={{ fontSize: 22 }}>{p} · mouth {JSON.stringify(host.mouth?.[p])}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
