import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractDate } from "@/services/aiChat";

describe("extractDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 27 Oct 2026, mid-afternoon local time.
    vi.setSystemTime(new Date(2026, 9, 27, 15, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads 'day after tomorrow' as two days out, not tomorrow", () => {
    expect(extractDate("leaving day after tomorrow")).toBe("2026-10-29");
    expect(extractDate("leaving tomorrow")).toBe("2026-10-28");
  });

  it("understands abbreviated month names in either order", () => {
    expect(extractDate("flights on 15 Aug")).toBe("2027-08-15");
    expect(extractDate("flights on Nov 3rd")).toBe("2026-11-03");
    expect(extractDate("from 2nd of Dec")).toBe("2026-12-02");
    expect(extractDate("Sept 9")).toBe("2027-09-09");
  });

  it("keeps today's date in the current year", () => {
    expect(extractDate("27th October")).toBe("2026-10-27");
  });

  it("honours an explicit year", () => {
    expect(extractDate("15 August 2028")).toBe("2028-08-15");
    expect(extractDate("March 4, 2027")).toBe("2027-03-04");
  });

  it("rejects impossible calendar dates", () => {
    expect(extractDate("31 February")).toBeNull();
  });
});
