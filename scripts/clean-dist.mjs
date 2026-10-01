import { rmSync } from "node:fs";
import process from "node:process";

const directory = process.argv[2];

if (!directory) {
  console.error("usage: node scripts/clean-dist.mjs <directory>");
  process.exit(1);
}

rmSync(directory, { recursive: true, force: true });
