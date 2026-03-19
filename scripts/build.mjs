import { spawnSync } from "node:child_process";
import path from "node:path";

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

// On Vercel builds, ensure the hosted database schema exists.
// This avoids needing to commit migrations for the MVP iteration.
const isVercel = process.env.VERCEL === "1";

const prismaBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);
const nextBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next",
);

if (isVercel) {
  run(prismaBin, ["db", "push", "--accept-data-loss"]);
  // Ensure generated Prisma client files exist on Vercel.
  // The repo ignores `src/generated/prisma`, so we must generate them during build.
  run(prismaBin, ["generate"]);
}

run(nextBin, ["build"]);

