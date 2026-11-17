// The talking-head video: one character, centred on the frame's bottom edge, lip-synced to the voice.
// Props come from scripts/render.mjs: host (poses + host.json), cues [{start, host: pose}], mouth (Rhubarb), audio.
import React from "react";
import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion";
import { Host } from "./Host.jsx";

export const TalkingHead = ({ host, cues, mouth, audio, background, scale = 1 }) => {
  const { width, height } = useVideoConfig();
  if (!host || !audio) return null;
  const u = Math.min(width, height) / 1080; // Host.jsx works in 1080-wide units
  // Host's box is w wide and 1.2·w tall, bottom-right anchored; centre it, as big as the frame allows
  const w = (Math.min(width, height / 1.2) / u) * scale;
  // ponytail: fixed sink hides the sticker's curved bottom outline (+ bg-removal haze) and the gap when the host bobs;
  // fits characters made with poses.json's base prompt — expose it if another art style needs a different cut
  const box = { w, bottom: -0.14 * w, right: (width / u - w) / 2 };
  return (
    <AbsoluteFill style={{ background: background || "transparent" }}>
      <Host host={{ ...host, box: { frame: box } }} shots={cues} mouth={mouth} audio={audio} format="frame" />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
