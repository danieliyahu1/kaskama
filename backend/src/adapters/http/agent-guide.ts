import { readFileSync } from "node:fs";

/**
 * The agent guide, served as markdown at `/docs/agent-guide.md`. The source is
 * `docs/agent-guide.md`: the document is edited as a document and read here
 * rather than duplicated into code.
 */
export const agentGuideMarkdown = readFileSync(
  new URL("../../../../docs/agent-guide.md", import.meta.url),
  "utf8",
);
