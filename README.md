# talking-avatar

A [Claude Code](https://claude.com/claude-code) skill that turns **a photo of a person + a voice-over** into a **lip-synced cartoon talking-head video**. No avatar subscription and no per-minute fees: the character is drawn once in any image model, and the talking is done in code.

- **Character from a photo**: ready-made prompts for a flat-cartoon character in up to 20 expressions (wave, talk, think, wow, point, facepalm, celebrate…), each with a note on when to use it.
- **Automatic rigging**: traces each pose's lip line (position, width, tilt, smile curve) and eyes, so the mouth sits right even on tilted and turned heads.
- **Lip-sync**: [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync) mouth shapes × the voice's loudness, plus blinks, head tilts on each phrase, a nod and a bob.
- **Pose changes on cue** from a small JSON timeline.
- **Output**: MP4 (portrait, landscape or square, any background colour) or a transparent ProRes 4444 `.mov` to drop into Premiere, Final Cut, DaVinci or CapCut.

Rendered with [Remotion](https://www.remotion.dev).

## Install

```bash
git clone https://github.com/naveenslog/claude-talking-avatar ~/.claude/skills/talking-avatar
```

That's it. Open Claude Code and say *"set up talking-avatar"*, or go straight to *"make a talking avatar video that says voice.mp3"*. On first use Claude runs `setup.sh` itself: it installs ffmpeg, Node 22+, Rhubarb Lip Sync and the Remotion packages (plus Rosetta on Apple Silicon), skipping whatever you already have, then renders a short test clip. Works on macOS and Linux.

**Don't want to make your own head?** Two ready starter characters ship in `starters/`: **male** and **female**, each with the same 20 poses, already rigged. Pick one with `--character male` or `--character female` (leave it out and the script asks):

```bash
node ~/.claude/skills/talking-avatar/scripts/render.mjs --character female --audio voice.mp3 --timeline ~/.claude/skills/talking-avatar/examples/timeline.json
```

## By hand

```bash
S=~/.claude/skills/talking-avatar

# 1. character: generate the poses with the prompts in poses.json → characters/me/raw/<pose>.png, then
node $S/scripts/poses.mjs $S/characters/me                    # cut-outs + host.json + check/sheet.png (look at it)
node $S/scripts/render.mjs --character $S/characters/me --check  # every mouth, drawn by the renderer

# 2. render
node $S/scripts/render.mjs --character $S/characters/me --audio voice.mp3 --text script.txt \
     --timeline $S/examples/timeline.json --format portrait --bg "#23263a"
# → voice-talking.mp4    (--bg transparent → voice-talking.mov with alpha)
```

The first render prints where each phrase starts, so you can hang pose changes on them:

```json
[{ "at": 0, "pose": "wave" }, { "at": 1.66, "pose": "talk" }, { "at": 4.2, "pose": "wow" }]
```

[SKILL.md](SKILL.md) has the full workflow, the `host.json` format and the measuring rules.

## Layout

```
SKILL.md            the workflow Claude follows
poses.json          base prompt + 20 pose prompts, each with when to use it
scripts/poses.mjs   generated images → cut-outs + measured mouth/eyes (host.json) + check sheet
scripts/render.mjs  character + audio → Rhubarb → Remotion render
remotion/src/       Host.jsx (the talking character) · TalkingHead.jsx (the video) · HostCheck.jsx (lip-sync check sheet)
starters/           ready-made characters: male/ and female/ (20 poses + host.json each), --character male|female
characters/         your characters (git-ignored)
```

## Licences

- This skill: [MIT](LICENSE).
- **Remotion** is not MIT. It is free for individuals and small teams, and larger companies need a company licence. Check [remotion.dev/license](https://www.remotion.dev/license) for your case.
- Rhubarb Lip Sync: MIT. Background removal runs HyperFrames' local remover through `npx hyperframes` on first use. Generated character images fall under your image model's terms.
- Only make an avatar of someone with their permission.
