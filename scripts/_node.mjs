// _node.mjs — Remotion wants Node ≥ 22. When the shell's `node` is older, re-run the calling script under the newest Node ≥ 22
// found in ~/.nvm or Homebrew, with it first on PATH so `npx remotion` children use it too. Import it first: `import "./_node.mjs";`
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const major = (v) => Number(String(v).trim().replace(/^v/, "").split(".")[0]) || 0;
if (major(process.versions.node) < 22) {
  const nvm = path.join(process.env.NVM_DIR || path.join(os.homedir(), ".nvm"), "versions/node");
  const found = [
    ...(fs.existsSync(nvm) ? fs.readdirSync(nvm).sort((a, b) => major(b) - major(a)).map((v) => path.join(nvm, v, "bin/node")) : []),
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/opt/homebrew/opt/node@22/bin/node", // keg-only node@22, what setup.sh installs via brew
    "/usr/local/opt/node@22/bin/node",
  ].find((bin) => fs.existsSync(bin) && major(spawnSync(bin, ["-v"], { encoding: "utf8" }).stdout) >= 22);
  if (!found) {
    console.error(`✗ Node ${process.versions.node}: needs Node 22+ (nvm install 22)`);
    process.exit(1);
  }
  const env = { ...process.env, PATH: `${path.dirname(found)}${path.delimiter}${process.env.PATH}` };
  process.exit(spawnSync(found, process.argv.slice(1), { stdio: "inherit", env }).status ?? 1);
}
