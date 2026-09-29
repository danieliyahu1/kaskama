import { PUBLIC_PAGES, SITE, publicPageByPath } from "./index.js";

function paragraphs(path: string): string {
  const page = publicPageByPath(path);
  if (!page) throw new Error(`missing page ${path}`);
  return page.sections.flatMap((section) => section.paragraphs).join(" ");
}

describe("public pages", () => {
  it("tells readers how to report content", () => {
    const policy = paragraphs("/content-policy");

    expect(policy).toMatch(/report/i);
    expect(policy).toMatch(/feedback button/i);
  });

  it("positions Kaskama as a platform for creators, not an adult-only site", () => {
    const policyPage = publicPageByPath("/content-policy");
    const policy = [
      policyPage?.intro.join(" ") ?? "",
      paragraphs("/content-policy"),
    ].join(" ");
    const site = [SITE.title, SITE.description].join(" ");

    expect(policy).toMatch(/subscription platform for creators/i);
    for (const text of [policy, site]) {
      expect(text).not.toMatch(/adult creators and their fans/i);
      expect(text).not.toMatch(/18 years old to publish or unlock/i);
    }
  });

  it("allows AI-generated content without requiring a label", () => {
    const policy = paragraphs("/content-policy");

    expect(policy).toMatch(/AI-generated and synthetic media/i);
    expect(policy).not.toMatch(/clearly labeled/i);
    expect(policy).not.toMatch(/say so in the caption/i);
  });

  it("keeps adult material on private profiles and makes no age claim", () => {
    const policy = paragraphs("/content-policy");

    expect(policy).toMatch(/set your profile to private/i);
    expect(policy).toMatch(/creators directory/i);
    expect(policy).not.toMatch(/18\+/);
    expect(policy).not.toMatch(/18 or older/i);
    expect(policy).not.toMatch(/at least 18/i);
  });

  it.each(PUBLIC_PAGES)("dates $path", (page) => {
    expect(page.updated).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });

  it.each(PUBLIC_PAGES)(
    "does not claim content is stored on the blockchain on $path",
    (page) => {
      for (const section of page.sections) {
        for (const paragraph of section.paragraphs) {
          expect(paragraph).not.toMatch(/withdrawn from the chain/i);
          expect(paragraph).not.toMatch(/permanent on-chain/i);
          expect(paragraph).not.toMatch(/content published on-chain/i);
        }
      }
    },
  );
});
