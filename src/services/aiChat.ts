// ─────────────────────────────────────────────────────────────────────────────
// Jinny AI Chat Service — Full NLP Pipeline v2
// Groq API (llama-3.3-70b-versatile) + streaming + intent classification
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string;
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ─────────────────────────────────────────────────────────────────────────────
// Intent types
// ─────────────────────────────────────────────────────────────────────────────

export type Intent =
  | "NAVIGATE"
  | "CREATE_TRIP"
  | "SEARCH_FLIGHTS"
  | "SEARCH_HOTELS"
  | "CHECK_WEATHER"
  | "CHECK_TRAFFIC"
  | "GET_ROUTE"
  | "OPEN_MAPS"
  | "BUDGET_ANALYSIS"
  | "EXPLORE"
  | "GUIDE"
  | "SOS"
  | "GREETING"
  | "CANCEL_TRIP"
  | "SHARE_TRIP"
  | "CURRENCY"
  | "PACKING"
  | "VISA"
  | "GENERAL_CHAT";

// ─────────────────────────────────────────────────────────────────────────────
// Expanded intent patterns — richer coverage, ordered by specificity
// ─────────────────────────────────────────────────────────────────────────────

const INTENT_PATTERNS: Array<{ intent: Intent; patterns: RegExp[] }> = [
  // ── Greeting ──────────────────────────────────────────────────────────────
  {
    intent: "GREETING",
    patterns: [
      /^(hi+|hello+|hey+|howdy|sup|what'?s up|good\s*(morning|evening|afternoon|night)|namaste|namaskar|yo|hola|hiya|greetings)\b/i,
      /^(hey jinny|ok jinny|okay jinny|oi jinny|hi jinny|hello jinny|jinny)\s*[,!.]?\s*$/i,
      /^jinny\s*(are you there|you there|wake up|hello|hi|hey)\b/i,
    ],
  },

  // ── SOS / Emergency — check BEFORE others so it never gets misclassified ──
  {
    intent: "SOS",
    patterns: [
      /\b(sos|emergency|mayday|call\s*(for\s*)?help|i\s*(need|am)\s*(help|in danger|hurt|injured|lost|stranded|stuck)|danger|unsafe|in\s*trouble|accident|ambulance|police\s*now|fire\s*now|medical\s*(emergency|help)|save\s*me|can'?t\s*breathe)\b/i,
    ],
  },

  // ── Navigate ──────────────────────────────────────────────────────────────
  {
    intent: "NAVIGATE",
    patterns: [
      /\b(go\s*to|open|show\s*me|take\s*me\s*to|navigate\s*to|switch\s*to|launch|visit|jump\s*to)\b.*(dashboard|home\s*page?|itinerary|my\s*trips?|trips?|explore|friends|profile|guide|community|settings|planner)/i,
      /\b(dashboard|go\s*home|open\s*home|my\s*home)\b/i,
      /\b(back\s*to\s*(home|dashboard)|main\s*(page|screen))\b/i,
    ],
  },

  // ── Create trip ───────────────────────────────────────────────────────────
  {
    intent: "CREATE_TRIP",
    patterns: [
      /\b(plan|create|make|book|start|schedule|organise|organize|set\s*up|build|arrange)\b.*(trip|travel|visit|vacation|holiday|journey|tour|getaway|excursion|weekend)/i,
      /\b(i\s*(want|would like|wanna|d like)\s*to\s*(go|travel|visit|explore))\b/i,
      /\b(i'?m?\s*(going|planning|thinking)\s*(to|of\s*going\s*to))\b/i,
      /\b(trip\s*to|travel\s*to|visit(ing)?|vacation\s*in|holiday\s*in)\s+[A-Z][a-z]/,
      /\b(let'?s\s*(go\s*to|plan|visit)|take\s*me\s*(on\s*a\s*trip|to))\b/i,
    ],
  },

  // ── Flights ───────────────────────────────────────────────────────────────
  {
    intent: "SEARCH_FLIGHTS",
    patterns: [
      /\b(search|find|book|show|get|check|look\s*for)\b.*(flights?|airfare|plane\s*tickets?|fly|flying|air\s*travel)/i,
      /\bflights?\b.*(from|to|between|departing|arriving)/i,
      /\b(flying|fly(ing)?)\s*(from|to)\b/i,
      /\b(cheap(est)?\s*flights?|direct\s*flights?|one.way|round.trip\s*flights?)\b/i,
      /\bfrom\s+\w+\s+to\s+\w+\s+(flight|fly|ticket)/i,
    ],
  },

  // ── Hotels ────────────────────────────────────────────────────────────────
  {
    intent: "SEARCH_HOTELS",
    patterns: [
      /\b(search|find|book|show|get|check|look\s*for)\b.*(hotels?|stay|accommodation|hostel|resort|room|lodge|guesthouse|airbnb|motel|inn)\b/i,
      /\bwhere\s+(to\s*stay|can\s*i\s*stay|should\s*i\s*stay)\b/i,
      /\bhotels?\s*(in|at|near|around)\b/i,
      /\b(cheap(est)?\s*hotels?|luxury\s*hotels?|budget\s*(hotels?|stay))\b/i,
      /\bneed\s+a\s+(room|place\s*to\s*stay|hotel|bed)\b/i,
    ],
  },

  // ── Weather ───────────────────────────────────────────────────────────────
  {
    intent: "CHECK_WEATHER",
    patterns: [
      /\b(weather|forecast|climate|temperature|rain|snow|sunny|cloudy|humidity|monsoon|storm|heat|cold|wind)\b/i,
      /\bhow'?s?\s*(the\s*)?weather\b/i,
      /\bwill\s*it\s*(rain|snow|be\s*(sunny|hot|cold|windy))\b/i,
      /\bweather\s*(in|at|for|during)\b/i,
      /\bshould\s*i\s*(bring|pack|carry)\b.*(umbrella|jacket|raincoat|sunscreen)/i,
    ],
  },

  // ── Traffic ───────────────────────────────────────────────────────────────
  {
    intent: "CHECK_TRAFFIC",
    patterns: [
      /\b(traffic|congestion|road\s*conditions?|road\s*block|jam|gridlock)\b/i,
      /\bhow'?s?\s*(the\s*)?traffic\b/i,
      /\b(is\s*the\s*road|are\s*the\s*roads)\b/i,
      /\b(rush\s*hour|peak\s*hours?|highway\s*conditions?)\b/i,
    ],
  },

  // ── Route / directions ────────────────────────────────────────────────────
  {
    intent: "GET_ROUTE",
    patterns: [
      /\b(directions?\s*to|how\s*(do\s*i|to)\s*get\s*to|route\s*to|show\s*(me\s*)?the\s*way|best\s*way\s*to\s*get)\b/i,
      /\bhow\s*far\s*is\b/i,
      /\bget\s*(me\s*)?there\b/i,
      /\b(walking|driving|cycling)\s*(route|directions?|path)\b/i,
      /\b(distance\s*(from|to|between)|how\s*long\s*(to\s*drive|to\s*walk|does\s*it\s*take))\b/i,
    ],
  },

  // ── Maps navigation ───────────────────────────────────────────────────────
  {
    intent: "OPEN_MAPS",
    patterns: [
      /\b(open\s*(google\s*)?maps?|navigate\s*on\s*maps?|launch\s*maps?|show\s*on\s*map)\b/i,
      /\b(take\s*me\s*to|navigate\s*to)\s+[A-Z][a-z]/,
      /\b(pin|drop\s*a\s*pin)\s*(on|at)\b/i,
    ],
  },

  // ── Budget / expenses ─────────────────────────────────────────────────────
  {
    intent: "BUDGET_ANALYSIS",
    patterns: [
      /\b(budget|spend(ing)?|expenses?|cost(s)?|money|split|how\s*much|afford|bills?|payment|paid|saving|save\s*money|track\s*(spending|expenses?))\b/i,
      /\bhow\s*much\s*(did|have)\s*i\b/i,
      /\bsplit\s*(the\s*)?(bill|expenses?|cost(s)?|check)\b/i,
      /\b(upi|payment|pay|transfer)\b/i,
    ],
  },

  // ── Explore ───────────────────────────────────────────────────────────────
  {
    intent: "EXPLORE",
    patterns: [
      /\b(explore|discover|find\s*places?|what\s*to\s*(do|see|visit)|sightseeing|attractions?|points?\s*of\s*interest|poi|must\s*see|must\s*visit|hidden\s*gems?)\b/i,
      /\bthings?\s*to\s*do\b/i,
      /\b(popular|famous|top|best)\s*(places?|spots?|sites?|attractions?)\b/i,
      /\b(restaurants?|food|eat|dining|street\s*food)\s*(in|near|at)\b/i,
    ],
  },

  // ── Guide ─────────────────────────────────────────────────────────────────
  {
    intent: "GUIDE",
    patterns: [
      /\b(travel\s*guide|destination\s*guide|tips?\s*for|advice\s*(for|about)|tell\s*me\s*about|info\s*(on|about)|facts\s*about)\b.*(city|place|destination|country|state|region)?/i,
      /\bguide\s*(for|to|on)\b/i,
      /\b(about|regarding)\s+[A-Z][a-z]+.*(travel|visit|trip|tourism)/i,
      /\b(culture|history|language|currency|customs?)\s*(of|in)\b/i,
    ],
  },

  // ── Cancel trip ───────────────────────────────────────────────────────────
  {
    intent: "CANCEL_TRIP",
    patterns: [
      /\b(cancel|delete|remove|discard|abort)\b.*(trip|travel|plan|itinerary|booking)\b/i,
      /\b(i\s*(don'?t\s*want|won'?t)\s*(to\s*go|travel))\b/i,
    ],
  },

  // ── Share trip ────────────────────────────────────────────────────────────
  {
    intent: "SHARE_TRIP",
    patterns: [
      /\b(share|invite|send|add)\b.*(trip|friend|companion|travel\s*buddy|colleague|family)\b/i,
      /\b(collaborate|group\s*trip|travel\s*with\s*(friends?|family|group))\b/i,
    ],
  },

  // ── Currency ──────────────────────────────────────────────────────────────
  {
    intent: "CURRENCY",
    patterns: [
      /\b(exchange\s*rate|currency|convert|how\s*much\s*is\s*[\$€£¥₹]|rupees?\s*to|dollars?\s*to|euros?\s*to)\b/i,
      /\b(forex|foreign\s*exchange|money\s*exchange)\b/i,
    ],
  },

  // ── Packing ───────────────────────────────────────────────────────────────
  {
    intent: "PACKING",
    patterns: [
      /\b(pack(ing)?|what\s*to\s*(pack|bring|carry|take)|luggage|suitcase|bag(gage)?|essentials?\s*for)\b/i,
      /\bpacking\s*(list|tips?|guide|checklist)\b/i,
    ],
  },

  // ── Visa ──────────────────────────────────────────────────────────────────
  {
    intent: "VISA",
    patterns: [
      /\b(visa|passport|travel\s*documents?|entry\s*requirements?|e-?visa|visa\s*on\s*arrival)\b/i,
      /\b(do\s*i\s*need\s*a\s*visa|visa\s*(for|to|required))\b/i,
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Intent classifier — runs BEFORE hitting the LLM (zero latency / zero cost)
// ─────────────────────────────────────────────────────────────────────────────

export function classifyIntent(text: string): Intent {
  const normalized = text.toLowerCase().trim();
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(normalized))) {
      return intent;
    }
  }
  return "GENERAL_CHAT";
}

// ─────────────────────────────────────────────────────────────────────────────
// Destination extractor — handles natural Indian + global phrasing
// ─────────────────────────────────────────────────────────────────────────────

export function extractDestination(text: string): string | null {
  // Try specific lead phrases first (highest precision)
  const leadPatterns = [
    /\b(?:trip\s*to|travel\s*to|visit(?:ing)?|going\s*to|plan(?:ning)?\s*(?:a\s*trip\s*)?to|fly(?:ing)?\s*to|flight\s*to|vacation\s*in|holiday\s*in|going\s*to|headed\s*(?:to|for)|bound\s*for|explore)\s+([A-Z][a-zA-Z\s]{1,30}?)(?=\s*(?:for|in|on|this|next|from|with|and|,|\.|\?|!|$))/,
    /\b(?:to|in|at|for|near|around)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/,
    /\b(?:from)\s+[A-Z][a-zA-Z]+\s+(?:to)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/,
  ];

  for (const p of leadPatterns) {
    const m = text.match(p);
    const candidate = m?.[1]?.trim();
    if (candidate && candidate.length > 1 && candidate.length < 40) {
      // Exclude common false positives
      const skip =
        /^(me|you|us|the|a|an|my|your|this|that|there|here|now|india|home)$/i;
      if (!skip.test(candidate)) return candidate;
    }
  }

  // Fallback: find a capitalised proper noun after common travel keywords
  const fallback = text.match(
    /(?:^|\s)([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})(?:\s|$|,|\.|!|\?)/,
  );
  if (fallback?.[1] && fallback[1].length > 2) return fallback[1].trim();

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract trip duration (days)
// ─────────────────────────────────────────────────────────────────────────────

export function extractDays(text: string): number {
  const m =
    text.match(/(\d+)\s*(?:day|days|night|nights)/i) ||
    text.match(/(?:for|spend|stay(?:ing)?)\s+(\d+)/i) ||
    text.match(/(\d+)\s*(?:week|wk)s?/i);
  if (m) {
    const val = parseInt(m[1], 10);
    // weeks → days
    if (/week|wk/i.test(m[0])) return val * 7;
    return val;
  }
  if (/\ba\s+week\b/i.test(text)) return 7;
  if (/\ba?\s*weekend\b/i.test(text)) return 3;
  if (/\bfortnight\b/i.test(text)) return 14;
  if (/\bmonth\b/i.test(text)) return 30;
  return 3; // sensible default
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract budget from natural language
// ─────────────────────────────────────────────────────────────────────────────

export function extractBudget(text: string): number | null {
  const m =
    text.match(/(?:₹|rs\.?|inr|budget\s*(?:of|is|=)?)\s*([\d,]+)\s*k?\b/i) ||
    text.match(/([\d,]+)\s*k?\s*(?:rupees?|inr|rs)/i) ||
    text.match(/budget\s+(?:of\s+)?([\d,]+)\s*k?\b/i) ||
    text.match(/\$([\d,]+)\s*k?\b/) ||
    text.match(/([\d,]+)\s*dollars?\b/i);
  if (!m) return null;
  let val = parseInt(m[1].replace(/,/g, ""), 10);
  if (/k\b/i.test(m[0])) val *= 1000;
  // If dollar amount, rough INR conversion
  if (/\$|dollar/i.test(m[0])) val = Math.round(val * 83);
  return val;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract departure date from natural language
// ─────────────────────────────────────────────────────────────────────────────

export function extractDate(text: string): string | null {
  const today = new Date();
  const lower = text.toLowerCase();

  // Relative dates
  if (/\btoday\b/.test(lower)) return formatLocalDate(today);
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return formatLocalDate(d);
  }
  if (/\bday\s*after\s*tomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return formatLocalDate(d);
  }
  if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return formatLocalDate(d);
  }
  if (/\bnext\s+month\b/.test(lower)) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1);
    return formatLocalDate(d);
  }

  // Weekday names
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  for (let i = 0; i < days.length; i++) {
    if (new RegExp(`\\b(next\\s+)?${days[i]}\\b`).test(lower)) {
      const d = new Date(today);
      const diff = (i - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return formatLocalDate(d);
    }
  }

  // Month names — "15th August", "August 15", "15 Aug 2025"
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "jan",
    "feb",
    "mar",
    "apr",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  for (let mi = 0; mi < 12; mi++) {
    const name = months[mi] || months[mi + 12];
    const pattern = new RegExp(
      `(\\d{1,2})(?:st|nd|rd|th)?\\s+${name}(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?|${name}(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\\s+(\\d{1,2})(?:st|nd|rd|th)?`,
      "i",
    );
    const m = text.match(pattern);
    if (m) {
      const day = parseInt(m[1] || m[2], 10);
      const year = today.getFullYear();
      const d = new Date(year, mi % 12, day);
      // If date already passed this year, assume next year
      if (d < today) d.setFullYear(year + 1);
      return formatLocalDate(d);
    }
  }

  // ISO or numeric: 2025-08-15 or 15/08/2025 or 08-15-2025
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const dmy = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract passenger / traveller count
// ─────────────────────────────────────────────────────────────────────────────

export function extractPassengers(text: string): number {
  const m =
    text.match(
      /(\d+)\s*(?:people|persons?|adults?|passengers?|travell?ers?|pax|of\s+us)\b/i,
    ) ||
    text.match(/(?:for|with)\s+(\d+)\b/i) ||
    text.match(/\b(\d+)\s*tickets?\b/i);
  if (m) return parseInt(m[1], 10);
  if (
    /\bcouple\b|\btwo\s+of\s+us\b|\bme\s+and\s+(my\s+)?(wife|husband|partner|friend)\b/i.test(
      text,
    )
  )
    return 2;
  if (/\bfamily\b|\bgroup\b/i.test(text)) return 4;
  if (/\bsolo\b|\bjust\s+me\b|\balone\b|\bmyself\b/i.test(text)) return 1;
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// City → IATA airport code (expanded global + India coverage)
// ─────────────────────────────────────────────────────────────────────────────

const CITY_TO_IATA: Record<string, string> = {
  // India — metro
  delhi: "DEL",
  "new delhi": "DEL",
  ndls: "DEL",
  mumbai: "BOM",
  bombay: "BOM",
  bangalore: "BLR",
  bengaluru: "BLR",
  blr: "BLR",
  hyderabad: "HYD",
  hyd: "HYD",
  chennai: "MAA",
  madras: "MAA",
  kolkata: "CCU",
  calcutta: "CCU",
  // India — tier 2
  goa: "GOI",
  "north goa": "GOI",
  "south goa": "GOI",
  pune: "PNQ",
  ahmedabad: "AMD",
  jaipur: "JAI",
  cochin: "COK",
  kochi: "COK",
  lucknow: "LKO",
  varanasi: "VNS",
  banaras: "VNS",
  benares: "VNS",
  amritsar: "ATQ",
  bhubaneswar: "BBI",
  patna: "PAT",
  nagpur: "NAG",
  indore: "IDR",
  srinagar: "SXR",
  leh: "IXL",
  ladakh: "IXL",
  udaipur: "UDR",
  coimbatore: "CJB",
  visakhapatnam: "VTZ",
  vizag: "VTZ",
  chandigarh: "IXC",
  raipur: "RPR",
  ranchi: "IXR",
  guwahati: "GAU",
  imphal: "IMF",
  bhopal: "BHO",
  agra: "AGR",
  jodhpur: "JDH",
  aurangabad: "IXU",
  mangalore: "IXE",
  tiruchirappalli: "TRZ",
  trichy: "TRZ",
  "port blair": "IXZ",
  andaman: "IXZ",
  dibrugarh: "DIB",
  jammu: "IXJ",
  dehradun: "DED",
  shimla: "SLV",
  kullu: "KUU",
  manali: "KUU",
  hubli: "HBX",
  belgaum: "IXG",
  mysore: "MYQ",
  madurai: "IXM",
  tirupati: "TIR",
  kolhapur: "KLH",
  rajahmundry: "RJA",
  // International — Asia
  dubai: "DXB",
  "abu dhabi": "AUH",
  sharjah: "SHJ",
  singapore: "SIN",
  bangkok: "BKK",
  suvarnabhumi: "BKK",
  "kuala lumpur": "KUL",
  malaysia: "KUL",
  "hong kong": "HKG",
  tokyo: "NRT",
  osaka: "KIX",
  beijing: "PEK",
  shanghai: "PVG",
  seoul: "ICN",
  kathmandu: "KTM",
  colombo: "CMB",
  srilanka: "CMB",
  dhaka: "DAC",
  karachi: "KHI",
  lahore: "LHE",
  male: "MLE",
  maldives: "MLE",
  // International — Europe
  london: "LHR",
  "london heathrow": "LHR",
  paris: "CDG",
  amsterdam: "AMS",
  frankfurt: "FRA",
  rome: "FCO",
  milan: "MXP",
  madrid: "MAD",
  barcelona: "BCN",
  zurich: "ZRH",
  vienna: "VIE",
  istanbul: "IST",
  athens: "ATH",
  lisbon: "LIS",
  prague: "PRG",
  budapest: "BUD",
  moscow: "SVO",
  // International — Americas
  "new york": "JFK",
  nyc: "JFK",
  "los angeles": "LAX",
  chicago: "ORD",
  miami: "MIA",
  toronto: "YYZ",
  vancouver: "YVR",
  "sao paulo": "GRU",
  "mexico city": "MEX",
  // International — Oceania / Africa
  sydney: "SYD",
  melbourne: "MEL",
  auckland: "AKL",
  cairo: "CAI",
  nairobi: "NBO",
  johannesburg: "JNB",
};

export function cityToIATA(city: string): string {
  const key = city.toLowerCase().trim();
  return CITY_TO_IATA[key] ?? city.toUpperCase().slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Local date formatter (YYYY-MM-DD, no timezone shift)
// ─────────────────────────────────────────────────────────────────────────────

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent → precise action hint injected into the system prompt
// ─────────────────────────────────────────────────────────────────────────────

function buildIntentHint(intent: Intent, rawText: string): string {
  const dest = extractDestination(rawText);
  const days = extractDays(rawText);
  const budget = extractBudget(rawText);
  const date = extractDate(rawText);
  const pax = extractPassengers(rawText);

  switch (intent) {
    case "GREETING":
      return `[INTENT: GREETING] — Greet the user warmly as Jinny. Keep it to 1-2 sentences. No JSON action needed unless there is a clear follow-up request in the same message.`;

    case "NAVIGATE": {
      const pathMap: Record<string, string> = {
        dashboard: "/dashboard",
        home: "/dashboard",
        "home page": "/dashboard",
        itinerary: "/itinerary",
        trips: "/itinerary",
        "my trips": "/itinerary",
        planner: "/itinerary",
        explore: "/explore",
        discover: "/explore",
        friends: "/friends",
        profile: "/profile",
        account: "/profile",
        guide: "/guide",
        community: "/community",
        settings: "/profile",
      };
      const lower = rawText.toLowerCase();
      const matched = Object.entries(pathMap).find(([k]) => lower.includes(k));
      const path = matched ? matched[1] : "/dashboard";
      return `[INTENT: NAVIGATE] — User wants to go to ${path}. Emit navigate_to action immediately. No extra explanation needed.`;
    }

    case "CREATE_TRIP":
      return `[INTENT: CREATE_TRIP] — User wants to plan a trip${dest ? ` to ${dest}` : ""}. Duration: ${days} days. Budget: ${budget ? `₹${budget.toLocaleString("en-IN")}` : "not specified"}. Departure: ${date ?? "not specified"}. Passengers: ${pax}. Emit create_trip action. If destination is unclear, ask ONE short question.`;

    case "SEARCH_FLIGHTS": {
      const parts = rawText.match(
        /from\s+(\w[\w\s]*?)\s+to\s+(\w[\w\s]*?)(?:\s+on|\s+for|\s*$)/i,
      );
      const origin = parts ? cityToIATA(parts[1].trim()) : "DEL";
      const destination = parts
        ? cityToIATA(parts[2].trim())
        : dest
          ? cityToIATA(dest)
          : "";
      const depDate =
        date ?? formatLocalDate(new Date(Date.now() + 7 * 86400000));
      return `[INTENT: SEARCH_FLIGHTS] — User wants flights. Extracted: origin=${origin}, destination=${destination}, date=${depDate}, passengers=${pax}. Emit search_flights action immediately with these values. Use real IATA codes.`;
    }

    case "SEARCH_HOTELS":
      return `[INTENT: SEARCH_HOTELS] — User wants hotels${dest ? ` in ${dest} (IATA: ${cityToIATA(dest)})` : ""}. Check-in: ${date ?? "not specified"}. Passengers: ${pax}. Emit search_hotels action immediately.`;

    case "CHECK_WEATHER":
      return `[INTENT: CHECK_WEATHER] — User wants weather${dest ? ` for ${dest}` : " for their current/upcoming destination"}. Emit check_weather action immediately. Do not ask for confirmation.`;

    case "CHECK_TRAFFIC":
      return `[INTENT: CHECK_TRAFFIC] — User wants live traffic info${dest ? ` near ${dest}` : ""}. Emit check_traffic action immediately.`;

    case "GET_ROUTE":
      return `[INTENT: GET_ROUTE] — User wants route/directions${dest ? ` to ${dest}` : ""}. Emit get_route or open_maps action. Ask for destination only if completely absent.`;

    case "OPEN_MAPS":
      return `[INTENT: OPEN_MAPS] — User wants to open maps navigation${dest ? ` to ${dest}` : ""}. Emit open_maps action immediately.`;

    case "BUDGET_ANALYSIS":
      return `[INTENT: BUDGET_ANALYSIS] — User wants budget or expense info. Use their trip context to emit budget_alert with real numbers. If no trip exists, navigate to /itinerary.`;

    case "EXPLORE":
      return `[INTENT: EXPLORE] — User wants to discover places${dest ? ` in ${dest}` : ""}. Emit navigate_to /explore OR explore_search action.`;

    case "GUIDE":
      return `[INTENT: GUIDE] — User wants a travel guide${dest ? ` for ${dest}` : ""}. Emit guide_search or navigate_to /guide action immediately.`;

    case "CANCEL_TRIP":
      return `[INTENT: CANCEL_TRIP] — User wants to cancel/delete a trip. Navigate to /itinerary so they can manage their trips. Confirm intent gently.`;

    case "SHARE_TRIP":
      return `[INTENT: SHARE_TRIP] — User wants to share trip or invite companions. Navigate to /friends and explain the collaborative planning feature.`;

    case "CURRENCY":
      return `[INTENT: CURRENCY] — User wants currency/exchange rate info. Answer from your knowledge with approximate rates. Recommend checking a live converter for exact figures.`;

    case "PACKING":
      return `[INTENT: PACKING] — User wants packing advice${dest ? ` for ${dest}` : ""}. Give a concise packing list tailored to the destination and season. Check weather if destination is known.`;

    case "VISA":
      return `[INTENT: VISA] — User wants visa/travel document info${dest ? ` for ${dest}` : ""}. Share what you know and recommend checking the official embassy website for the latest requirements.`;

    case "SOS":
      return `[INTENT: SOS] — URGENT. Respond calmly and immediately. Indian emergency numbers: Police 100, Ambulance 108, Women's Helpline 1091, Fire 101, Disaster 1078, Child Helpline 1098. Emit navigate_to /dashboard. Do not delay with pleasantries.`;

    default:
      return `[INTENT: GENERAL_CHAT] — Answer conversationally using the user's trip context. Keep response concise. Emit actions only if the request clearly implies one.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main system prompt — Jinny's identity, capabilities, action schema
// ─────────────────────────────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are Jinny — the AI travel agent embedded in Radiator Routes. You are like J.A.R.V.I.S. for travel: proactive, precise, warm, and deeply capable.

## PERSONALITY
- Speak like a sharp, friendly AI concierge. Short punchy lines: "Right away.", "Already on it.", "Consider it done.", "I've run the numbers.", "Quite.", "Allow me."
- Address the user by name when known. Reference their trips naturally to feel personal.
- Be decisive. One clever/warm line max per response — never rambling.
- If a detail is missing, ask exactly ONE short clarifying question.
- Never say "I cannot", "I don't have access", or apologise excessively.

## PAGES YOU CONTROL
- /dashboard — trip overview, quick stats
- /itinerary — trip list; /itinerary/:tripId — day-by-day planner
- /explore — discover places (OpenTripMap)
- /guide — AI destination guides
- /friends — travel companions, DMs, invites
- /community — travel communities
- /profile — user preferences, travel history

## RESPONSE FORMAT
1. One short sentence in Jinny's voice acknowledging the request.
2. IMMEDIATELY emit the JSON action block(s) inside \`\`\`json ... \`\`\` fences.
3. After tool results are injected, summarise in 2–3 crisp sentences.

## AVAILABLE ACTIONS

### Navigate to a page
\`\`\`json
{"action":"navigate_to","path":"/dashboard","label":"Opening Dashboard"}
\`\`\`
Valid paths: /dashboard, /itinerary, /itinerary/:id, /explore, /guide, /friends, /community, /profile

### Create a trip
\`\`\`json
{"action":"create_trip","name":"Goa Getaway","destination":"Goa","country":"India","days":5,"budget":40000}
\`\`\`

### Generate itinerary for existing trip
\`\`\`json
{"action":"generate_itinerary","trip_id":"UUID_HERE"}
\`\`\`

### Search flights (MUST use IATA codes)
\`\`\`json
{"action":"search_flights","origin":"DEL","destination":"GOI","departureDate":"2025-08-15","returnDate":"2025-08-20","adults":1}
\`\`\`

### Search hotels
\`\`\`json
{"action":"search_hotels","cityCode":"GOI","checkInDate":"2025-08-15","checkOutDate":"2025-08-18","adults":1}
\`\`\`

### Check weather
\`\`\`json
{"action":"check_weather","destination":"Goa","days":7}
\`\`\`

### Check live traffic
\`\`\`json
{"action":"check_traffic","destination":"Mumbai","lat":19.076,"lon":72.877}
\`\`\`

### Calculate route (ORS)
\`\`\`json
{"action":"get_route","originLat":28.6139,"originLon":77.209,"destLat":27.1751,"destLon":78.0421,"destName":"Taj Mahal","profile":"driving-car"}
\`\`\`
Profiles: driving-car | foot-walking | cycling-regular

### Open Google Maps navigation
\`\`\`json
{"action":"open_maps","lat":27.1751,"lon":78.0421,"name":"Taj Mahal","mode":"driving"}
\`\`\`

### Budget alert
\`\`\`json
{"action":"budget_alert","message":"80% of budget used","spent":32000,"remaining":8000,"suggestions":["Cook dinner in","Skip paid museum entry"]}
\`\`\`

### Explore places
\`\`\`json
{"action":"explore_search","query":"Temples in Varanasi"}
\`\`\`

### Travel guide
\`\`\`json
{"action":"guide_search","destination":"Rajasthan"}
\`\`\`

### Assess activities vs weather
\`\`\`json
{"action":"assess_activities_weather","destination":"Kerala","lat":10.8505,"lon":76.2711,"activities":[{"name":"Backwater cruise","category":"attraction","date":"2025-08-15"}]}
\`\`\`

## STRICT RULES
1. Use REAL IATA codes — never guess. DEL=Delhi, BOM=Mumbai, BLR=Bangalore, MAA=Chennai, CCU=Kolkata, HYD=Hyderabad, GOI=Goa, PNQ=Pune, AMD=Ahmedabad, JAI=Jaipur, COK=Kochi, LKO=Lucknow, VNS=Varanasi, ATQ=Amritsar, SXR=Srinagar, IXL=Leh, UDR=Udaipur, SIN=Singapore, DXB=Dubai, LHR=London, CDG=Paris, JFK=New York, NRT=Tokyo, SYD=Sydney.
2. Never fabricate flight prices, hotel rates, or weather data — always emit the action to fetch live data.
3. Emit actions FIRST, then explain when results return.
4. If an [INTENT: X] hint is present, follow it precisely.
5. For SOS: respond calmly — Police 100, Ambulance 108, Women 1091, Fire 101.
6. Always check weather proactively when an outdoor destination is mentioned.

## EXAMPLES

User: "Hey Jinny"
Jinny: "At your service. What shall we tackle today? 🧡"

User: "Plan a 5-day trip to Goa for ₹40,000"
Jinny: "Goa for 5 days — excellent choice. Let me check conditions and set it up."
\`\`\`json
{"action":"check_weather","destination":"Goa","days":7}
\`\`\`
\`\`\`json
{"action":"create_trip","name":"Goa Getaway","destination":"Goa","country":"India","days":5,"budget":40000}
\`\`\`

User: "Flights from Delhi to Mumbai on 15th August"
Jinny: "Scanning that route now. ✈️"
\`\`\`json
{"action":"search_flights","origin":"DEL","destination":"BOM","departureDate":"2025-08-15","adults":1}
\`\`\`

User: "Open explore"
Jinny: "Right away."
\`\`\`json
{"action":"navigate_to","path":"/explore","label":"Opening Explore"}
\`\`\`

User: "Navigate to Taj Mahal"
Jinny: "Plotting the route — I'd leave before 9 AM to beat the crowds."
\`\`\`json
{"action":"open_maps","lat":27.1751,"lon":78.0421,"name":"Taj Mahal","mode":"driving"}
\`\`\`

User: "How's the weather in Shimla?"
Jinny: "Fetching the latest for Shimla."
\`\`\`json
{"action":"check_weather","destination":"Shimla","days":7}
\`\`\`

User: "I need help, I'm lost"
Jinny: "Stay calm. I'm here. Emergency numbers: Police 100 · Ambulance 108 · Women's Helpline 1091. Share your location with someone you trust."
\`\`\`json
{"action":"navigate_to","path":"/dashboard","label":"Opening Dashboard for safety"}
\`\`\`
`;

// ─────────────────────────────────────────────────────────────────────────────
// Load user + trip context from Supabase
// ─────────────────────────────────────────────────────────────────────────────

async function loadPersonalContext(): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return "";

    const [{ data: profile }, { data: trips }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", session.user.id).single(),
      supabase
        .from("trips")
        .select("*")
        .order("start_date", { ascending: false })
        .limit(8),
    ]);

    let ctx = "\n\n## USER CONTEXT\n";

    if (profile) {
      const p = profile as Record<string, unknown>;
      ctx += `User: ${p.name ?? "Traveller"} (ID: ${session.user.id})\n`;
      const prefs = (p.preferences as Record<string, unknown>) ?? {};
      if (Object.keys(prefs).length > 0)
        ctx += `Preferences: ${JSON.stringify(prefs)}\n`;
      const personality =
        (p.travel_personality as Record<string, unknown>) ?? {};
      if (Object.keys(personality).length > 0)
        ctx += `Travel personality: ${JSON.stringify(personality)}\n`;
      const history = (p.travel_history as unknown[]) ?? [];
      if (history.length > 0)
        ctx += `Past destinations: ${history
          .map((h) =>
            typeof h === "object" && h !== null
              ? ((h as Record<string, string>).destination ?? JSON.stringify(h))
              : String(h),
          )
          .join(", ")}\n`;
    }

    if (trips && trips.length > 0) {
      ctx += `\nTrips (${trips.length}):\n`;
      for (const trip of trips) {
        const t = trip as Record<string, unknown>;
        ctx += `- "${t.name}" | ${t.destination}, ${t.country ?? ""} | ${t.start_date} → ${t.end_date} | Budget: ₹${Number(t.budget_total ?? 0).toLocaleString("en-IN")} | Status: ${t.status} | ID: ${t.id}\n`;
      }

      // Latest trip activities (up to 15)
      const latest = trips[0] as Record<string, unknown>;
      if (latest?.id) {
        const { data: itin } = await supabase
          .from("itineraries")
          .select("id")
          .eq("trip_id", latest.id as string)
          .order("version", { ascending: false })
          .limit(1);

        if (itin && itin.length > 0) {
          const { data: acts } = await supabase
            .from("activities")
            .select("name, category, start_time, cost, location_name")
            .eq("itinerary_id", itin[0].id)
            .order("start_time", { ascending: true })
            .limit(15);

          if (acts && acts.length > 0) {
            ctx += `\nLatest itinerary for "${latest.name}" (${acts.length} activities):\n`;
            for (const a of acts) {
              const act = a as Record<string, unknown>;
              const time = act.start_time
                ? new Date(act.start_time as string).toLocaleDateString(
                    "en-IN",
                    {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )
                : "TBD";
              ctx += `  ${time}: ${act.name} [${act.category ?? "activity"}]${act.location_name ? ` @ ${act.location_name}` : ""}${act.cost ? ` ₹${act.cost}` : ""}\n`;
            }
          }
        }
      }

      const totalBudget = (trips as Record<string, unknown>[]).reduce(
        (s, t) => s + Number(t.budget_total ?? 0),
        0,
      );
      ctx += `Total budget across all trips: ₹${totalBudget.toLocaleString("en-IN")}\n`;
    }

    return ctx;
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Robust JSON extractor — handles various LLM output formats
// ─────────────────────────────────────────────────────────────────────────────

export function extractAllJsonBlocks(text: string): unknown[] {
  const results: unknown[] = [];

  // Strategy 1: standard ```json ... ``` fences
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && typeof parsed === "object") results.push(parsed);
    } catch {
      try {
        const repaired = match[1]
          .trim()
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
          .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?\s*:/g, '"$2":')
          .replace(/:\s*'([^']*)'/g, ': "$1"');
        const parsed2 = JSON.parse(repaired);
        if (parsed2 && typeof parsed2 === "object") results.push(parsed2);
      } catch {
        /* skip */
      }
    }
  }

  if (results.length > 0) return results;

  // Strategy 2: bare JSON objects { ... } not in code fences
  const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g;
  while ((match = objectRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[0]);
      if ((parsed as any)?.action) results.push(parsed);
    } catch {
      /* skip */
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible message type
// ─────────────────────────────────────────────────────────────────────────────

interface OAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function buildMessages(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): OAIMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch helper — shared by streaming + non-streaming
// ─────────────────────────────────────────────────────────────────────────────

async function groqFetch(
  messages: OAIMessage[],
  stream: boolean,
  temperature = 0.3,
  maxTokens = 3072,
): Promise<Response> {
  if (!GROQ_API_KEY) throw new Error("VITE_GROQ_API_KEY is not configured");

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
      stop: null,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    if (res.status >= 500) throw new Error(`GROQ_SERVER_ERROR_${res.status}`);
    throw new Error(`Groq API [${res.status}]: ${errText.slice(0, 200)}`);
  }

  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the full system prompt with intent hint + user context
// ─────────────────────────────────────────────────────────────────────────────

async function buildSystemPrompt(lastUserMessage: string): Promise<string> {
  const personalCtx = await loadPersonalContext();
  const intent = classifyIntent(lastUserMessage);
  const intentHint = buildIntentHint(intent, lastUserMessage);
  return `${BASE_SYSTEM_PROMPT}\n\n## DETECTED INTENT\n${intentHint}${personalCtx}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-streaming chat
// ─────────────────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const systemPrompt = await buildSystemPrompt(lastUser?.content ?? "");
  const res = await groqFetch(buildMessages(systemPrompt, messages), false);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming chat — calls onChunk for each delta
// ─────────────────────────────────────────────────────────────────────────────

export async function streamChatMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const systemPrompt = await buildSystemPrompt(lastUser?.content ?? "");

  let res: Response;
  try {
    res = await groqFetch(buildMessages(systemPrompt, messages), true);
  } catch (err) {
    throw err;
  }

  if (!res.body) {
    const text = await sendChatMessage(messages);
    onChunk(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  const processLine = (line: string) => {
    if (!line.startsWith("data: ")) return;
    const jsonStr = line.slice(6).trim();
    if (!jsonStr || jsonStr === "[DONE]") return;
    try {
      const parsed = JSON.parse(jsonStr);
      const chunk: string = parsed.choices?.[0]?.delta?.content ?? "";
      if (chunk) {
        fullText += chunk;
        onChunk(chunk);
      }
    } catch {
      /* malformed chunk — skip */
    }
  };

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.trim() === "data: [DONE]") break outer;
      processLine(line);
    }
  }

  if (buffer.trim()) processLine(buffer.trim());

  return fullText;
}
