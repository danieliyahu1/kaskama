// Generates the app's copy of the membership covenant constants from the
// covenant source, so the number lives in exactly one place:
// backend/contracts/membership.sil.
//
// Run after editing the covenant:  pnpm generate:covenant
// The result is checked in and guarded by
// backend/src/membership-covenant-drift.test.ts.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const MAPPING = [
  {
    exported: "MIN_MEMBERSHIP_PRICE_SOMPI",
    covenant: "MIN_PRICE_SOMPI",
    doc: "The floor a creator may price a membership at, in sompi.",
  },
  {
    exported: "MAX_MEMBERSHIP_PRICE_SOMPI",
    covenant: "MAX_PRICE_SOMPI",
    doc: "The ceiling a creator may price a membership at, in sompi.",
  },
  {
    exported: "MIN_MEMBERSHIP_FEE_SOMPI",
    covenant: "MIN_FEE_SOMPI",
    doc: "The platform fee floor: one percent of the price, never less, in sompi.",
  },
  {
    exported: "MEMBERSHIP_DURATION_DAA",
    covenant: "MEMBERSHIP_LIFETIME_DAA",
    doc: "How long a membership lasts, in DAA score.",
  },
  {
    exported: "MEMBERSHIP_INDEX_VALUE",
    covenant: "INDEX_OUTPUT_VALUE",
    doc: "The owner-index output value a mint requires, in sompi.",
  },
  {
    exported: "MEMBERSHIP_OUTPUT_VALUE",
    covenant: "MEMBERSHIP_OUTPUT_VALUE",
    doc: "The minter and member covenant output value, in sompi.",
  },
];

function sompiLiteral(value) {
  return `${value.replace(/\B(?=(\d{3})+(?!\d))/g, "_")}n`;
}

const source = await readFile(join(root, "backend/contracts/membership.sil"), "utf8");

const lines = [
  "// GENERATED FILE - do not edit by hand.",
  "// Source of truth: backend/contracts/membership.sil",
  "// Regenerate with: pnpm generate:covenant",
];
for (const { exported, covenant, doc } of MAPPING) {
  const match = new RegExp(`int constant ${covenant} = (\\d+);`).exec(source);
  if (!match) throw new Error(`membership.sil has no constant ${covenant}`);
  lines.push(
    "",
    `/** ${doc} */`,
    `export const ${exported} = ${sompiLiteral(match[1])};`,
  );
}
lines.push("");

const target = join(root, "shared/src/covenant.ts");
await writeFile(target, lines.join("\n"));
console.log(`Wrote ${target}`);
