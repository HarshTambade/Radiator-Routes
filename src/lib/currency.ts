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
  const lower = country.toLowerCase();
  for (const [key, val] of Object.entries(COUNTRY_CURRENCY)) {
    if (key.toLowerCase() === lower) return val;
  }
  // Try partial match
  for (const [key, val] of Object.entries(COUNTRY_CURRENCY)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower))
      return val;
  }
  return DEFAULT_CURRENCY;
}

export function formatCurrency(
  amount: number,
  country?: string | null,
): string {
  const currency = getCurrencyForCountry(country);
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: "currency",
      currency: currency.code,
      maximumFractionDigits:
        currency.code === "JPY" || currency.code === "KRW" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency.symbol}${amount.toLocaleString()}`;
  }
}

export function getCurrencySymbol(country?: string | null): string {
  return getCurrencyForCountry(country).symbol;
}
