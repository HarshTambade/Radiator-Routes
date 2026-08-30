// ─────────────────────────────────────────────────────────────────────────────
// Safety information service — free & open replacement for the GNews API
// ─────────────────────────────────────────────────────────────────────────────
// Uses Wikipedia's public REST API (no key required) for destination context
// and a curated static list of common travel advisories per region.
// Preserves the previous surface (fetchSafetyAlerts, fetchSafetyScore,
// fetchTravelAdvisory, SafetyAlert, SEVERITY_CONFIG, formatRelativeTime) so
// existing callers (SafetyWarnings.tsx) don't need to change.
// ─────────────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  title: string;
  description: string;
  content: string;
  url: string;
  image: string | null;
  publishedAt: string;
  source: { name: string; url: string };
}

export interface SafetyAlert {
  id: string;
  type:
    | "crime"
    | "kidnapping"
    | "drugs"
    | "sexual_violence"
    | "terrorism"
    | "natural_disaster"
    | "political_unrest"
    | "scam"
    | "general";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  location: string;
  emoji: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static curated travel advisories
// ─────────────────────────────────────────────────────────────────────────────
// These are common, evergreen advisories drawn from public government travel
// safety guidance (Indian MEA, UK FCDO, US State Department). They are not a
// substitute for checking the latest official advisory before you travel.

interface AdvisoryTemplate {
  type: SafetyAlert["type"];
  severity: SafetyAlert["severity"];
  title: string;
  description: string;
  emoji: string;
  keywords: string[]; // matches destination or country
  source: string;
  url: string;
}

const ADVISORY_TEMPLATES: AdvisoryTemplate[] = [
  // Universal traveller advisories
  {
    type: "scam",
    severity: "medium",
    title: "Tourist scams reported near popular attractions",
    description:
      "Pickpocketing, taxi over-charging and fake tour guides are common near major landmarks. Only use pre-paid taxis or licensed ride-hailing apps and avoid unverified tour operators.",
    emoji: "🎭",
    keywords: ["*"],
    source: "Traveller Safety Guide",
    url: "https://www.mea.gov.in/travelinformation.htm",
  },
  {
    type: "general",
    severity: "low",
    title: "Basic travel precautions",
    description:
      "Carry a photocopy of your passport, share your itinerary with a trusted contact, and register with your embassy for international trips. Keep local emergency numbers saved offline.",
    emoji: "📋",
    keywords: ["*"],
    source: "General Guidance",
    url: "https://www.mea.gov.in/travelinformation.htm",
  },

  // Region-specific advisories
  {
    type: "crime",
    severity: "high",
    title: "Elevated petty crime in tourist hubs",
    description:
      "Bag snatching and pickpocketing reported in crowded markets and train stations. Keep valuables in front-facing bags and stay alert in crowds.",
    emoji: "🔴",
    keywords: ["delhi", "mumbai", "bangkok", "paris", "barcelona", "rome"],
    source: "Local Police Advisory",
    url: "https://www.mea.gov.in/travelinformation.htm",
  },
  {
    type: "sexual_violence",
    severity: "high",
    title: "Solo female traveller advisory",
    description:
      "Women travelling alone should avoid isolated areas after dark, use licensed transport, and stay in central, well-reviewed accommodation. Emergency helpline for women: 1091.",
    emoji: "🚨",
    keywords: ["delhi", "mumbai", "kolkata", "chennai", "bangalore"],
    source: "MEA Advisory",
    url: "https://www.mea.gov.in/travelinformation.htm",
  },
  {
    type: "natural_disaster",
    severity: "medium",
    title: "Seasonal monsoon and flooding risk",
    description:
      "Heavy monsoon rains between June and September can disrupt travel, especially in low-lying and coastal areas. Check weather forecasts daily during this period.",
    emoji: "🌊",
    keywords: [
      "mumbai", "kerala", "goa", "chennai", "kolkata",
      "bangkok", "manila", "jakarta", "singapore",
    ],
    source: "IMD Advisory",
    url: "https://mausam.imd.gov.in/",
  },
  {
    type: "natural_disaster",
    severity: "high",
    title: "Earthquake and landslide risk in hilly regions",
    description:
      "Himalayan regions are seismically active. Landslides after heavy rain can close roads. Follow local authority advisories and travel with a reliable vehicle.",
    emoji: "⛰️",
    keywords: [
      "leh", "ladakh", "manali", "shimla", "kashmir", "srinagar",
      "uttarakhand", "sikkim", "darjeeling", "nepal", "kathmandu",
    ],
    source: "NDMA Advisory",
    url: "https://ndma.gov.in/",
  },
  {
    type: "political_unrest",
    severity: "medium",
    title: "Occasional demonstrations and protests",
    description:
      "Public protests can flare up with little notice and may temporarily disrupt transport and access to public spaces. Avoid demonstrations and follow local news.",
    emoji: "⚠️",
    keywords: ["delhi", "kashmir", "manipur", "assam", "bangkok", "hong kong"],
    source: "Public Safety Bulletin",
    url: "https://www.mea.gov.in/travelinformation.htm",
  },
  {
    type: "scam",
    severity: "medium",
    title: "Taxi and rickshaw over-charging",
    description:
      "Insist on the meter for pre-paid taxis, agree on the price for auto-rickshaws before boarding, and use ride-hailing apps like Ola or Uber where available.",
    emoji: "🚕",
    keywords: [
      "delhi", "mumbai", "kolkata", "bangalore", "chennai",
      "bangkok", "jaipur", "agra", "goa",
    ],
    source: "Consumer Advisory",
    url: "https://www.mea.gov.in/travelinformation.htm",
  },
  {
    type: "general",
    severity: "low",
    title: "Food and water safety",
    description:
      "Drink only bottled or filtered water, avoid raw salads in low-hygiene establishments, and eat freshly cooked hot food to minimise the risk of stomach upsets.",
    emoji: "🥤",
    keywords: [
      "delhi", "mumbai", "goa", "kerala", "rajasthan", "agra",
      "bangkok", "kathmandu", "jakarta",
    ],
    source: "WHO Travel Health",
    url: "https://www.who.int/travel-advice",
  },
  {
    type: "general",
    severity: "medium",
    title: "Altitude sickness in mountain destinations",
    description:
      "Ascending above 3,000 m can cause headaches, nausea, and fatigue. Acclimatise gradually, stay hydrated, and consult a doctor about preventive medication for high-altitude trips.",
    emoji: "🏔️",
    keywords: ["leh", "ladakh", "manali", "sikkim", "nepal", "everest", "kathmandu"],
    source: "Travel Health Advisory",
    url: "https://www.who.int/travel-advice",
  },
  {
    type: "general",
    severity: "low",
    title: "Beach and water safety",
    description:
      "Strong undercurrents and rip tides are common on some coasts. Swim only at flagged beaches with a lifeguard on duty and heed local warnings.",
    emoji: "🏖️",
    keywords: ["goa", "kerala", "mumbai", "andaman", "puri", "bali", "phuket"],
    source: "Coastal Safety Board",
    url: "https://www.mea.gov.in/travelinformation.htm",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Wikipedia enrichment (optional, no key)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchDestinationSummary(destination: string): Promise<{
  extract: string;
  url: string;
  publishedAt: string;
} | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(destination)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.extract) return null;
    return {
      extract: data.extract as string,
      url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(destination)}`,
      publishedAt: data.timestamp ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Return the curated safety alerts relevant to a destination. */
export async function fetchSafetyAlerts(
  destination: string,
  _maxAlertsPerCategory = 2,
): Promise<SafetyAlert[]> {
  const lower = destination.toLowerCase().trim();
  const matched: SafetyAlert[] = [];

  ADVISORY_TEMPLATES.forEach((template, idx) => {
    const applies =
      template.keywords.includes("*") ||
      template.keywords.some((k) => lower.includes(k));
    if (applies) {
      matched.push({
        id: `advisory-${idx}`,
        type: template.type,
        severity: template.severity,
        title: template.title,
        description: template.description,
        source: template.source,
        url: template.url,
        publishedAt: new Date().toISOString(),
        location: destination,
        emoji: template.emoji,
      });
    }
  });

  // Sort by severity (critical → high → medium → low)
  const severityOrder: Record<string, number> = {
    critical: 0, high: 1, medium: 2, low: 3,
  };
  matched.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  return matched;
}

/** Rough safety score derived from matching advisories. */
export async function fetchSafetyScore(destination: string): Promise<{
  score: number;
  label: string;
  color: string;
  summary: string;
}> {
  const alerts = await fetchSafetyAlerts(destination);

  let score = 0;
  for (const alert of alerts) {
    if (alert.severity === "critical") score += 25;
    else if (alert.severity === "high") score += 12;
    else if (alert.severity === "medium") score += 6;
    else score += 2;
  }
  score = Math.min(score, 100);

  let label: string;
  let color: string;
  let summary: string;

  if (score >= 70) {
    label = "Elevated Risk";
    color = "text-red-600";
    summary = `Several safety concerns apply to ${destination}. Exercise caution and check official advisories before travelling.`;
  } else if (score >= 40) {
    label = "Moderate Risk";
    color = "text-orange-500";
    summary = `Some safety concerns are reported for ${destination}. Stay alert and follow local advice.`;
  } else if (score >= 20) {
    label = "Low Risk";
    color = "text-yellow-500";
    summary = `Minor safety notes for ${destination}. Generally safe with normal precautions.`;
  } else {
    label = "Safe";
    color = "text-green-500";
    summary = `${destination} appears relatively safe based on standard travel guidance.`;
  }

  return { score, label, color, summary };
}

/** Fetches destination context articles from Wikipedia (free, no key). */
export async function fetchTravelAdvisory(
  destination: string,
): Promise<NewsArticle[]> {
  const summary = await fetchDestinationSummary(destination);
  if (!summary) return [];

  return [
    {
      title: `About ${destination}`,
      description: summary.extract,
      content: summary.extract,
      url: summary.url,
      image: null,
      publishedAt: summary.publishedAt,
      source: { name: "Wikipedia", url: "https://en.wikipedia.org" },
    },
  ];
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export const SEVERITY_CONFIG = {
  critical: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-600",
    badge: "bg-red-500 text-white",
    label: "Critical",
  },
  high: {
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-600",
    badge: "bg-orange-500 text-white",
    label: "High Risk",
  },
  medium: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-600",
    badge: "bg-yellow-400 text-black",
    label: "Medium",
  },
  low: {
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-600",
    badge: "bg-green-500 text-white",
    label: "Low",
  },
};
