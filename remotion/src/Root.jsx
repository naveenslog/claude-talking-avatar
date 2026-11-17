import React from "react";
import { Composition } from "remotion";
import { TalkingHead } from "./TalkingHead.jsx";
import { HostCheck } from "./HostCheck.jsx";

// scripts/render.mjs supplies every prop (size, length, character, cues, mouth, audio).
export const Root = () => (
  <>
    <Composition
      id="TalkingHead"
      component={TalkingHead}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ host: null, cues: [], mouth: [], audio: null, background: "#1d1b26", scale: 1, fps: 30, width: 1080, height: 1920, durationInFrames: 300 }}
      calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames, fps: props.fps, width: props.width, height: props.height })}
    />
    {/* lip-sync check: every pose, face + mouth zoomed at 3 openings — node scripts/render.mjs --character <dir> --check */}
    <Composition id="HostCheck" component={HostCheck} durationInFrames={1} fps={30} width={1900} height={2800} defaultProps={{ host: null }} />
  </>
);
