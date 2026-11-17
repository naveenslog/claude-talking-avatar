---
name: talking-avatar
description: Make a lip-synced cartoon talking-head video from a photo of a person and a voice-over. Designs a flat-cartoon character with up to 20 expressions (made in any image model), measures each pose's mouth and eyes automatically, then renders the character talking with Remotion (Rhubarb visemes × voice loudness, blinks, head tilts, pose changes on cue) as an MP4 or a transparent overlay. Use when someone wants an avatar, talking head, cartoon presenter or animated host for a video, or has a voice-over and a character and wants it to talk. Also use when someone asks to set up or install talking-avatar: on first use it installs its own dependencies.
---

# Talking avatar

A photo + a voice-over → a cartoon of that person saying it. No paid avatar service: the mouth is drawn on the measured lip line and driven by code.

`<skill>` below = this skill's folder (where this file is). Characters live in `<skill>/characters/<name>/` (git-ignored: they are someone's likeness) or any folder you pass.

## 0. First run: you do the setup, not the user

The user only cloned this folder. Before the first render, **run the setup yourself** (do not ask them to):

- **macOS / Linux:** `bash <skill>/setup.sh`. Installs ffmpeg and Node 22+ (Homebrew / apt), Rhubarb into `~/.local/bin`, Rosetta on Apple Silicon.
- **Windows:** `powershell -ExecutionPolicy Bypass -File <skill>/setup.ps1`. Installs ffmpeg and Node LTS (winget), Rhubarb into `~/.local/opt/rhubarb-1.14.0`.

Both install the Remotion packages, skip what is already there (the scripts find Rhubarb without a PATH edit) and end with `READY` or `NOT READY`.

- `READY` → go straight on to the user's video.
- `NOT READY` → fix each `!` line it printed (it says how), re-run, and only ask the user for what needs them (a `sudo` password, no Homebrew/winget). On Windows, a fresh winget install can need a new terminal before `node`/`ffmpeg` are found.
- Skip the setup on later runs when `<skill>/remotion/node_modules` exists and `rhubarb --version` works from `~/.local/bin` (Windows: `~/.local/opt/rhubarb-1.14.0/Rhubarb-Lip-Sync-1.14.0-Windows/rhubarb.exe`).
- Then a tiny smoke test so the user sees it work, only when they are waiting on setup alone (skip it if they already gave you a voice-over). Make a short clip, then `node <skill>/scripts/render.mjs --character female --audio <clip>`:
  - macOS: `say -o "$TMPDIR/ta-hello.aiff" "Hi, I am your talking avatar."`
  - Windows: `powershell -c "Add-Type -A System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile(\"$env:TEMP\ta-hello.wav\"); $s.Speak('Hi, I am your talking avatar.'); $s.Dispose()"`
  - Linux: `espeak-ng -w /tmp/ta-hello.wav "Hi, I am your talking avatar."` if present, else ask for any short audio.

**No photo, or no time to make a character?** Two ready starters ship with the skill: `<skill>/starters/male/` and `<skill>/starters/female/`, flat-cartoon hosts with all 20 poses from `poses.json` (same names, same `use`), mouths and eyes already measured. **Ask the user which one they want: male or female** (one question, before anything else), then pass `--character male` or `--character female` and skip to step 2. Run by hand without `--character`, `render.mjs` asks the same question in the terminal.

## 1. Character (once per person)

A character folder:
```
<name>/
  raw/<pose>.png     the generated images, as downloaded
  full/<pose>.png    background removed, full size      ┐
  <pose>.png         720 px wide (what gets rendered)   │ written by scripts/poses.mjs
  host.json          mouth + eyes per pose, colours     │
  check/sheet.png    measured mouth (red) / eyes (blue) ┘
  poses.json         optional: its own pose list (default: <skill>/poses.json)
```

1. **Make the images** in any image model (ChatGPT, Gemini, …), in ONE chat so the character stays identical:
   - first message: a photo of the person + `base` from `<skill>/poses.json`
   - then one message per pose: `template` with `{pose}` filled in from `poses[].pose`. Wait for each image before sending the next; a prompt sent while one is generating gets dropped.
   - Only `idle` is required. `talk` is the default pose while speaking. Make the others the video needs.
   - The prompt asks for what the measuring needs: **mouth closed**, pink/warm-red lips with clear skin around them (a thin beard is fine), white eye-whites, flat colours, plain light-grey background, chest-up framing.
2. **Save** each as `raw/<pose>.png`. ⚠ Image chats re-order and lazy-load images. Put the downloads side by side and check every name against its picture before processing. Mislabelled poses are the most common failure.
3. **Process**: `node <skill>/scripts/poses.mjs <character-dir>` cuts the backgrounds (a local model fetched on first use via `npx hyperframes`; "transparent" PNGs from image models often have the checkerboard baked in), resizes, traces each mouth and eye, writes `host.json` and `check/sheet.png`. Already-transparent images: `--keep-bg`. One pose again: `--only wow`. Images elsewhere: `--from <dir> --prefix <name>-`.
4. **Look at `check/sheet.png`.** On every face the red line must lie on the lip parting line and the red cross must sit in the middle of the lips. Blue boxes must cover the eyes (none on closed or covered eyes is correct). Fix a wrong pose by hand in `host.json` and add it to `"locked"` so re-runs keep its x, y and width.
5. **Look at the real renderer**: `node <skill>/scripts/render.mjs --character <dir> --check` → `check/mouths.png`: every pose with its lids closed plus its mouth at three openings. Tilted heads especially.

## 2. Voice

Any audio file (wav, mp3, m4a, …) works: a recording, ElevenLabs, or `say -o voice.aiff "…"` on macOS for a free draft. It is normalised to −16 LUFS. Pass the script as `--text script.txt` when you have it: Rhubarb's mouth shapes get more accurate. For a non-English voice add `--phonetic`.

## 3. Render

```bash
node <skill>/scripts/render.mjs --character <dir|male|female> --audio voice.mp3 [--text script.txt] [--timeline cues.json] \
     [--format portrait|landscape|square] [--bg "#23263a"|transparent] [--scale 1] [--out out.mp4]
```

- The first run prints `phrases start at: 0.24 1.66 5.73 …`: speech after a pause, the natural moments to change pose. Lip-sync cues are cached as `<audio>.mouth.json`, so re-renders skip Rhubarb.
- **Timeline** (`examples/timeline.json`): `[{ "at": 0, "pose": "wave" }, { "at": 1.66, "pose": "talk" }, …]`. Match each phrase's meaning to a pose's `use` in `poses.json` (wow = surprising fact, think = question, point-down = "comment below", and so on). Change pose about every 2–5 s. Unknown names fall back to `idle` with a warning. `host.json` `aliases` map extra names (`"happy": "laugh"`). Without a timeline, the character uses `talk` throughout.
- **Output**: `<audio>-talking.mp4` next to the audio by default. `--bg transparent` gives a ProRes 4444 `.mov` with alpha (large: ~25 MB/s) to overlay in any editor. `--scale 1.3` makes the character bigger (its sides crop); portrait leaves the top third free for titles.
- **Look before you hand it over**: `ffmpeg -ss <t> -i out.mp4 -frames:v 1 f.png` mid-word on a few poses, tilted ones especially. Then say "audio measured, not heard" unless someone listened.

## How it moves (remotion/src/Host.jsx)

- **Mouth** = Rhubarb viseme (A–H, X) for shape × narration loudness for how open, smoothed over 3 frames. It closes as the voice fades. It is drawn in the lip line's own frame (rotated by tilt, bent by smile sag) and opens **downward** (jaw drop). Teeth show only on clearly open shapes, the tongue only on wide ones.
- **Life**: uneven deterministic blinks (some double), a head tilt alternating sides at each phrase start, a nod with loudness, a slow bob, a spring hop and a 0.15 s crossfade on every pose change.

## host.json

| key | what |
|---|---|
| `mouth.<pose>` | `[x, y, width, tilt°, smile sag px]` in 720-wide pixels, traced from the lip parting line |
| `eyes.<pose>` | `[[x, y, w, h], …]` blink-lid boxes. Leave out for closed/covered eyes; one box for a wink |
| `locked` | poses whose x/y/width are hand-tuned (tilt + sag are still re-traced) |
| `aliases` | extra pose names → real ones |
| `skinColor` | lid colour (auto-sampled between the eyes on first run) |
| `mouthColor` `lipColor` `outlineColor` `teethColor` `lashColor` | mouth and lid paint |
| `open` | how far the jaw drops (default 1.3) |

## Measuring rules (learned the hard way)

- The lip corners are the truth. The mouth centre is the midpoint between the traced corners, **not** the middle of the moustache: on turned heads that is 10–20 px off.
- **Tilted faces need the tilt.** On a real set, half the poses slanted −6° to −15°. A flat mouth on a slanted lip line leaves the drawn lip corners sticking out and reads as a second, crooked mouth.
- Eyes = white-of-eye blobs inside the character. The iris splits an eye into two halves, which get rejoined; a highlight nearby must not merge into one huge box (that made one eye blink alone, i.e. a wink).
- A head can sit high in its image (laughing, leaning back). Check the picture before "fixing" an outlier.
- Auto-measure fails when the mouth is hidden or the lips aren't pink/red. Set `mouth` by hand from the check sheet and lock the pose.

## Troubleshooting

- `rhubarb not found`: run the setup again (`setup.sh`, or `setup.ps1` on Windows). On Apple Silicon the macOS build needs Rosetta (`softwareupdate --install-rosetta --agree-to-license`).
- Mouth floats off the lips on one pose: fix that pose in `host.json`, lock it, `--check` again.
- A grey haze around the character: background-removal residue in that pose's image. Re-generate the pose, or save a cleaned transparent version as `raw/<pose>.png` and re-run with `--only <pose> --keep-bg`.
