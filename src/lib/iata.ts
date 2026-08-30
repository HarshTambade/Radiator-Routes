// ─────────────────────────────────────────────────────────────────────────────
// City ⇄ IATA airport code lookup
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth — previously duplicated in aiChat.ts and amadeus.ts.
// Covers Indian metros + tier-2 cities and major international hubs.
// ─────────────────────────────────────────────────────────────────────────────

export const CITY_TO_IATA: Readonly<Record<string, string>> = {
  // ── India — metros ──────────────────────────────────────────────────────
  delhi: "DEL", "new delhi": "DEL", ndls: "DEL",
  mumbai: "BOM", bombay: "BOM",
  bangalore: "BLR", bengaluru: "BLR", blr: "BLR",
  hyderabad: "HYD", hyd: "HYD",
  chennai: "MAA", madras: "MAA",
  kolkata: "CCU", calcutta: "CCU",

  // ── India — tier 2 / tourist ────────────────────────────────────────────
  goa: "GOI", "north goa": "GOI", "south goa": "GOI",
  pune: "PNQ", ahmedabad: "AMD", jaipur: "JAI",
  cochin: "COK", kochi: "COK", lucknow: "LKO",
  varanasi: "VNS", banaras: "VNS", benares: "VNS",
  amritsar: "ATQ", bhubaneswar: "BBI", patna: "PAT",
  nagpur: "NAG", indore: "IDR", srinagar: "SXR",
  leh: "IXL", ladakh: "IXL", udaipur: "UDR",
  coimbatore: "CJB", visakhapatnam: "VTZ", vizag: "VTZ",
  chandigarh: "IXC", raipur: "RPR", ranchi: "IXR",
  guwahati: "GAU", imphal: "IMF", bhopal: "BHO",
  agra: "AGR", jodhpur: "JDH", aurangabad: "IXU",
  mangalore: "IXE", tiruchirappalli: "TRZ", trichy: "TRZ",
  "port blair": "IXZ", andaman: "IXZ", dibrugarh: "DIB",
  jammu: "IXJ", dehradun: "DED", shimla: "SLV",
  kullu: "KUU", manali: "KUU", hubli: "HBX",
  belgaum: "IXG", mysore: "MYQ", madurai: "IXM",
  tirupati: "TIR", kolhapur: "KLH", rajahmundry: "RJA",

  // ── Asia ────────────────────────────────────────────────────────────────
  dubai: "DXB", "abu dhabi": "AUH", sharjah: "SHJ",
  singapore: "SIN", bangkok: "BKK", suvarnabhumi: "BKK",
  "kuala lumpur": "KUL", malaysia: "KUL", "hong kong": "HKG",
  tokyo: "NRT", osaka: "KIX", beijing: "PEK", shanghai: "PVG",
  seoul: "ICN", kathmandu: "KTM", colombo: "CMB", srilanka: "CMB",
  dhaka: "DAC", karachi: "KHI", lahore: "LHE",
  male: "MLE", maldives: "MLE",

  // ── Europe ──────────────────────────────────────────────────────────────
  london: "LHR", "london heathrow": "LHR", paris: "CDG",
  amsterdam: "AMS", frankfurt: "FRA", rome: "FCO", milan: "MXP",
  madrid: "MAD", barcelona: "BCN", zurich: "ZRH", vienna: "VIE",
  istanbul: "IST", athens: "ATH", lisbon: "LIS", prague: "PRG",
  budapest: "BUD", moscow: "SVO",

  // ── Americas ────────────────────────────────────────────────────────────
  "new york": "JFK", nyc: "JFK", "los angeles": "LAX",
  chicago: "ORD", miami: "MIA", toronto: "YYZ", vancouver: "YVR",
  "sao paulo": "GRU", "mexico city": "MEX",

  // ── Oceania / Africa ────────────────────────────────────────────────────
  sydney: "SYD", melbourne: "MEL", auckland: "AKL",
  cairo: "CAI", nairobi: "NBO", johannesburg: "JNB",
};

/** Reverse lookup, first city name wins for each code. */
export const IATA_TO_CITY: Readonly<Record<string, string>> = Object.entries(
  CITY_TO_IATA,
).reduce<Record<string, string>>((acc, [city, code]) => {
  if (!acc[code]) acc[code] = city;
  return acc;
}, {});

/** All Indian domestic codes — used for fare-band estimation. */
export const INDIAN_IATA: ReadonlySet<string> = new Set([
  "DEL","BOM","BLR","HYD","MAA","CCU","GOI","PNQ","AMD","JAI","COK","LKO",
  "VNS","ATQ","BBI","PAT","NAG","IDR","SXR","IXL","UDR","CJB","VTZ","IXC",
  "RPR","IXR","GAU","IMF","BHO","AGR","JDH","IXU","IXE","TRZ","IXZ","DIB",
  "IXJ","DED","SLV","KUU","HBX","IXG","MYQ","IXM","TIR","KLH","RJA",
]);

/** Short-haul international hubs from India. */
export const SHORT_HAUL_IATA: ReadonlySet<string> = new Set([
  "DXB","AUH","SHJ","SIN","BKK","KUL","CMB","KTM","DAC","MLE","KHI","LHE",
]);

/**
 * Resolve a city name or code to an IATA code.
 * Already-valid 3-letter codes pass through; unknown names fall back to the
 * first three letters uppercased.
 */
export function cityToIATA(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";

  const known = CITY_TO_IATA[raw.toLowerCase()];
  if (known) return known;

  const upper = raw.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;

  return upper.slice(0, 3);
}

/** Resolve an IATA code back to a display city name. */
export function iataToCity(code: string): string {
  const city = IATA_TO_CITY[(code ?? "").toUpperCase()];
  return city ? titleCase(city) : code;
}

export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
