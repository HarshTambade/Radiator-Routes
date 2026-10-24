import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractDestinationName,
  getDestinationPhoto,
  isWikimediaImageUrl,
} from "@/services/destinationImage";

const PALGHAR_THUMB =
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5b/Vajreshwari_Vogini_Mandir%2C_Maharashtra_-_panoramio_%2830%29.jpg/1280px-Vajreshwari.jpg?utm_source=en.wikipedia.org";

describe("isWikimediaImageUrl", () => {
  it("accepts both the current and the legacy thumbnail host", () => {
    expect(isWikimediaImageUrl(PALGHAR_THUMB)).toBe(true);
    expect(isWikimediaImageUrl("https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg")).toBe(true);
  });

  it("rejects other hosts, look-alikes and non-https", () => {
    expect(isWikimediaImageUrl("https://thumb.wikimedia.org.evil.com/x.jpg")).toBe(false);
    expect(isWikimediaImageUrl("http://upload.wikimedia.org/x.jpg")).toBe(false);
    expect(isWikimediaImageUrl("https://example.com/x.jpg")).toBe(false);
    expect(isWikimediaImageUrl(null)).toBe(false);
  });
});

describe("getDestinationPhoto", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds the town photo for a villa destination written as a sentence", async () => {
    const destination =
      "we are planning a trip from vasai to palghar coco villa and we are ontotal 7 people";
    expect(extractDestinationName(destination)).toBe("palghar coco villa");

    // Shapes copied from live en.wikipedia.org responses (24 Oct 2026).
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      const title = url.searchParams.get("titles");
      if (url.hostname === "en.wikipedia.org" && title === "palghar") {
        return Response.json({
          query: {
            pages: [{ title: "Palghar", thumbnail: { source: PALGHAR_THUMB }, pageimage: "Vajreshwari.jpg" }],
          },
        });
      }
      if (url.hostname === "en.wikipedia.org") {
        return Response.json({ query: { pages: [{ title, missing: true }] } });
      }
      return Response.json({ query: { pages: [{}] } }); // Commons attribution
    });
    vi.stubGlobal("fetch", fetchMock);

    const photo = await getDestinationPhoto(destination);
    expect(photo?.url).toBe(PALGHAR_THUMB);
  });
});
