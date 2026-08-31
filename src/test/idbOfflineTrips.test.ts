import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetLegacyMigrationForTests,
  clearAllData,
  countAllData,
  deleteOfflineTrip,
  getAllOfflineTrips,
  getOfflineTrip,
  saveOfflineTrip,
} from "@/lib/idb";
import {
  getAllOfflineTrips as getAllOfflineTripsService,
  getOfflineTripData,
  isTripOffline,
  removeOfflineTrip,
  saveTripOffline,
} from "@/services/offlineTrip";

/**
 * P4 collapsed two IndexedDB databases into one. Trips previously written by
 * services/offlineTrip.ts to a standalone `radiator-routes-offline` database
 * now live in the `offlineTrips` store of `radiator-routes-db`. These tests
 * cover the merged surface end to end: the low-level helpers on lib/idb.ts, the
 * legacy service shape they now back, and the one-shot upgrade migration that
 * moves already-saved trips across.
 */

const sampleTrip = (tripId: string, savedAt = 1_700_000_000_000) => ({
  tripId,
  trip: { id: tripId, name: `Trip ${tripId}` },
  itineraries: [{ id: `${tripId}-it`, trip_id: tripId }],
  activities: [{ id: `${tripId}-act`, name: "Anjuna" }],
  savedAt,
  destinationLat: 15.5,
  destinationLng: 73.7,
  tilesCached: true,
  tileCacheCount: 42,
});

beforeEach(async () => {
  await clearAllData();
});

afterEach(async () => {
  await clearAllData();
});

// ── Merged store on lib/idb.ts ──────────────────────────────────────────────

describe("offlineTrips store", () => {
  it("round-trips a saved trip by tripId, not id", async () => {
    // The legacy database keyed on `tripId`; the merged store keeps the same
    // key path so old rows copy across without transformation.
    await saveOfflineTrip(sampleTrip("goa"));
    const row = await getOfflineTrip("goa");
    expect(row).toMatchObject({ tripId: "goa", tilesCached: true });
  });

  it("returns undefined for an unknown trip", async () => {
    expect(await getOfflineTrip("nope")).toBeUndefined();
  });

  it("lists every saved trip", async () => {
    await saveOfflineTrip(sampleTrip("a"));
    await saveOfflineTrip(sampleTrip("b"));
    const rows = await getAllOfflineTrips();
    expect(rows.map((r) => r.tripId).sort()).toEqual(["a", "b"]);
  });

  it("overwrites in place instead of duplicating", async () => {
    await saveOfflineTrip(sampleTrip("goa", 1));
    await saveOfflineTrip({ ...sampleTrip("goa", 2), tilesCached: false });
    const rows = await getAllOfflineTrips();
    expect(rows).toHaveLength(1);
    expect(rows[0].tilesCached).toBe(false);
    expect(rows[0].savedAt).toBe(2);
  });

  it("deletes only the named trip", async () => {
    await saveOfflineTrip(sampleTrip("a"));
    await saveOfflineTrip(sampleTrip("b"));
    await deleteOfflineTrip("a");
    const rows = await getAllOfflineTrips();
    expect(rows.map((r) => r.tripId)).toEqual(["b"]);
  });

  it("is cleared by clearAllData alongside the other stores", async () => {
    // "Clear offline data" used to leave one database untouched, because the
    // helper only knew about the other. Both are gone now.
    await saveOfflineTrip(sampleTrip("goa"));
    await clearAllData();
    expect(await getAllOfflineTrips()).toEqual([]);
  });

  it("is included in the storage totals", async () => {
    await saveOfflineTrip(sampleTrip("a"));
    const counts = await countAllData();
    expect(counts.offlineTrips).toBe(1);
  });
});

// ── Legacy service surface, now delegating to lib/idb.ts ────────────────────

describe("services/offlineTrip forwards to the merged store", () => {
  it("saves and reads back through both surfaces", async () => {
    await saveTripOffline(sampleTrip("goa"));

    // Same data visible via both the service and the low-level helper.
    expect((await getOfflineTripData("goa"))?.tripId).toBe("goa");
    expect((await getOfflineTrip("goa"))?.tripId).toBe("goa");
  });

  it("returns null rather than undefined for a missing trip", async () => {
    expect(await getOfflineTripData("missing")).toBeNull();
    expect(await isTripOffline("missing")).toBe(false);
  });

  it("reports presence correctly once saved", async () => {
    await saveTripOffline(sampleTrip("goa"));
    expect(await isTripOffline("goa")).toBe(true);
  });

  it("lists every trip through the service", async () => {
    await saveTripOffline(sampleTrip("a"));
    await saveTripOffline(sampleTrip("b"));
    const rows = await getAllOfflineTripsService();
    expect(rows.map((r) => r.tripId).sort()).toEqual(["a", "b"]);
  });

  it("removes trips through the service", async () => {
    await saveTripOffline(sampleTrip("a"));
    await removeOfflineTrip("a");
    expect(await isTripOffline("a")).toBe(false);
  });

  it("swallows read errors as false so the UI never crashes on IDB blips", async () => {
    // isTripOffline is called on mount by useOfflineTrip; a rejected read must
    // not turn into an uncaught promise rejection.
    const spy = vi
      .spyOn(indexedDB, "open")
      .mockImplementationOnce(() => {
        throw new Error("blocked");
      });

    expect(await isTripOffline("goa")).toBe(false);
    spy.mockRestore();
  });
});

// ── v1 → v2 upgrade migration ───────────────────────────────────────────────

/** Directly seeds the legacy database the migration expects to read. */
async function seedLegacyDatabase(rows: ReturnType<typeof sampleTrip>[]) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("radiator-routes-offline", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("offline-trips", { keyPath: "tripId" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("offline-trips", "readwrite");
      for (const row of rows) tx.objectStore("offline-trips").put(row);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

async function deleteDatabase(name: string) {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function databaseExists(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof indexedDB.databases === "function") {
      indexedDB
        .databases()
        .then((list) => resolve(list.some((entry) => entry.name === name)))
        .catch(() => resolve(false));
      return;
    }
    // Fallback path for engines without `databases()`.
    resolve(false);
  });
}

describe("v1 → v2 migration", () => {
  beforeEach(async () => {
    // Both databases start clean and the once-per-load migration guard is
    // reset, so each case exercises the upgrade path fresh.
    await deleteDatabase("radiator-routes-db");
    await deleteDatabase("radiator-routes-offline");
    __resetLegacyMigrationForTests();
  });

  afterEach(async () => {
    await deleteDatabase("radiator-routes-db");
    await deleteDatabase("radiator-routes-offline");
    __resetLegacyMigrationForTests();
  });

  it("copies rows from the standalone legacy database on first open", async () => {
    // Seed the legacy database exactly as v1 installs would have left it.
    await seedLegacyDatabase([sampleTrip("goa"), sampleTrip("kerala")]);

    const rows = await getAllOfflineTrips();
    expect(rows.map((r) => r.tripId).sort()).toEqual(["goa", "kerala"]);

    // And the source is removed so the app is not paying quota for two copies.
    expect(await databaseExists("radiator-routes-offline")).toBe(false);
  });

  it("is a no-op when no legacy database exists", async () => {
    const rows = await getAllOfflineTrips();
    expect(rows).toEqual([]);
  });
});
