// Country to currency mapping and formatting utilities

const COUNTRY_CURRENCY: Record<
  string,
  { code: string; symbol: string; locale: string }
> = {
  India: { code: "INR", symbol: "₹", locale: "en-IN" },
  "United States": { code: "USD", symbol: "$", locale: "en-US" },
  USA: { code: "USD", symbol: "$", locale: "en-US" },
  "United Kingdom": { code: "GBP", symbol: "£", locale: "en-GB" },
  UK: { code: "GBP", symbol: "£", locale: "en-GB" },
  Japan: { code: "JPY", symbol: "¥", locale: "ja-JP" },
  China: { code: "CNY", symbol: "¥", locale: "zh-CN" },
  Thailand: { code: "THB", symbol: "฿", locale: "th-TH" },
  Vietnam: { code: "VND", symbol: "₫", locale: "vi-VN" },
  Malaysia: { code: "MYR", symbol: "RM", locale: "ms-MY" },
  Singapore: { code: "SGD", symbol: "S$", locale: "en-SG" },
  Indonesia: { code: "IDR", symbol: "Rp", locale: "id-ID" },
  "South Korea": { code: "KRW", symbol: "₩", locale: "ko-KR" },
  Australia: { code: "AUD", symbol: "A$", locale: "en-AU" },
  Canada: { code: "CAD", symbol: "C$", locale: "en-CA" },
  Germany: { code: "EUR", symbol: "€", locale: "de-DE" },
  France: { code: "EUR", symbol: "€", locale: "fr-FR" },
  Italy: { code: "EUR", symbol: "€", locale: "it-IT" },
  Spain: { code: "EUR", symbol: "€", locale: "es-ES" },
  Netherlands: { code: "EUR", symbol: "€", locale: "nl-NL" },
  Portugal: { code: "EUR", symbol: "€", locale: "pt-PT" },
  Greece: { code: "EUR", symbol: "€", locale: "el-GR" },
  Turkey: { code: "TRY", symbol: "₺", locale: "tr-TR" },
  Brazil: { code: "BRL", symbol: "R$", locale: "pt-BR" },
  Mexico: { code: "MXN", symbol: "MX$", locale: "es-MX" },
  Russia: { code: "RUB", symbol: "₽", locale: "ru-RU" },
  "South Africa": { code: "ZAR", symbol: "R", locale: "en-ZA" },
  UAE: { code: "AED", symbol: "د.إ", locale: "ar-AE" },
  "United Arab Emirates": { code: "AED", symbol: "د.إ", locale: "ar-AE" },
  "Saudi Arabia": { code: "SAR", symbol: "﷼", locale: "ar-SA" },
  Egypt: { code: "EGP", symbol: "E£", locale: "ar-EG" },
  Nepal: { code: "NPR", symbol: "रू", locale: "ne-NP" },
  "Sri Lanka": { code: "LKR", symbol: "Rs", locale: "si-LK" },
  Bangladesh: { code: "BDT", symbol: "৳", locale: "bn-BD" },
  Pakistan: { code: "PKR", symbol: "₨", locale: "ur-PK" },
  Philippines: { code: "PHP", symbol: "₱", locale: "en-PH" },
  "New Zealand": { code: "NZD", symbol: "NZ$", locale: "en-NZ" },
  Switzerland: { code: "CHF", symbol: "CHF", locale: "de-CH" },
  Sweden: { code: "SEK", symbol: "kr", locale: "sv-SE" },
  Norway: { code: "NOK", symbol: "kr", locale: "nb-NO" },
  Denmark: { code: "DKK", symbol: "kr", locale: "da-DK" },
  Poland: { code: "PLN", symbol: "zł", locale: "pl-PL" },
  "Czech Republic": { code: "CZK", symbol: "Kč", locale: "cs-CZ" },
  Hungary: { code: "HUF", symbol: "Ft", locale: "hu-HU" },
  Argentina: { code: "ARS", symbol: "AR$", locale: "es-AR" },
  Colombia: { code: "COP", symbol: "COL$", locale: "es-CO" },
  Peru: { code: "PEN", symbol: "S/", locale: "es-PE" },
  Chile: { code: "CLP", symbol: "CL$", locale: "es-CL" },
  Kenya: { code: "KES", symbol: "KSh", locale: "en-KE" },
  Nigeria: { code: "NGN", symbol: "₦", locale: "en-NG" },
  Morocco: { code: "MAD", symbol: "MAD", locale: "ar-MA" },
  Taiwan: { code: "TWD", symbol: "NT$", locale: "zh-TW" },
  "Hong Kong": { code: "HKD", symbol: "HK$", locale: "en-HK" },
  Cambodia: { code: "KHR", symbol: "៛", locale: "km-KH" },
  Myanmar: { code: "MMK", symbol: "K", locale: "my-MM" },
  Laos: { code: "LAK", symbol: "₭", locale: "lo-LA" },
  Maldives: { code: "MVR", symbol: "Rf", locale: "dv-MV" },
  Iceland: { code: "ISK", symbol: "kr", locale: "is-IS" },
  Ireland: { code: "EUR", symbol: "€", locale: "en-IE" },
  Austria: { code: "EUR", symbol: "€", locale: "de-AT" },
  Belgium: { code: "EUR", symbol: "€", locale: "nl-BE" },
  Finland: { code: "EUR", symbol: "€", locale: "fi-FI" },
};

const DEFAULT_CURRENCY = { code: "INR", symbol: "₹", locale: "en-IN" };

export function getCurrencyForCountry(country?: string | null) {
  if (!country) return DEFAULT_CURRENCY;
  // Try exact match first
  const exact = COUNTRY_CURRENCY[country];
  if (exact) return exact;
  // Try case-insensitive
  const lower = country.toLowerCase().trim();
  for (const [key, val] of Object.entries(COUNTRY_CURRENCY)) {
    if (key.toLowerCase() === lower) return val;
  }
  // Whole-word match only ("Republic of India" → India). A plain substring
  // test mapped "Ukraine" to UK pounds and "Niger" to Nigerian naira.
  for (const [key, val] of Object.entries(COUNTRY_CURRENCY)) {
    if (new RegExp(`\\b${key.toLowerCase()}\\b`).test(lower)) return val;
  }
  return DEFAULT_CURRENCY;
}

/**
 * Formats an amount using the destination country's currency.
 *
 * This only changes the label — it does not convert. Use it for values that
 * really are in the destination's currency; trip budgets, activity costs and
 * expenses are stored in `trips.currency` and go through `formatMoney`.
 */
export function formatCurrency(
  amount: number,
  country?: string | null,
): string {
  return formatMoney(amount, getCurrencyForCountry(country).code);
}

export function getCurrencySymbol(country?: string | null): string {
  return getCurrencyForCountry(country).symbol;
}

// ── Amounts in a known currency code ────────────────────────────────────────

const LOCALE_FOR_CODE: Record<string, string> = Object.fromEntries(
  Object.values(COUNTRY_CURRENCY).map((c) => [c.code, c.locale]),
);
// Several countries share EUR; pin a neutral locale for it.
LOCALE_FOR_CODE.EUR = "en-IE";
LOCALE_FOR_CODE.INR = "en-IN";
LOCALE_FOR_CODE.USD = "en-US";

/** Normalises a stored currency code, falling back to INR (the schema default). */
export function normalizeCurrencyCode(code?: string | null): string {
  const c = (code ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : DEFAULT_CURRENCY.code;
}

/** Symbol for an ISO currency code, e.g. "INR" → "₹". */
export function currencySymbolFor(code?: string | null): string {
  const c = normalizeCurrencyCode(code);
  const known = Object.values(COUNTRY_CURRENCY).find((v) => v.code === c);
  if (known) return known.symbol;
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency: c })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? c;
  } catch {
    return c;
  }
}

/**
 * Formats an amount that is already in `code`. Whole amounts drop the
 * decimals ("₹50,000"); fractional ones always show two ("₹1,234.50").
 */
export function formatMoney(amount: number, code?: string | null): string {
  const c = normalizeCurrencyCode(code);
  const value = Number.isFinite(amount) ? amount : 0;
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  try {
    return new Intl.NumberFormat(LOCALE_FOR_CODE[c] ?? "en-IN", {
      style: "currency",
      currency: c,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(whole ? Math.round(value) : value);
  } catch {
    return `${currencySymbolFor(c)}${value.toLocaleString()}`;
  }
}

/**
 * ASCII-only variant for jsPDF, whose built-in fonts have no glyph for ₹, ¥
 * and friends and print them as garbage: "INR 50,000".
 */
export function formatMoneyPlain(amount: number, code?: string | null): string {
  const c = normalizeCurrencyCode(code);
  const value = Number.isFinite(amount) ? amount : 0;
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  return `${c} ${value.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/**
 * Totals in several currencies, without pretending they can be added:
 * "₹80,000 + $2,000". Amounts in the same currency are summed.
 */
export function formatMoneyTotals(
  items: Array<{ amount: number; currency?: string | null }>,
): string {
  const totals = new Map<string, number>();
  for (const { amount, currency } of items) {
    const c = normalizeCurrencyCode(currency);
    totals.set(c, (totals.get(c) ?? 0) + (Number.isFinite(amount) ? amount : 0));
  }
  if (totals.size === 0) return formatMoney(0, DEFAULT_CURRENCY.code);
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, total]) => formatMoney(total, c))
    .join(" + ");
}

// ── Parsing a typed budget ──────────────────────────────────────────────────

const SYMBOL_TO_CODE: Array<[RegExp, string]> = [
  [/₹|\brs\.?(?=\s|\d|$)|\brupees?\b|\binr\b/i, "INR"],
  [/€|\beuros?\b/i, "EUR"],
  [/£|\bpounds?\b/i, "GBP"],
  [/¥|\byen\b/i, "JPY"],
  [/\bdollars?\b|\$/i, "USD"],
];

const KNOWN_CODES = new Set(Object.values(COUNTRY_CURRENCY).map((c) => c.code));

/**
 * Reads a budget typed in chat: "50000", "₹50,000", "50k", "1.5 lakh",
 * "2 crore", "2000 USD", "$2,000.50". The previous parser kept only the first
 * run of digits, so "50k" became 50, "1.5 lakh" became 1 and "2000 USD" was
 * silently treated as rupees.
 */
export function parseBudgetInput(text: string): {
  amount: number | null;
  currency: string | null;
} {
  const raw = (text ?? "").trim();
  const num = raw.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakhs?|lacs?|cr|crores?|m|mn|million)?\b/i);
  let amount: number | null = null;
  if (num) {
    const base = Number(num[1].replace(/,/g, ""));
    const unit = (num[2] ?? "").toLowerCase();
    const mult =
      unit === "k" || unit === "thousand" ? 1e3
      : /^(l|lakhs?|lacs?)$/.test(unit) ? 1e5
      : /^(cr|crores?)$/.test(unit) ? 1e7
      : /^(m|mn|million)$/.test(unit) ? 1e6
      : 1;
    const value = Math.round(base * mult * 100) / 100;
    amount = Number.isFinite(value) && value > 0 ? value : null;
  }

  let currency: string | null = null;
  const code = raw.toUpperCase().match(/\b([A-Z]{3})\b/);
  if (code && KNOWN_CODES.has(code[1])) currency = code[1];
  if (!currency) {
    for (const [pattern, c] of SYMBOL_TO_CODE) {
      if (pattern.test(raw)) {
        currency = c;
        break;
      }
    }
  }
  return { amount, currency };
}
