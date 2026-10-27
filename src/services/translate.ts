// ─────────────────────────────────────────────────────────────────────────────
// Radiator Routes — Translation Service
// Uses MyMemory free API (no API key needed, 1000 req/day per IP)
// Falls back to original text on error
// ─────────────────────────────────────────────────────────────────────────────

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  // Indian languages
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "hi", name: "Hindi", nativeName: "हिंदी", flag: "🇮🇳" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", flag: "🇮🇳" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", flag: "🇮🇳" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", flag: "🇮🇳" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", flag: "🇮🇳" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", flag: "🇮🇳" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { code: "ur", name: "Urdu", nativeName: "اردو", flag: "🇵🇰" },
  { code: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ", flag: "🇮🇳" },
  // International languages
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "🇹🇷" },
  { code: "th", name: "Thai", nativeName: "ภาษาไทย", flag: "🇹🇭" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳" },
  {
    code: "id",
    name: "Indonesian",
    nativeName: "Bahasa Indonesia",
    flag: "🇮🇩",
  },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱" },
  { code: "pl", name: "Polish", nativeName: "Polski", flag: "🇵🇱" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", flag: "🇸🇪" },
];

export const LANGUAGE_STORAGE_KEY = "rr_language";
export const DEFAULT_LANGUAGE = "en";

// In-memory translation cache: "text|langCode" → translated string
const cache = new Map<string, string>();

// Max characters per MyMemory request
const MAX_CHARS = 500;

function cacheKey(text: string, targetLang: string): string {
  return `${targetLang}|${text}`;
}

/**
 * Translate a single string via MyMemory API.
 * Returns the original string on any failure.
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang = "en",
): Promise<string> {
  if (!text || !text.trim()) return text;
  if (targetLang === sourceLang || targetLang === "en") return text;

  const key = cacheKey(text, targetLang);
  if (cache.has(key)) return cache.get(key)!;

  // Truncate to avoid API limits
  const truncated = text.slice(0, MAX_CHARS);

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncated)}&langpair=${sourceLang}|${targetLang}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const translated: string = data?.responseData?.translatedText || truncated;
    // MyMemory returns "QUERY LENGTH LIMIT..." on overload — treat as failure
    if (
      translated.toUpperCase().includes("QUERY LENGTH") ||
      translated.toUpperCase().includes("MYMEMORY WARNING")
    ) {
      cache.set(key, text);
      return text;
    }
    cache.set(key, translated);
    return translated;
  } catch {
    cache.set(key, text); // cache failure so we don't retry
    return text;
  }
}

/**
 * Translate multiple strings at once.
 * Returns an array of the same length with translated strings.
 */
export async function translateBatch(
  texts: string[],
  targetLang: string,
  sourceLang = "en",
): Promise<string[]> {
  if (targetLang === sourceLang || targetLang === "en") return texts;
  return Promise.all(
    texts.map((t) => translateText(t, targetLang, sourceLang)),
  );
}

/**
 * Translate an object's string values.
 * Only translates values that are plain strings.
 */
export async function translateObject<T extends Record<string, unknown>>(
  obj: T,
  keys: (keyof T)[],
  targetLang: string,
): Promise<T> {
  if (targetLang === "en") return obj;
  const result = { ...obj };
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) {
      (result as any)[key] = await translateText(val, targetLang);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Language preference helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getSavedLanguage(): string {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function saveLanguage(code: string): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}

export function getLanguageInfo(code: string): Language {
  return (
    SUPPORTED_LANGUAGES.find((l) => l.code === code) || SUPPORTED_LANGUAGES[0]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UI string bundles — pre-translated key/value maps for instant rendering
// (No API call needed for these common strings)
// ─────────────────────────────────────────────────────────────────────────────

export type UIStringKey =
  | "dashboard"
  | "myTrips"
  | "explore"
  | "friends"
  | "community"
  | "guide"
  | "profile"
  | "settings"
  | "search"
  | "loading"
  | "back"
  | "save"
  | "cancel"
  | "delete"
  | "edit"
  | "create"
  | "join"
  | "leave"
  | "send"
  | "close"
  | "open"
  | "share"
  | "yes"
  | "no"
  | "ok"
  | "error"
  | "success"
  | "budget"
  | "trip"
  | "trips"
  | "flights"
  | "hotels"
  | "weather"
  | "traffic"
  | "map"
  | "navigate"
  | "language"
  | "selectLanguage"
  | "members"
  | "events"
  | "chat"
  | "discover"
  | "requests"
  | "invites"
  | "collaborate"
  | "addToTrip"
  | "viewOnMap"
  | "readAloud"
  | "stopReading"
  | "voiceCommand"
  | "perPerson"
  | "noResults"
  | "tryAgain"
  | "emergency"
  | "totalCost"
  | "upcoming"
  | "destinations"
  | "nextTrip"
  | "quickStats"
  | "daysLeft"
  | "duration"
  | "createTrip";

type UIBundle = Record<UIStringKey, string>;

const UI_STRINGS: Record<string, Partial<UIBundle>> = {
  en: {
    dashboard: "Dashboard",
    myTrips: "My Trips",
    explore: "Explore",
    friends: "Friends",
    community: "Community",
    guide: "Travel Guide",
    profile: "Profile",
    settings: "Settings",
    search: "Search",
    loading: "Loading…",
    back: "Back",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    join: "Join",
    leave: "Leave",
    send: "Send",
    close: "Close",
    open: "Open",
    share: "Share",
    yes: "Yes",
    no: "No",
    ok: "OK",
    error: "Error",
    success: "Success",
    budget: "Budget",
    trip: "Trip",
    trips: "Trips",
    flights: "Flights",
    hotels: "Hotels",
    weather: "Weather",
    traffic: "Traffic",
    map: "Map",
    navigate: "Navigate",
    language: "Language",
    selectLanguage: "Select Language",
    members: "Members",
    events: "Events",
    chat: "Chat",
    discover: "Discover People",
    requests: "Requests",
    invites: "Trip Invites",
    collaborate: "Collaborate",
    addToTrip: "Add to Trip",
    viewOnMap: "View on Map",
    readAloud: "Read Aloud",
    stopReading: "Stop Reading",
    voiceCommand: "Voice Command",
    perPerson: "per person",
    noResults: "No trips yet",
    tryAgain: "Try again",
    emergency: "Emergency",
    totalCost: "Total Cost",
    upcoming: "Upcoming",
    destinations: "Destinations",
    nextTrip: "Next Trip",
    quickStats: "Quick Stats",
    daysLeft: "Days Left",
    duration: "Duration",
    createTrip: "Create New Trip",
  },
  hi: {
    dashboard: "डैशबोर्ड",
    myTrips: "मेरी यात्राएं",
    explore: "अन्वेषण करें",
    friends: "मित्र",
    community: "समुदाय",
    guide: "यात्रा गाइड",
    profile: "प्रोफ़ाइल",
    settings: "सेटिंग्स",
    search: "खोजें",
    loading: "लोड हो रहा है…",
    back: "वापस",
    save: "सहेजें",
    cancel: "रद्द करें",
    delete: "हटाएं",
    edit: "संपादित करें",
    upcoming: "आगामी",
    destinations: "गंतव्य",
    nextTrip: "अगली यात्रा",
    quickStats: "त्वरित आँकड़े",
    daysLeft: "बाकी दिन",
    duration: "अवधि",
    createTrip: "नई यात्रा बनाएं",
    create: "बनाएं",
    join: "जुड़ें",
    leave: "छोड़ें",
    send: "भेजें",
    close: "बंद करें",
    open: "खोलें",
    share: "साझा करें",
    yes: "हाँ",
    no: "नहीं",
    ok: "ठीक है",
    error: "त्रुटि",
    success: "सफलता",
    budget: "बजट",
    trip: "यात्रा",
    trips: "यात्राएं",
    flights: "उड़ानें",
    hotels: "होटल",
    weather: "मौसम",
    traffic: "यातायात",
    map: "नक्शा",
    navigate: "नेविगेट करें",
    language: "भाषा",
    selectLanguage: "भाषा चुनें",
    members: "सदस्य",
    events: "कार्यक्रम",
    chat: "चैट",
    discover: "लोगों को खोजें",
    requests: "अनुरोध",
    invites: "यात्रा आमंत्रण",
    collaborate: "सहयोग करें",
    addToTrip: "यात्रा में जोड़ें",
    viewOnMap: "नक्शे पर देखें",
    readAloud: "जोर से पढ़ें",
    stopReading: "पढ़ना बंद करें",
    voiceCommand: "आवाज़ आदेश",
    perPerson: "प्रति व्यक्ति",
    noResults: "कोई परिणाम नहीं",
    tryAgain: "फिर कोशिश करें",
    emergency: "आपातकालीन",
    totalCost: "कुल लागत",
  },
  bn: {
    dashboard: "ড্যাশবোর্ড",
    upcoming: "আসন্ন",
    destinations: "গন্তব্য",
    nextTrip: "পরবর্তী যাত্রা",
    quickStats: "দ্রুত পরিসংখ্যান",
    daysLeft: "বাকি দিন",
    duration: "সময়কাল",
    createTrip: "নতুন ট্রিপ তৈরি করুন",
    myTrips: "আমার ভ্রমণ",
    explore: "অন্বেষণ করুন",
    friends: "বন্ধু",
    community: "সম্প্রদায়",
    guide: "ভ্রমণ গাইড",
    profile: "প্রোফাইল",
    settings: "সেটিংস",
    search: "অনুসন্ধান",
    loading: "লোড হচ্ছে…",
    back: "পিছনে",
    save: "সংরক্ষণ",
    cancel: "বাতিল",
    budget: "বাজেট",
    trip: "ভ্রমণ",
    flights: "ফ্লাইট",
    hotels: "হোটেল",
    weather: "আবহাওয়া",
    language: "ভাষা",
    selectLanguage: "ভাষা নির্বাচন করুন",
    members: "সদস্য",
    emergency: "জরুরী",
  },
  ta: {
    dashboard: "டாஷ்போர்டு",
    upcoming: "வரவிருக்கும்",
    destinations: "இடங்கள்",
    nextTrip: "அடுத்த பயணம்",
    quickStats: "விரைவு புள்ளிவிவரம்",
    daysLeft: "மீதமுள்ள நாட்கள்",
    duration: "கால அளவு",
    createTrip: "புதிய பயணம் உருவாக்கு",
    myTrips: "என் பயணங்கள்",
    explore: "ஆராயுங்கள்",
    friends: "நண்பர்கள்",
    community: "சமூகம்",
    guide: "பயண வழிகாட்டி",
    profile: "சுயவிவரம்",
    settings: "அமைப்புகள்",
    search: "தேடல்",
    loading: "ஏற்றுகிறது…",
    back: "பின்",
    budget: "பட்ஜெட்",
    trip: "பயணம்",
    flights: "விமானங்கள்",
    hotels: "ஹோட்டல்கள்",
    weather: "வானிலை",
    language: "மொழி",
    selectLanguage: "மொழியை தேர்ந்தெடுக்கவும்",
    members: "உறுப்பினர்கள்",
    emergency: "அவசரநிலை",
  },
  te: {
    dashboard: "డాష్‌బోర్డ్",
    upcoming: "రాబోయే",
    destinations: "గమ్యస్థానాలు",
    nextTrip: "తదుపరి పర్యటన",
    quickStats: "త్వరిత గణాంకాలు",
    daysLeft: "మిగిలిన రోజులు",
    duration: "వ్యవధి",
    createTrip: "కొత్త పర్యటన సృష్టించు",
    myTrips: "నా ప్రయాణాలు",
    explore: "అన్వేషించండి",
    friends: "స్నేహితులు",
    community: "కమ్యూనిటీ",
    guide: "ప్రయాణ గైడ్",
    profile: "ప్రొఫైల్",
    settings: "సెట్టింగులు",
    search: "వెతకండి",
    loading: "లోడ్ అవుతోంది…",
    back: "వెనుక",
    budget: "బడ్జెట్",
    trip: "ప్రయాణం",
    flights: "విమానాలు",
    hotels: "హోటళ్ళు",
    weather: "వాతావరణం",
    language: "భాష",
    selectLanguage: "భాషను ఎంచుకోండి",
    members: "సభ్యులు",
    emergency: "అత్యవసరం",
  },
  mr: {
    dashboard: "डॅशबोर्ड",
    upcoming: "येणारी",
    destinations: "गंतव्ये",
    nextTrip: "पुढची सहल",
    quickStats: "जलद आकडेवारी",
    daysLeft: "उरलेले दिवस",
    duration: "कालावधी",
    createTrip: "नवीन सहल तयार करा",
    myTrips: "माझ्या सहली",
    explore: "एक्सप्लोर करा",
    friends: "मित्र",
    community: "समुदाय",
    guide: "प्रवास मार्गदर्शक",
    profile: "प्रोफाईल",
    settings: "सेटिंग्ज",
    search: "शोधा",
    loading: "लोड होत आहे…",
    back: "मागे",
    budget: "बजेट",
    trip: "सहल",
    flights: "विमाने",
    hotels: "हॉटेल्स",
    weather: "हवामान",
    language: "भाषा",
    selectLanguage: "भाषा निवडा",
    members: "सदस्य",
    emergency: "आणीबाणी",
  },
  gu: {
    dashboard: "ડેશબોર્ડ",
    upcoming: "આગામી",
    destinations: "મંઝિલો",
    nextTrip: "આગળની સફર",
    quickStats: "ઝડપી આંકડા",
    daysLeft: "બાકી દિવસો",
    duration: "સમયગાળો",
    createTrip: "નવી સફર બનાવો",
    myTrips: "મારી સફર",
    explore: "શોધ કરો",
    friends: "મિત્રો",
    community: "સમુદાય",
    guide: "પ્રવાસ માર્ગદર્શિકા",
    profile: "પ્રોફાઇલ",
    settings: "સેટિંગ્સ",
    search: "શોધ",
    loading: "લોડ થઈ રહ્યું છે…",
    back: "પાછળ",
    budget: "બજેટ",
    trip: "સફર",
    flights: "ઉડ્ડયન",
    hotels: "હોટેલ",
    weather: "હવામાન",
    language: "ભાષા",
    selectLanguage: "ભાષા પસંદ કરો",
    members: "સભ્યો",
    emergency: "કટોકટી",
  },
  kn: {
    dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
    upcoming: "ಮುಂಬರುವ",
    destinations: "ಗಮ್ಯಸ್ಥಾನಗಳು",
    nextTrip: "ಮುಂದಿನ ಪ್ರಯಾಣ",
    quickStats: "ತ್ವರಿತ ಅಂಕಿಅಂಶಗಳು",
    daysLeft: "ಉಳಿದ ದಿನಗಳು",
    duration: "ಅವಧಿ",
    createTrip: "ಹೊಸ ಪ್ರಯಾಣ ರಚಿಸಿ",
    myTrips: "ನನ್ನ ಪ್ರಯಾಣಗಳು",
    explore: "ಅನ್ವೇಷಿಸಿ",
    friends: "ಸ್ನೇಹಿತರು",
    community: "ಸಮುದಾಯ",
    guide: "ಪ್ರಯಾಣ ಮಾರ್ಗದರ್ಶಿ",
    profile: "ಪ್ರೊಫೈಲ್",
    settings: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು",
    search: "ಹುಡುಕಿ",
    loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
    back: "ಹಿಂದೆ",
    budget: "ಬಜೆಟ್",
    trip: "ಪ್ರಯಾಣ",
    flights: "ವಿಮಾನಗಳು",
    hotels: "ಹೋಟೆಲ್‌ಗಳು",
    weather: "ಹವಾಮಾನ",
    language: "ಭಾಷೆ",
    selectLanguage: "ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ",
    members: "ಸದಸ್ಯರು",
    emergency: "ತುರ್ತು",
  },
  ml: {
    dashboard: "ഡാഷ്‌ബോർഡ്",
    upcoming: "വരാനിരിക്കുന്ന",
    destinations: "ലക്ഷ്യസ്ഥാനങ്ങൾ",
    nextTrip: "അടുത്ത യാത്ര",
    quickStats: "ദ്രുത സ്ഥിതിവിവരക്കണക്കുകൾ",
    daysLeft: "ബാക്കി ദിവസങ്ങൾ",
    duration: "ദൈർഘ്യം",
    createTrip: "പുതിയ യാത്ര ഉണ്ടാക്കുക",
    myTrips: "എൻ്റെ യാത്രകൾ",
    explore: "പര്യവേക്ഷണം ചെയ്യുക",
    friends: "സുഹൃത്തുക്കൾ",
    community: "കമ്മ്യൂണിറ്റി",
    guide: "യാത്രാ ഗൈഡ്",
    profile: "പ്രൊഫൈൽ",
    settings: "ക്രമീകരണങ്ങൾ",
    search: "തിരയുക",
    loading: "ലോഡ് ആകുന്നു…",
    back: "പിന്നോട്ട്",
    budget: "ബജറ്റ്",
    trip: "യാത്ര",
    flights: "വിമാനങ്ങൾ",
    hotels: "ഹോട്ടലുകൾ",
    weather: "കാലാവസ്ഥ",
    language: "ഭാഷ",
    selectLanguage: "ഭാഷ തിരഞ്ഞെടുക്കുക",
    members: "അംഗങ്ങൾ",
    emergency: "അടിയന്തരം",
  },
  fr: {
    dashboard: "Tableau de bord",
    upcoming: "À venir",
    destinations: "Destinations",
    nextTrip: "Prochain voyage",
    quickStats: "Statistiques rapides",
    daysLeft: "Jours restants",
    duration: "Durée",
    createTrip: "Créer un voyage",
    myTrips: "Mes voyages",
    explore: "Explorer",
    friends: "Amis",
    community: "Communauté",
    guide: "Guide de voyage",
    profile: "Profil",
    settings: "Paramètres",
    search: "Rechercher",
    loading: "Chargement…",
    back: "Retour",
    save: "Enregistrer",
    cancel: "Annuler",
    budget: "Budget",
    trip: "Voyage",
    flights: "Vols",
    hotels: "Hôtels",
    weather: "Météo",
    language: "Langue",
    selectLanguage: "Sélectionner la langue",
    members: "Membres",
    emergency: "Urgence",
    perPerson: "par personne",
    totalCost: "Coût total",
  },
  es: {
    dashboard: "Panel de control",
    myTrips: "Mis viajes",
    explore: "Explorar",
    friends: "Amigos",
    community: "Comunidad",
    guide: "Guía de viaje",
    profile: "Perfil",
    settings: "Configuración",
    search: "Buscar",
    loading: "Cargando…",
    back: "Atrás",
    save: "Guardar",
    cancel: "Cancelar",
    budget: "Presupuesto",
    trip: "Viaje",
    flights: "Vuelos",
    hotels: "Hoteles",
    weather: "Clima",
    language: "Idioma",
    selectLanguage: "Seleccionar idioma",
    members: "Miembros",
    emergency: "Emergencia",
    perPerson: "por persona",
    totalCost: "Costo total",
  },
  de: {
    dashboard: "Dashboard",
    upcoming: "Bevorstehend",
    destinations: "Reiseziele",
    nextTrip: "Nächste Reise",
    quickStats: "Schnellstatistiken",
    daysLeft: "Verbleibende Tage",
    duration: "Dauer",
    createTrip: "Neue Reise erstellen",
    myTrips: "Meine Reisen",
    explore: "Entdecken",
    friends: "Freunde",
    community: "Gemeinschaft",
    guide: "Reiseführer",
    profile: "Profil",
    settings: "Einstellungen",
    search: "Suchen",
    loading: "Lädt…",
    back: "Zurück",
    save: "Speichern",
    cancel: "Abbrechen",
    budget: "Budget",
    trip: "Reise",
    flights: "Flüge",
    hotels: "Hotels",
    weather: "Wetter",
    language: "Sprache",
    selectLanguage: "Sprache auswählen",
    members: "Mitglieder",
    emergency: "Notfall",
    perPerson: "pro Person",
    totalCost: "Gesamtkosten",
  },
  ar: {
    dashboard: "لوحة القيادة",
    upcoming: "القادمة",
    destinations: "الوجهات",
    nextTrip: "الرحلة القادمة",
    quickStats: "إحصائيات سريعة",
    daysLeft: "الأيام المتبقية",
    duration: "المدة",
    createTrip: "إنشاء رحلة",
    myTrips: "رحلاتي",
    explore: "استكشاف",
    friends: "أصدقاء",
    community: "مجتمع",
    guide: "دليل السفر",
    profile: "الملف الشخصي",
    settings: "الإعدادات",
    search: "بحث",
    loading: "جار التحميل…",
    back: "رجوع",
    budget: "الميزانية",
    trip: "رحلة",
    flights: "رحلات جوية",
    hotels: "فنادق",
    weather: "الطقس",
    language: "اللغة",
    selectLanguage: "اختر اللغة",
    members: "أعضاء",
    emergency: "طارئ",
    perPerson: "للفرد",
    totalCost: "التكلفة الإجمالية",
  },
  ja: {
    dashboard: "ダッシュボード",
    upcoming: "予定",
    destinations: "目的地",
    nextTrip: "次の旅行",
    quickStats: "クイック統計",
    daysLeft: "残り日数",
    duration: "期間",
    createTrip: "新しい旅行を作成",
    myTrips: "マイトリップ",
    explore: "探索",
    friends: "友達",
    community: "コミュニティ",
    guide: "旅行ガイド",
    profile: "プロフィール",
    settings: "設定",
    search: "検索",
    loading: "読み込み中…",
    back: "戻る",
    save: "保存",
    cancel: "キャンセル",
    budget: "予算",
    trip: "旅行",
    flights: "フライト",
    hotels: "ホテル",
    weather: "天気",
    language: "言語",
    selectLanguage: "言語を選択",
    members: "メンバー",
    emergency: "緊急",
    perPerson: "1人あたり",
    totalCost: "合計費用",
  },
  zh: {
    dashboard: "仪表板",
    upcoming: "即将到来",
    destinations: "目的地",
    nextTrip: "下次旅行",
    quickStats: "快速统计",
    daysLeft: "剩余天数",
    duration: "持续时间",
    createTrip: "创建新旅行",
    myTrips: "我的行程",
    explore: "探索",
    friends: "朋友",
    community: "社区",
    guide: "旅游指南",
    profile: "个人资料",
    settings: "设置",
    search: "搜索",
    loading: "加载中…",
    back: "返回",
    save: "保存",
    cancel: "取消",
    budget: "预算",
    trip: "旅行",
    flights: "航班",
    hotels: "酒店",
    weather: "天气",
    language: "语言",
    selectLanguage: "选择语言",
    members: "成员",
    emergency: "紧急",
    perPerson: "每人",
    totalCost: "总费用",
  },
  pt: {
    dashboard: "Painel",
    upcoming: "Próximas",
    destinations: "Destinos",
    nextTrip: "Próxima viagem",
    quickStats: "Estatísticas rápidas",
    daysLeft: "Dias restantes",
    duration: "Duração",
    createTrip: "Criar viagem",
    myTrips: "Minhas viagens",
    explore: "Explorar",
    friends: "Amigos",
    community: "Comunidade",
    guide: "Guia de viagem",
    profile: "Perfil",
    settings: "Configurações",
    search: "Pesquisar",
    loading: "Carregando…",
    back: "Voltar",
    save: "Salvar",
    cancel: "Cancelar",
    budget: "Orçamento",
    trip: "Viagem",
    flights: "Voos",
    hotels: "Hotéis",
    weather: "Clima",
    language: "Idioma",
    selectLanguage: "Selecionar idioma",
    members: "Membros",
    emergency: "Emergência",
    perPerson: "por pessoa",
    totalCost: "Custo total",
  },
};

/**
 * Get a UI string for a given key and language.
 * Falls back to English if the key isn't available in the target language.
 */
export function getUIString(key: UIStringKey, lang: string): string {
  const bundle = UI_STRINGS[lang];
  if (bundle?.[key]) return bundle[key]!;
  return UI_STRINGS.en[key] || key;
}

/**
 * Get all UI strings for a language as a bundle.
 */
export function getUIBundle(lang: string): UIBundle {
  const englishBundle = UI_STRINGS.en as UIBundle;
  if (lang === "en") return englishBundle;
  const langBundle = UI_STRINGS[lang] || {};
  return { ...englishBundle, ...langBundle } as UIBundle;
}
