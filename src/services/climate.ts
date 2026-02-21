// Climate & Weather service
// Uses Open-Meteo (free, no key required) for forecasts
// Uses ORS (OpenRouteService) for elevation & climate-aware routing
// Uses TomTom for real-time traffic conditions

const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY as string;
const OPEN_METEO_BASE = "https://api.open-meteo.com/v1";
const ORS_BASE = "https://api.openrouteservice.org";

// ── WMO Weather interpretation codes ────────────────────────────────────────
export const WMO_CODES: Record<number, { label: string; emoji: string; severe: boolean }> = {
  0:  { label: "Clear sky",           emoji: "☀️",  severe: false },
  1:  { label: "Mainly clear",        emoji: "🌤️", severe: false },
  2:  { label: "Partly cloudy",       emoji: "⛅",  severe: false },
  3:  { label: "Overcast",            emoji: "☁️",  severe: false },
  45: { label: "Foggy",               emoji: "🌫️", severe: false },
  48: { label: "Icy fog",             emoji: "🌫️", severe: false },
  51: { label: "Light drizzle",       emoji: "🌦️", severe: false },
  53: { label: "Moderate drizzle",    emoji: "🌦️", severe: false },
  55: { label: "Dense drizzle",       emoji: "🌧️", severe: true  },
  61: { label: "Slight rain",         emoji: "🌧️", severe: false },
  63: { label: "Moderate rain",       emoji: "🌧️", severe: false },
  65: { label: "Heavy rain",          emoji: "🌧️", severe: true  },
  71: { label: "Slight snow",         emoji: "🌨️", severe: false },
  73: { label: "Moderate snow",       emoji: "❄️",  severe: false },
  75: { label: "Heavy snow",          emoji: "❄️",  severe: true  },
  77: { label: "Snow grains",         emoji: "🌨️", severe: false },
  80: { label: "Slight showers",      emoji: "🌦️", severe: false },
  81: { label: "Moderate showers",    emoji: "🌧️", severe: false },
  82: { label: "Violent showers",     emoji: "⛈️",  severe: true  },
  85: { label: "Snow showers",        emoji: "🌨️", severe: false },
  86: { label: "Heavy snow showers",  emoji: "❄️",  severe: true  },
  95: { label: "Thunderstorm",        emoji: "⛈️",  severe: true  },
  96: { label: "Thunderstorm+hail",   emoji: "⛈️",  severe: true  },
  99: { label: "Heavy thunderstorm",  emoji: "🌩️", severe: true  },
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface DailyForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  weatherCode: number;
  weatherLabel: string;
  weatherEmoji: string;
  isSevere: boolean;
  sunrise: string;
  sunset: string;
  uvIndex: number;
  windspeedMax: number;
}

export interface HourlyForecast {
  time: string;
  temperature: number;
  precipitation: number;
  weatherCode: number;
  weatherEmoji: string;
  humidity: number;
  windspeed: number;
  apparentTemp: number;
}

export interface WeatherForecast {
  lat: number;
  lon: number;
  timezone: string;
  elevation: number;
  daily: DailyForecast[];
  hourly: HourlyForecast[];
  current: {
    temperature: number;
    weatherCode: number;
    weatherLabel: string;
    weatherEmoji: string;
    humidity: number;
    windspeed: number;
    apparentTemp: number;
  };
}

export interface ActivityWeatherSuitability {
  activityName: string;
  category: string;
  date: string;
  score: number;          // 0–100 (higher = better conditions)
  recommendation: string;
  warnings: string[];
  bestTimeWindow: string;
}

export interface ClimateAwareRoute {
  distanceKm: number;
  durationMin: number;
  elevationGain: number;
  weatherAlongRoute: string;
  avoidanceReasons: string[];
  steps: Array<{ instruction: string; distanceM: number }>;
}

// ── Fetch weather forecast ────────────────────────────────────────────────────

export async function getWeatherForecast(params: {
  lat: number;
  lon: number;
  days?: number;
}): Promise<WeatherForecast> {
  const { lat, lon, days = 7 } = params;

  const url =
    `${OPEN_METEO_BASE}/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,sunrise,sunset,uv_index_max,windspeed_10m_max` +
    `&hourly=temperature_2m,apparent_temperature,precipitation,weathercode,relativehumidity_2m,windspeed_10m` +
    `&current_weather=true` +
    `&timezone=auto` +
    `&forecast_days=${days}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo error [${res.status}]`);
  const data = await res.json();

  // ── Parse daily ──────────────────────────────────────────────────────────
  const daily: DailyForecast[] = (data.daily.time as string[]).map(
    (date: string, i: number) => {
      const code: number = data.daily.weathercode[i] ?? 0;
      const info = WMO_CODES[code] ?? { label: "Unknown", emoji: "🌡️", severe: false };
      return {
        date,
        tempMax: Math.round(data.daily.temperature_2m_max[i] ?? 0),
        tempMin: Math.round(data.daily.temperature_2m_min[i] ?? 0),
        precipitationSum: data.daily.precipitation_sum[i] ?? 0,
        weatherCode: code,
        weatherLabel: info.label,
        weatherEmoji: info.emoji,
        isSevere: info.severe,
        sunrise: data.daily.sunrise[i] ?? "",
        sunset: data.daily.sunset[i] ?? "",
        uvIndex: data.daily.uv_index_max?.[i] ?? 0,
        windspeedMax: data.daily.windspeed_10m_max?.[i] ?? 0,
      };
    }
  );

  // ── Parse hourly (next 48 hours only to keep payload small) ─────────────
  const hourly: HourlyForecast[] = (data.hourly.time as string[])
    .slice(0, 48)
    .map((time: string, i: number) => {
      const code: number = data.hourly.weathercode[i] ?? 0;
      const info = WMO_CODES[code] ?? { label: "Unknown", emoji: "🌡️", severe: false };
      return {
        time,
        temperature: Math.round(data.hourly.temperature_2m[i] ?? 0),
        precipitation: data.hourly.precipitation[i] ?? 0,
        weatherCode: code,
        weatherEmoji: info.emoji,
        humidity: data.hourly.relativehumidity_2m?.[i] ?? 0,
        windspeed: data.hourly.windspeed_10m?.[i] ?? 0,
        apparentTemp: Math.round(data.hourly.apparent_temperature?.[i] ?? 0),
      };
    });

  // ── Parse current ────────────────────────────────────────────────────────
  const cw = data.current_weather ?? {};
  const currentCode: number = cw.weathercode ?? 0;
  const currentInfo = WMO_CODES[currentCode] ?? { label: "Unknown", emoji: "🌡️", severe: false };

  // Find current hour index for humidity / windspeed
  const nowHour = new Date().toISOString().slice(0, 13);
  const hourIdx = (data.hourly.time as string[]).findIndex((t: string) =>
    t.startsWith(nowHour)
  );

  return {
    lat,
    lon,
    timezone: data.timezone ?? "UTC",
    elevation: data.elevation ?? 0,
    daily,
    hourly,
    current: {
      temperature: Math.round(cw.temperature ?? 0),
      weatherCode: currentCode,
      weatherLabel: currentInfo.label,
      weatherEmoji: currentInfo.emoji,
      humidity: hourIdx >= 0 ? (data.hourly.relativehumidity_2m?.[hourIdx] ?? 0) : 0,
      windspeed: Math.round(cw.windspeed ?? 0),
      apparentTemp: hourIdx >= 0
        ? Math.round(data.hourly.apparent_temperature?.[hourIdx] ?? cw.temperature ?? 0)
        : Math.round(cw.temperature ?? 0),
    },
  };
}

// ── Geocode a destination name → coordinates ──────────────────────────────────

export async function geocodeDestination(destination: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url =
      `${ORS_BASE}/geocode/search` +
      `?api_key=${ORS_API_KEY}` +
      `&text=${encodeURIComponent(destination)}` +
      `&size=1`;

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.features?.[0]?.geometry?.coordinates;
    if (!coords) return null;
    return { lat: coords[1], lon: coords[0] };
  } catch {
    // Fallback: Nominatim
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1`,
        { headers: { "User-Agent": "RadiatorRoutes/1.0" } }
      );
      const data = await res.json();
      if (data?.[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch {/* ignore */}
    return null;
  }
}

// ── Score activity suitability based on weather ───────────────────────────────

export function scoreActivityWeather(
  category: string,
  dayForecast: DailyForecast
): { score: number; warnings: string[]; recommendation: string } {
  const warnings: string[] = [];
  let score = 100;

  const { precipitationSum, tempMax, tempMin, isSevere, uvIndex, windspeedMax, weatherEmoji } = dayForecast;

  // Severe weather → always bad
  if (isSevere) {
    score -= 60;
    warnings.push(`${weatherEmoji} Severe weather: ${dayForecast.weatherLabel}`);
  }

  // Heavy rain penalty (category-dependent)
  if (precipitationSum > 20) {
    score -= category === "outdoor" || category === "attraction" ? 40 : 20;
    warnings.push(`🌧️ Heavy rain expected (${precipitationSum.toFixed(1)} mm)`);
  } else if (precipitationSum > 5) {
    score -= 15;
    warnings.push(`🌦️ Moderate rain (${precipitationSum.toFixed(1)} mm) – carry an umbrella`);
  }

  // Temperature extremes
  if (tempMax > 42) {
    score -= 30;
    warnings.push(`🌡️ Extreme heat (${tempMax}°C) – limit outdoor activities`);
  } else if (tempMax > 38) {
    score -= 15;
    warnings.push(`☀️ Very hot (${tempMax}°C) – plan outdoor activities for early morning`);
  }
  if (tempMin < 0) {
    score -= 20;
    warnings.push(`🥶 Sub-zero temperatures (${tempMin}°C) – bundle up`);
  }

  // UV index
  if (uvIndex > 10) {
    score -= 10;
    warnings.push(`🔆 Extreme UV index (${uvIndex.toFixed(0)}) – use SPF 50+`);
  }

  // High winds
  if (windspeedMax > 60) {
    score -= 25;
    warnings.push(`💨 Strong winds (${windspeedMax.toFixed(0)} km/h) – outdoor activities risky`);
  } else if (windspeedMax > 40) {
    score -= 10;
    warnings.push(`💨 Windy conditions (${windspeedMax.toFixed(0)} km/h)`);
  }

  // Category-specific bonuses
  if (["food", "shopping", "accommodation", "museum"].includes(category)) {
    // Indoor activities are mostly weather-independent
    score = Math.min(100, score + 20);
  }

  score = Math.max(0, Math.min(100, score));

  let recommendation: string;
  if (score >= 80) recommendation = "Excellent conditions — go for it!";
  else if (score >= 60) recommendation = "Good conditions with minor caveats.";
  else if (score >= 40) recommendation = "Acceptable — plan around weather windows.";
  else if (score >= 20) recommendation = "Poor conditions — consider rescheduling.";
  else recommendation = "Avoid — severe weather risk.";

  return { score, warnings, recommendation };
}

// ── Get weather suitability for a list of activities ─────────────────────────

export async function getActivityWeatherSuitability(params: {
  lat: number;
  lon: number;
  activities: Array<{
    name: string;
    category: string;
    date: string; // YYYY-MM-DD
    startTime?: string;
  }>;
}): Promise<ActivityWeatherSuitability[]> {
  const { lat, lon, activities } = params;

  const forecast = await getWeatherForecast({ lat, lon, days: 14 });
  const dailyMap = new Map<string, DailyForecast>();
  for (const day of forecast.daily) dailyMap.set(day.date, day);

  return activities.map((act) => {
    const dayForecast = dailyMap.get(act.date);

    if (!dayForecast) {
      return {
        activityName: act.name,
        category: act.category,
        date: act.date,
        score: 70,
        recommendation: "No forecast data available for this date.",
        warnings: [],
        bestTimeWindow: "Morning (7 AM – 11 AM)",
      };
    }

    const { score, warnings, recommendation } = scoreActivityWeather(act.category, dayForecast);

    // Determine best time window from hourly
    const dayHourly = forecast.hourly.filter((h) => h.time.startsWith(act.date));
    let bestHour = 9;
    let bestScore = -1;
    for (const h of dayHourly) {
      const hour = parseInt(h.time.slice(11, 13), 10);
      const s = 100 - h.precipitation * 10 - (h.temperature > 38 ? 20 : 0);
      if (s > bestScore) { bestScore = s; bestHour = hour; }
    }
    const bestEnd = Math.min(bestHour + 3, 20);
    const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;
    const bestTimeWindow = `${fmt(bestHour)} – ${fmt(bestEnd)}`;

    return {
      activityName: act.name,
      category: act.category,
      date: act.date,
      score,
      recommendation,
      warnings,
      bestTimeWindow,
    };
  });
}

// ── Climate-aware ORS route ───────────────────────────────────────────────────

export async function getClimateAwareRoute(params: {
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
  profile?: string;
  date?: string;
}): Promise<ClimateAwareRoute> {
  const { originLat, originLon, destLat, destLon, profile = "driving-car", date } = params;

  if (!ORS_API_KEY) {
    throw new Error("ORS API key (VITE_ORS_API_KEY) is not configured");
  }

  // Get weather at destination
  let weatherAlongRoute = "Weather data unavailable";
  const avoidanceReasons: string[] = [];

  try {
    const forecast = await getWeatherForecast({ lat: destLat, lon: destLon, days: 3 });
    const targetDate = date ?? new Date().toISOString().split("T")[0];
    const dayForecast = forecast.daily.find((d) => d.date === targetDate) ?? forecast.daily[0];

    if (dayForecast) {
      weatherAlongRoute = `${dayForecast.weatherEmoji} ${dayForecast.weatherLabel} · ${dayForecast.tempMin}–${dayForecast.tempMax}°C`;
      if (dayForecast.isSevere) avoidanceReasons.push("Severe weather at destination");
      if (dayForecast.precipitationSum > 15) avoidanceReasons.push("Heavy rain — allow extra travel time");
      if (dayForecast.windspeedMax > 50) avoidanceReasons.push("Strong winds may affect driving");
    }
  } catch {
    /* weather fetch failed – continue with route only */
  }

  // Get ORS route
  const routeRes = await fetch(`${ORS_BASE}/v2/directions/${profile}/json`, {
    method: "POST",
    headers: {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      coordinates: [
        [originLon, originLat],
        [destLon, destLat],
      ],
      instructions: true,
      instructions_format: "text",
      language: "en",
      units: "km",
      elevation: true,
      geometry: true,
    }),
  });

  if (!routeRes.ok) {
    const txt = await routeRes.text();
    throw new Error(`ORS route error [${routeRes.status}]: ${txt}`);
  }

  const routeData = await routeRes.json();
  const route = routeData.routes?.[0];

  if (!route) throw new Error("No route found between these locations.");

  const summary = route.summary ?? {};
  const segments = route.segments ?? [];
  const steps: Array<{ instruction: string; distanceM: number }> = [];

  for (const seg of segments) {
    for (const step of (seg.steps ?? [])) {
      if (step.instruction) {
        steps.push({
          instruction: step.instruction,
          distanceM: Math.round((step.distance ?? 0) * 1000),
        });
      }
    }
  }

  // Elevation gain from geometry (z-values)
  let elevationGain = 0;
  try {
    const coords = route.geometry?.coordinates ?? [];
    for (let i = 1; i < coords.length; i++) {
      const dz = (coords[i][2] ?? 0) - (coords[i - 1][2] ?? 0);
      if (dz > 0) elevationGain += dz;
    }
  } catch {/* ignore */}

  return {
    distanceKm: Math.round((summary.distance ?? 0) * 10) / 10,
    durationMin: Math.round((summary.duration ?? 0) / 60),
    elevationGain: Math.round(elevationGain),
    weatherAlongRoute,
    avoidanceReasons,
    steps: steps.slice(0, 15), // return max 15 steps
  };
}

// ── Get weather summary string for Jinny's context ───────────────────────────

export async function getWeatherContext(destination: string): Promise<string> {
  try {
    const coords = await geocodeDestination(destination);
    if (!coords) return `Could not fetch weather for ${destination}.`;

    const forecast = await getWeatherForecast({ lat: coords.lat, lon: coords.lon, days: 5 });
    const { current, daily } = forecast;

    let ctx = `🌍 **${destination} Weather**\n`;
    ctx += `📍 Current: ${current.weatherEmoji} ${current.weatherLabel} · ${current.temperature}°C (feels like ${current.apparentTemp}°C) · 💧${current.humidity}% humidity · 💨${current.windspeed} km/h\n\n`;
    ctx += `📅 **5-Day Forecast:**\n`;

    for (const day of daily.slice(0, 5)) {
      const severe = day.isSevere ? " ⚠️ SEVERE" : "";
      ctx += `- **${day.date}**: ${day.weatherEmoji} ${day.weatherLabel}${severe} · ${day.tempMin}–${day.tempMax}°C · 🌧️${day.precipitationSum.toFixed(1)}mm · 🌬️${day.windspeedMax.toFixed(0)} km/h · UV:${day.uvIndex.toFixed(0)}\n`;
    }

    const badDays = daily.filter((d) => d.isSevere || d.precipitationSum > 15);
    if (badDays.length > 0) {
      ctx += `\n⚠️ **Weather Warnings:** Severe/heavy rain on ${badDays.map((d) => d.date).join(", ")}. Plan indoor activities on those days.\n`;
    }

    return ctx;
  } catch (err) {
    return `Weather fetch failed for ${destination}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Unified action dispatcher ─────────────────────────────────────────────────

export async function climate(body: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;

  switch (action) {
    case "weather-forecast":
      return getWeatherForecast(params as Parameters<typeof getWeatherForecast>[0]);

    case "activity-suitability":
      return getActivityWeatherSuitability(params as Parameters<typeof getActivityWeatherSuitability>[0]);

    case "climate-aware-route":
      return getClimateAwareRoute(params as Parameters<typeof getClimateAwareRoute>[0]);

    case "weather-context":
      return getWeatherContext((params as { destination: string }).destination);

    case "geocode":
      return geocodeDestination((params as { destination: string }).destination);

    default:
      throw new Error(
        `Unknown climate action: "${action}". Supported: weather-forecast, activity-suitability, climate-aware-route, weather-context, geocode`
      );
  }
}
