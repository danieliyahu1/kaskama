/**
 * Public community channels. The site footer renders these and the agent-facing
 * documents link to them, from one source, so a person and an agent are sent to
 * the same places.
 */
export const SOCIAL_LINKS = {
  telegram: "https://t.me/+KHxAIuAXrng4Y2I0",
  github: "https://github.com/danieliyahu1/kaskama",
} as const;

export type SocialLinks = typeof SOCIAL_LINKS;
