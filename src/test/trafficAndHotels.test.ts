import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/nominatim", () => ({
  nominatimSearch: vi.fn(),
  nominatimReverse: vi.fn(),
}));
vi.mock("@/services/opentripmap", () => ({
  otmRadius: vi.fn(),
}));

import { nominatimSearch } from "@/services/nominatim";
import { otmRadius } from "@/services/opentripmap";
import { amadeusHotelList } from "@/services/amadeus";
import { localTimeAt, trafficFlow } from "@/services/traffic";

describe("traffic estimate uses the destination's clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 03:30 UTC = 09:00 in India (UTC+5:30), still 03:30 in London (UTC+0).
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 27, 3, 30)));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("converts a UTC offset to local wall-clock time", () => {
    expect(localTimeAt(19_800)).toEqual({ hour: 9, time: "09:00" });
    expect(localTimeAt(-18_000)).toEqual({ hour: 22, time: "22:30" });
  });

  it("reports morning rush at 9 AM destination time, whatever the device clock says", async () => {
    const india = await trafficFlow({ lat: 15.49, lon: 73.82, utcOffsetSeconds: 19_800, timezone: "Asia/Kolkata" });
    expect(india.flowSegmentData.localTime).toBe("09:00");
    expect(india.flowSegmentData.congestion).toMatch(/morning rush/i);
    expect(india.flowSegmentData.timezone).toBe("Asia/Kolkata");

    const london = await trafficFlow({ lat: 51.5, lon: -0.12, utcOffsetSeconds: 0 });
    expect(london.flowSegmentData.congestion).toBe("Free flow");
  });
});

describe("hotel search returns real places, not invented ones", () => {
  beforeEach(() => {
    vi.mocked(nominatimSearch).mockReset();
    vi.mocked(otmRadius).mockReset();
  });

  it("maps OpenTripMap accommodation near the typed city, nearest first, deduplicated", async () => {
    vi.mocked(nominatimSearch).mockResolvedValue([
      { place_id: 0, licence: "", osm_type: "", osm_id: 0, lat: "32.24", lon: "77.19", display_name: "Manali", address: { country_code: "in" } },
    ]);
    vi.mocked(otmRadius).mockResolvedValue([
      { xid: "N2", name: "Snow Valley Resorts", dist: 2400, point: { lat: 32.25, lon: 77.18 } },
      { xid: "N1", name: "Johnson Lodge", dist: 350 },
      { xid: "N3", name: "", dist: 100 },
      { xid: "N4", name: "johnson lodge", dist: 900 },
    ]);

    const { data } = await amadeusHotelList({ cityCode: "", cityName: "Manali", checkInDate: "2026-11-02", checkOutDate: "2026-11-05", adults: 2 });

    expect(nominatimSearch).toHaveBeenCalledWith("Manali", 1);
    expect(vi.mocked(otmRadius).mock.calls[0][0]).toMatchObject({ kinds: "accomodations", radius: 5000 });
    expect(data.map((hotel) => hotel.name)).toEqual(["Johnson Lodge", "Snow Valley Resorts"]);
    expect(data[0]).toMatchObject({ hotelId: "N1", distance: { value: 0.4, unit: "KM" }, address: { cityName: "Manali", countryCode: "IN" } });
    expect(data.every((hotel) => hotel.rating === undefined)).toBe(true);
    const link = new URL(data[0].bookingLinks.booking);
    expect(link.searchParams.get("ss")).toBe("Johnson Lodge, Manali");
    expect(link.searchParams.get("checkin")).toBe("2026-11-02");
    expect(link.searchParams.get("group_adults")).toBe("2");
  });

  it("returns an empty list rather than placeholders when nothing is listed", async () => {
    vi.mocked(nominatimSearch).mockResolvedValue([
      { place_id: 0, licence: "", osm_type: "", osm_id: 0, lat: "10", lon: "76", display_name: "Somewhere" },
    ]);
    vi.mocked(otmRadius).mockResolvedValue([]);
    const { data } = await amadeusHotelList({ cityCode: "", cityName: "Somewhere" });
    expect(data).toEqual([]);
  });

  it("fails clearly when the city cannot be located", async () => {
    vi.mocked(nominatimSearch).mockResolvedValue([]);
    await expect(amadeusHotelList({ cityCode: "", cityName: "Nowhereville" })).rejects.toThrow(/Could not locate/);
  });
});
