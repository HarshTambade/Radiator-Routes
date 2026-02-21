// GNews API service for real-time safety warnings
// API Key: 8345779e346229659945cc498c821838

const GNEWS_API_KEY = "8345779e346229659945cc498c821838";
const GNEWS_BASE = "https://gnews.io/api/v4";

export interface NewsArticle {
  title: string;
  description: string;
  content: string;
  url: string;
  image: string | null;
  publishedAt: string;
  source: {
    name: string;
    url: string;
  };
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

// Maps query keywords to alert types
const SAFETY_QUERIES = [
  {
    keywords: ["rape", "sexual assault", "molestation", "harassment women"],
    type: "sexual_violence" as const,
    severity: "critical" as const,
    emoji: "🚨",
  },
  {
    keywords: ["kidnapping", "abduction", "missing person"],
    type: "kidnapping" as const,
    severity: "critical" as const,
    emoji: "⛔",
  },
  {
    keywords: ["drug trafficking", "drug smuggling", "narcotics seized"],
    type: "drugs" as const,
    severity: "high" as const,
    emoji: "💊",
  },
  {
    keywords: ["robbery", "murder", "shooting", "gang violence", "crime"],
    type: "crime" as const,
    severity: "high" as const,
    emoji: "🔴",
  },
  {
    keywords: ["terrorist", "blast", "bomb", "explosion"],
    type: "terrorism" as const,
    severity: "critical" as const,
    emoji: "💣",
  },
  {
    keywords: ["flood", "cyclone", "earthquake", "landslide"],
    type: "natural_disaster" as const,
    severity: "high" as const,
    emoji: "🌊",
  },
  {
    keywords: ["protest", "riot", "curfew", "unrest"],
    type: "political_unrest" as const,
    severity: "medium" as const,
    emoji: "⚠️",
  },
  {
    keywords: ["tourist scam", "fraud tourist", "cheating tourists"],
    type: "scam" as const,
    severity: "medium" as const,
    emoji: "🎭",
  },
];

function determineSeverity(
  title: string,
  description: string,
  defaultSeverity: SafetyAlert["severity"],
): SafetyAlert["severity"] {
  const text = (title + " " + description).toLowerCase();
  if (
    text.includes("killed") ||
    text.includes("dead") ||
    text.includes("murder") ||
    text.includes("blast") ||
    text.includes("rape")
  ) {
    return "critical";
  }
  if (
    text.includes("arrested") ||
    text.includes("seized") ||
    text.includes("injured")
  ) {
    return "high";
  }
  if (text.includes("warning") || text.includes("alert")) {
    return "medium";
  }
  return defaultSeverity;
}

function deduplicateAlerts(alerts: SafetyAlert[]): SafetyAlert[] {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    const key = alert.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Fetch articles for a single query
async function fetchArticles(
  query: string,
  location: string,
  maxResults = 3,
): Promise<NewsArticle[]> {
  try {
    const searchQuery = encodeURIComponent(`${query} ${location}`);
    const url = `${GNEWS_BASE}/search?q=${searchQuery}&lang=en&max=${maxResults}&sortby=publishedAt&apikey=${GNEWS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles as NewsArticle[]) || [];
  } catch {
    return [];
  }
}

// Main function: fetch safety alerts for a destination
export async function fetchSafetyAlerts(
  destination: string,
  maxAlertsPerCategory = 2,
): Promise<SafetyAlert[]> {
  const allAlerts: SafetyAlert[] = [];

  // Run all queries in parallel
  const results = await Promise.allSettled(
    SAFETY_QUERIES.map(async (q) => {
      const keyword = q.keywords[0]; // primary keyword
      const articles = await fetchArticles(keyword, destination, maxAlertsPerCategory);
      return articles.map((article, idx): SafetyAlert => ({
        id: `${q.type}-${idx}-${Date.now()}`,
        type: q.type,
        severity: determineSeverity(
          article.title,
          article.description || "",
          q.severity,
        ),
        title: article.title,
        description:
          article.description ||
          article.content?.slice(0, 200) ||
          "No details available.",
        source: article.source.name,
        url: article.url,
        publishedAt: article.publishedAt,
        location: destination,
        emoji: q.emoji,
      }));
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allAlerts.push(...result.value);
    }
  }

  // Sort by severity then date
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const sorted = deduplicateAlerts(allAlerts).sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  });

  return sorted;
}

// Fetch a quick safety score summary (0–100, lower = safer)
export async function fetchSafetyScore(destination: string): Promise<{
  score: number;
  label: string;
  color: string;
  summary: string;
}> {
  const alerts = await fetchSafetyAlerts(destination, 1);

  let score = 0;
  for (const alert of alerts) {
    if (alert.severity === "critical") score += 25;
    else if (alert.severity === "high") score += 15;
    else if (alert.severity === "medium") score += 8;
    else score += 3;
  }
  score = Math.min(score, 100);

  let label: string;
  let color: string;
  let summary: string;

  if (score >= 70) {
    label = "Dangerous";
    color = "text-red-600";
    summary = `High safety risk detected in ${destination}. Exercise extreme caution.`;
  } else if (score >= 40) {
    label = "Moderate Risk";
    color = "text-orange-500";
    summary = `Some safety concerns reported in ${destination}. Stay alert and follow local advisories.`;
  } else if (score >= 20) {
    label = "Low Risk";
    color = "text-yellow-500";
    summary = `Minor safety alerts for ${destination}. Generally safe with normal precautions.`;
  } else {
    label = "Safe";
    color = "text-green-500";
    summary = `${destination} appears relatively safe based on recent news.`;
  }

  return { score, label, color, summary };
}

// Fetch general travel advisory
export async function fetchTravelAdvisory(destination: string): Promise<NewsArticle[]> {
  try {
    const query = encodeURIComponent(`travel advisory ${destination} 2024 2025`);
    const url = `${GNEWS_BASE}/search?q=${query}&lang=en&max=5&sortby=publishedAt&apikey=${GNEWS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles as NewsArticle[]) || [];
  } catch {
    return [];
  }
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
