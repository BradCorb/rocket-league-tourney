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

// On Vercel builds, only regenerate Prisma client.
// Do NOT run `prisma db push --accept-data-loss` in production builds,
// because that can drop/reset live tables (including member betting data).
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
  run(prismaBin, ["generate"]);
}

run(nextBin, ["build"]);

