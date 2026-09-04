import { Link } from "react-router-dom";
import {
  Accessibility,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Brain,
  Calculator,
  Camera,
  Car,
  CheckCircle,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Clock,
  CloudSun,
  CloudUpload,
  Compass,
  Copy,
  Cpu,
  CreditCard,
  Database,
  Eye,
  FileDown,
  FlaskConical,
  Gauge,
  GitBranch,
  Github,
  Globe,
  HeartHandshake,
  HelpCircle,
  IndianRupee,
  Info,
  KeyRound,
  Languages,
  Layers,
  ListChecks,
  Locate,
  Lock,
  // Aliased: an unaliased `Map` import shadows the global Map constructor,
  // which breaks `new Map<K, V>()` further down this file.
  Map as MapIcon,
  MapPin,
  Menu,
  MessageSquare,
  Mic,
  Minus,
  Navigation,
  Pause,
  Plane,
  Play,
  Plus,
  Quote,
  Radio,
  RefreshCw,
  Route,
  Scale,
  ScanLine,
  Server,
  Share2,
  Shield,
  ShieldCheck,
  Signal,
  Smartphone,
  Sparkles,
  Terminal,
  Timer,
  TrendingDown,
  Users,
  Volume2,
  Wallet,
  WifiOff,
  Wrench,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { WEBLLM_MODELS, DEFAULT_WEBLLM_MODEL } from "@/lib/aiProvider";
import { SUPPORTED_LANGUAGES } from "@/services/translate";
import { Seo } from "@/components/Seo";
import { destinations, beyondIndia } from "@/data/destinations";
import {
  canonicalUrl,
  destinationListJsonLd,
  faqPageJsonLd,
  type JsonLd,
} from "@/lib/seo";

// Image imports
import heroOcean from "@/assets/hero-ocean.jpg";
import aboutTemple from "@/assets/about-temple.jpg";
import aboutFriends from "@/assets/about-friends.jpg";
import featureVoice from "@/assets/feature-voice.jpg";
import travelBeach from "@/assets/travel-beach.jpg";
import travelHiker from "@/assets/travel-hiker.jpg";
import travelBoat from "@/assets/travel-boat.jpg";
import travelKayak from "@/assets/travel-kayak.jpg";
import travelOcean from "@/assets/travel-ocean.jpg";
import travelSummit from "@/assets/travel-summit.jpg";
import destinationGoa from "@/assets/destination-goa.jpg";
import destinationAgra from "@/assets/destination-agra.jpg";
import destinationKerala from "@/assets/destination-kerala.jpg";

/* ────────────────────────────────────────────────────────────────────────────
   Copy policy for this file

   Every capability described below is implemented and traceable to a module.
   Claims previously shipped here that the codebase does not support — "Nash
   equilibrium" multi-agent negotiation, "counterfactual" regret planning,
   Amadeus / OpenWeatherMap / TomTom integrations, and fabricated customer
   reviews — were removed. See AUDIT.md §11 and docs/RESEARCH.md §3.2 for the
   ledger. Please keep new copy on the same footing: if it isn't in `src/`,
   it doesn't go on this page.
   ──────────────────────────────────────────────────────────────────────────── */

/* ─── Derived facts (kept honest by importing the real source of truth) ─── */

const INDIAN_LANGUAGE_CODES = new Set([
  "hi", "bn", "te", "mr", "ta", "gu", "kn", "ml", "pa", "ur", "or",
]);

const LANGUAGE_COUNT = SUPPORTED_LANGUAGES.length;
const INDIAN_LANGUAGE_COUNT = SUPPORTED_LANGUAGES.filter((l) =>
  INDIAN_LANGUAGE_CODES.has(l.code),
).length;

/** Right-to-left languages present in the supported set (see useLanguage). */
const RTL_LANGUAGES = SUPPORTED_LANGUAGES.filter((l) =>
  ["ar", "ur", "he", "fa"].includes(l.code),
).map((l) => l.name);

/** Deterministic checks in lib/itineraryVerifier.ts.
 *  Keep in sync with the `ViolationCode` union there — it is a type, so it can't
 *  be counted at runtime. Currently: BUDGET_EXCEEDED, COST_SUM_MISMATCH,
 *  TIME_OVERLAP, TIME_INVALID, TIME_REVERSED, TRAVEL_INFEASIBLE, PACE_EXCEEDED,
 *  COORD_INVALID, COORD_OUT_OF_REGION, EMPTY_ITINERARY, DURATION_IMPLAUSIBLE,
 *  CLOSED_ON_DAY, OUTSIDE_OPENING_HOURS. */
const FEASIBILITY_CHECK_COUNT = 13;

/* ─── Nav ─── */

const navLinks = [
  { href: "#about", label: "About" },
  { href: "#whats-new", label: "What's New" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#verification", label: "Verification" },
  { href: "#fairness", label: "Fairness" },
  { href: "#features", label: "Features" },
  { href: "#tech", label: "Tech" },
  { href: "#faq", label: "FAQ" },
];

const mobileOnlyLinks = [
  { href: "#engines", label: "AI Engines" },
  { href: "#how", label: "How It Works" },
  { href: "#offline", label: "Offline" },
  { href: "#languages", label: "Languages" },
  { href: "#destinations", label: "Destinations" },
  { href: "#roadmap", label: "Roadmap" },
];

/* ─── Hero stats — each one is checkable against the codebase ─── */

const stats = [
  { value: 2, prefix: "", suffix: "", label: "AI engines — hosted or on-device" },
  {
    value: LANGUAGE_COUNT,
    prefix: "",
    suffix: "",
    label: `Languages, ${INDIAN_LANGUAGE_COUNT} Indian`,
  },
  {
    value: FEASIBILITY_CHECK_COUNT,
    prefix: "",
    suffix: "",
    label: "Feasibility checks per plan",
  },
  { value: 0, prefix: "₹", suffix: "", label: "In API costs, no paid keys" },
  { value: 5, prefix: "", suffix: "s", label: "Live location refresh" },
  { value: 0, prefix: "", suffix: "", label: "Forms to plan a trip" },
];

/* ─── Hero slideshow ───
   The numbered controls on the left of the hero select these, and they advance
   on their own every HERO_INTERVAL_MS.

   Image resolution caveat: only hero-ocean.jpg is a true hero export (1920×1080).
   The three destination shots are 768×512 and will look soft when upscaled to a
   full-bleed hero on a large display — the dark overlay hides some of it, but
   replacing them with ≥1920×1080 exports is worth doing. Swapping is a one-line
   change per slide. */

const HERO_INTERVAL_MS = 6000;

const heroSlides = [
  { image: heroOcean, label: "Coastline", place: "The Konkan shoreline" },
  { image: destinationGoa, label: "Beaches", place: "Goa" },
  { image: destinationKerala, label: "Backwaters", place: "Kerala" },
  { image: destinationAgra, label: "Heritage", place: "Agra" },
];

/** Scrolling trust bar. Every line is verifiable from the repo. */
const trustPoints = [
  "Zero paid APIs",
  "Only Supabase required to run",
  "Prompts can stay on your device",
  "Saved trips open offline",
  "Row-Level Security on every table",
  "₹ INR native",
  "Installable PWA",
  "No credit card, ever",
  "MIT licensed",
];

/* ─── What's new ─── */

type UpdateStatus = "NEW" | "LIVE" | "REBUILT";

interface Update {
  icon: LucideIcon;
  title: string;
  status: UpdateStatus;
  desc: string;
  accent: string;
  bar: string;
  points: { icon: LucideIcon; text: string }[];
  footnote: string;
}

const updates: Update[] = [
  {
    icon: Cpu,
    title: "On-Device AI",
    status: "NEW",
    desc: "Planning and chat can now run entirely inside your browser on WebGPU. No API key, no request leaves the machine, and it keeps working with the network off once the weights are cached.",
    accent: "text-violet-500 bg-violet-500/10 border-violet-500/20",
    bar: "from-violet-400 to-purple-500",
    points: [
      { icon: Lock, text: "Prompts never leave the device" },
      { icon: WifiOff, text: "Works with no connection once cached" },
      { icon: Cpu, text: `${WEBLLM_MODELS.length} models, ${WEBLLM_MODELS[0]?.downloadLabel} to ${WEBLLM_MODELS[WEBLLM_MODELS.length - 1]?.downloadLabel}` },
      { icon: Zap, text: "Inference runs in a worker, so the UI never blocks" },
    ],
    footnote: "Opt in under Profile → AI engine · Needs a WebGPU browser",
  },
  {
    icon: ShieldCheck,
    title: "Verified Itineraries",
    status: "NEW",
    desc: "A language model will happily return a plan that is valid JSON and still impossible. Every generated itinerary now passes through deterministic checks before you ever see it.",
    accent: "text-sky-500 bg-sky-500/10 border-sky-500/20",
    bar: "from-sky-400 to-blue-500",
    points: [
      { icon: Wallet, text: "Budget totals and per-activity cost sums" },
      { icon: Clock, text: "Overlapping, reversed and implausible times" },
      { icon: Route, text: "Travel legs that can't fit the gap between them" },
      { icon: Timer, text: "Places booked when they're shut — closed days and opening hours" },
      { icon: RefreshCw, text: "Failures go back to the model as a repair prompt" },
    ],
    footnote: `${FEASIBILITY_CHECK_COUNT} checks · Runs client-side, offline, in milliseconds`,
  },
  {
    icon: Scale,
    title: "A Fairness Score You Can Argue With",
    status: "REBUILT",
    desc: "The group score used to be a number the prompt told the model to emit — unfalsifiable by construction. It is now computed from each traveller's own stated preferences.",
    accent: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    bar: "from-emerald-400 to-teal-500",
    points: [
      { icon: Users, text: "Reads real trip membership and stated preferences" },
      { icon: BarChart3, text: "Per-member utility from category weights and budget cap" },
      { icon: Scale, text: "Group score is the worst member's regret (Least Misery)" },
      { icon: ListChecks, text: "Plain arithmetic — you can check it, and disagree" },
    ],
    footnote: "Deterministic · Runs offline · Every member sees their own trade-off",
  },
  {
    icon: Radio,
    title: "Live Location Sharing",
    status: "LIVE",
    desc: "Split up at a market, take different trails, wander a city — then regroup without a dozen \"where are you\" messages. Members broadcast GPS to the group over Supabase Presence.",
    accent: "text-orange-500 bg-orange-500/10 border-orange-500/20",
    bar: "from-amber-400 to-orange-500",
    points: [
      { icon: Locate, text: "Real-time GPS over Supabase Presence channels" },
      { icon: Navigation, text: "One-tap navigation to any member" },
      { icon: Users, text: "Live distance and last-seen time per person" },
      { icon: Lock, text: "Visible only to members of that trip" },
    ],
    footnote: "Refreshes every 5 seconds · Clears automatically on disconnect",
  },
  {
    icon: Bell,
    title: "Smart Timeline Alerts",
    status: "LIVE",
    desc: "Push notifications 15 and 5 minutes before each item on the day's plan. Running late is normal, so recovering from it takes one tap rather than a manual reshuffle.",
    accent: "text-warning bg-warning/10 border-warning/20",
    bar: "from-yellow-400 to-amber-500",
    points: [
      { icon: Bell, text: "Browser alerts at 15 min and 5 min" },
      { icon: Timer, text: "Shift everything still ahead by +10m to +60m" },
      { icon: CheckCircle, text: "Status per item: upcoming, starting, active, late" },
      { icon: RefreshCw, text: "Snap back to the original schedule anytime" },
    ],
    footnote: "Delay presets: +10m, +15m, +20m, +30m, +45m, +60m",
  },
  {
    icon: CloudUpload,
    title: "Edits That Survive No Signal",
    status: "NEW",
    desc: "Ticking activities off happens mid-trip, which is exactly when signal is worst. Those writes are now queued on your device instead of failing, then replayed in order the moment you reconnect.",
    accent: "text-slate-500 bg-slate-500/10 border-slate-500/20",
    bar: "from-slate-400 to-slate-500",
    points: [
      { icon: WifiOff, text: "Queued durably in IndexedDB, order preserved" },
      { icon: RefreshCw, text: "Replays automatically when connectivity returns" },
      { icon: ShieldCheck, text: "Only network failures queue — a rejected write still tells you" },
      { icon: ListChecks, text: "Pending count shown in the offline banner" },
    ],
    footnote: "Wired into activity status and inline edits · 31 tests cover the queue",
  },
  {
    icon: Languages,
    title: `${LANGUAGE_COUNT} Languages`,
    status: "NEW",
    desc: `The whole interface, not just a translated marketing page — ${LANGUAGE_COUNT} languages including ${INDIAN_LANGUAGE_COUNT} Indian ones, switchable from anywhere in the app.`,
    accent: "text-pink-500 bg-pink-500/10 border-pink-500/20",
    bar: "from-pink-400 to-rose-500",
    points: [
      { icon: Languages, text: `${INDIAN_LANGUAGE_COUNT} Indian languages, in their own scripts` },
      { icon: Globe, text: `Right-to-left layout for ${RTL_LANGUAGES.join(" and ")}` },
      { icon: Volume2, text: "Voice input and read-aloud follow the chosen language" },
      { icon: IndianRupee, text: "Country-aware currency and date formatting" },
    ],
    footnote: "Preference persists per browser · Sets document lang and dir",
  },
];

const statusStyles: Record<UpdateStatus, string> = {
  NEW: "bg-primary/10 text-primary border-primary/20",
  LIVE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  REBUILT: "bg-violet-500/10 text-violet-600 border-violet-500/20",
};

/* ─── Reasons ─── */

const reasons = [
  {
    id: "voice",
    label: "Voice-First",
    title: "Speak it once, skip the forms",
    description:
      "Say one sentence and the trip takes shape. The Web Speech API transcribes in the browser and the model pulls out destination, dates, budget, group size and interests. Where in-browser speech recognition isn't available, Groq Whisper picks up the transcription instead.",
    icon: Mic,
    image: featureVoice,
  },
  {
    id: "verified",
    label: "Verified Plans",
    title: "Plans are checked before you see them",
    description:
      `Models return itineraries that parse cleanly and are still impossible: ₹80,000 of activities on a ₹40,000 budget, two bookings at 3 pm, a 400 km hop with a twenty-minute gap, a Wednesday-only market booked for a Sunday. ${FEASIBILITY_CHECK_COUNT} deterministic checks run on your device and hand any failure back to the model with a repair prompt.`,
    icon: ShieldCheck,
    image: travelSummit,
  },
  {
    id: "fair",
    label: "Group Fairness",
    title: "A group score that can be wrong",
    description:
      "Each traveller's utility is computed from their own category weights, review scores and budget cap. Their regret is the gap between the best plan available to them and the one chosen; the group score is the worst person's regret, and the recommendation minimises it. It's arithmetic, so you can check it.",
    icon: Scale,
    image: aboutFriends,
  },
  {
    id: "replan",
    label: "Dynamic Replan",
    title: "Replans while you're already travelling",
    description:
      "Weather turning or a schedule slipping triggers a fresh plan for the days still ahead, built from Open-Meteo forecasts and your current itinerary state. The update reaches every member over Supabase Realtime rather than waiting for a refresh.",
    icon: RefreshCw,
    image: travelOcean,
  },
  {
    id: "private",
    label: "Private by Choice",
    title: "Your trip doesn't have to leave your laptop",
    description:
      "Switch the engine to on-device and planning runs on your own GPU through WebGPU. No API key, no prompt off the machine, and it keeps working with the network off once the model is cached. Hosted Groq stays one click away when you want the larger model.",
    icon: Cpu,
    image: travelHiker,
  },
];

/* ─── Feature catalogue ─── */

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
  color: string;
  tag: string;
}

const allFeatures: Feature[] = [
  // ── AI Core ──
  {
    icon: Mic,
    title: "Voice-First Planning",
    desc: "Speak a sentence; the Web Speech API transcribes in-browser and the model extracts destination, dates, budget, group size and interests.",
    color: "text-primary bg-primary/10",
    tag: "AI Core",
  },
  {
    icon: ShieldCheck,
    title: "Deterministic Plan Verification",
    desc: `${FEASIBILITY_CHECK_COUNT} client-side checks on budget, timing, travel feasibility, opening hours, coordinates and pace — with an automatic repair prompt on failure.`,
    color: "text-sky-500 bg-sky-500/10",
    tag: "AI Core",
  },
  {
    icon: Sparkles,
    title: "AI Reasoning Transparency",
    desc: 'A "Why This Plan" panel opens up selection criteria, budget logic and local tips instead of asking you to trust the output.',
    color: "text-indigo-500 bg-indigo-500/10",
    tag: "AI Core",
  },
  {
    icon: Bot,
    title: "Jinny Travel Assistant",
    desc: "A streaming assistant that classifies what you're asking for and routes it — weather, traffic, navigation, a new plan — without leaving the page.",
    color: "text-fuchsia-500 bg-fuchsia-500/10",
    tag: "AI Core",
  },
  {
    icon: Brain,
    title: "Travel Memory",
    desc: "Preferences learned across your past trips get folded into the context for the next plan, so you stop restating the same things.",
    color: "text-purple-500 bg-purple-500/10",
    tag: "AI Core",
  },

  // ── Group & Fairness ──
  {
    icon: Scale,
    title: "Computed Fairness Score",
    desc: "Least Misery over per-member utilities: the recommended plan is the one that minimises the worst traveller's regret. Arithmetic, not a vibe.",
    color: "text-emerald-500 bg-emerald-500/10",
    tag: "Group & Fairness",
  },
  {
    icon: Users,
    title: "Real Group Preferences",
    desc: "Scoring reads actual trip membership and each member's stated preferences from their profile — no assumed party of two.",
    color: "text-blue-500 bg-blue-500/10",
    tag: "Group & Fairness",
  },
  {
    icon: BarChart3,
    title: "Per-Traveller Trade-offs",
    desc: "Every member can see their own regret against the alternatives, so a compromise is visible rather than asserted.",
    color: "text-violet-500 bg-violet-500/10",
    tag: "Group & Fairness",
  },
  {
    icon: CheckCircle,
    title: "Collaborative Voting",
    desc: "Vote on activities, mark them done or skipped, and edit inline. The plan converges with the group instead of around it.",
    color: "text-teal-500 bg-teal-500/10",
    tag: "Group & Fairness",
  },
  {
    icon: Share2,
    title: "Trip Invite Links",
    desc: "Share an invite code; joins are approved by the organiser. Friends land straight in the trip.",
    color: "text-cyan-500 bg-cyan-500/10",
    tag: "Group & Fairness",
  },

  // ── Real-Time ──
  {
    icon: Radio,
    title: "Live Location Sharing",
    desc: "Members broadcast GPS to the group over Supabase Presence — live distances, last-seen times, one-tap navigation, auto-clear on disconnect.",
    color: "text-orange-500 bg-orange-500/10",
    tag: "Real-Time",
  },
  {
    icon: Bell,
    title: "Smart Timeline Alerts",
    desc: "Push alerts 15 and 5 minutes ahead of each activity, plus a one-tap delay that shifts everything still to come.",
    color: "text-warning bg-warning/10",
    tag: "Real-Time",
  },
  {
    icon: RefreshCw,
    title: "Dynamic Replanning",
    desc: "Weather and schedule disruptions trigger a fresh plan for the days ahead, pushed to every member in real time.",
    color: "text-red-500 bg-red-500/10",
    tag: "Real-Time",
  },
  {
    icon: MessageSquare,
    title: "Real-Time Trip Chat",
    desc: "Per-trip group chat on Supabase Realtime, so coordination lives next to the itinerary it's about.",
    color: "text-pink-500 bg-pink-500/10",
    tag: "Real-Time",
  },
  {
    icon: CloudSun,
    title: "7-Day Weather",
    desc: "Open-Meteo forecasts — temperature, rain, UV, wind, sunrise and sunset — with severe weather fed back into planning.",
    color: "text-sky-500 bg-sky-500/10",
    tag: "Real-Time",
  },
  {
    icon: Car,
    title: "Traffic-Aware Timing",
    desc: "Time-of-day traffic estimation layered onto OpenRouteService legs, so a 9 am hop isn't costed like a midnight one.",
    color: "text-amber-600 bg-amber-500/10",
    tag: "Real-Time",
  },

  // ── Privacy & Offline ──
  {
    icon: Cpu,
    title: "Hosted or On-Device AI",
    desc: "Groq LLaMA 3.3 70B, or WebLLM on your own GPU with no key and nothing leaving the device. One switch, same features.",
    color: "text-violet-500 bg-violet-500/10",
    tag: "Privacy & Offline",
  },
  {
    icon: WifiOff,
    title: "Offline Trips & Maps",
    desc: "Save a trip and its map tiles pre-cache to your device, so the itinerary and its maps open with no connection.",
    color: "text-slate-500 bg-slate-500/10",
    tag: "Privacy & Offline",
  },
  {
    icon: CloudUpload,
    title: "Offline Edit Queue",
    desc: "Changes made with no signal are queued in order on your device and replayed as soon as you reconnect, rather than silently lost.",
    color: "text-slate-600 bg-slate-500/10",
    tag: "Privacy & Offline",
  },
  {
    icon: Smartphone,
    title: "Installable PWA",
    desc: "Install to the home screen on Android or iOS. Service-worker caching plus a prompt when a new version is ready.",
    color: "text-blue-500 bg-blue-500/10",
    tag: "Privacy & Offline",
  },
  {
    icon: Lock,
    title: "Row-Level Security",
    desc: "Every table is guarded by RLS policies, and the request cache is purged on sign-out so nothing survives the session.",
    color: "text-green-600 bg-green-600/10",
    tag: "Privacy & Offline",
  },
  {
    icon: IndianRupee,
    title: "Zero Paid APIs",
    desc: "Every integration is free or free-tier with no card. Only Supabase is required; everything else degrades gracefully.",
    color: "text-emerald-600 bg-emerald-600/10",
    tag: "Privacy & Offline",
  },

  // ── Maps & Nav ──
  {
    icon: MapIcon,
    title: "2D & 3D Maps",
    desc: "Leaflet for the flat view, MapLibre GL for a 3D globe with terrain — both on OpenStreetMap data.",
    color: "text-teal-500 bg-teal-500/10",
    tag: "Maps & Nav",
  },
  {
    icon: Navigation,
    title: "Routing & Handoff",
    desc: "OpenRouteService distance, ETA and elevation per activity, then a one-tap handoff to your navigation app.",
    color: "text-green-500 bg-green-500/10",
    tag: "Maps & Nav",
  },
  {
    icon: Camera,
    title: "360° Street View",
    desc: "Look around a place at street level before committing an afternoon to it.",
    color: "text-cyan-500 bg-cyan-500/10",
    tag: "Maps & Nav",
  },
  {
    icon: ScanLine,
    title: "AR Attraction Viewer",
    desc: "Point your camera at a landmark for an overlay with its context and details, loaded only when you open it.",
    color: "text-fuchsia-500 bg-fuchsia-500/10",
    tag: "Maps & Nav",
  },

  // ── Money ──
  {
    icon: Wallet,
    title: "Group Expense Splitting",
    desc: "Track shared costs by category and split equally, custom or by percentage, with per-member settlement tracking.",
    color: "text-emerald-500 bg-emerald-500/10",
    tag: "Money",
  },
  {
    icon: CreditCard,
    title: "UPI P2P Payments",
    desc: "Settle up through a UPI deep-link straight into your own UPI app. No wallet, no middleman, no fee.",
    color: "text-yellow-600 bg-yellow-500/10",
    tag: "Money",
  },
  {
    icon: Globe,
    title: "Multi-Currency",
    desc: "Budgets are ₹ INR native, with country auto-detection and locale-aware formatting when you travel out.",
    color: "text-green-600 bg-green-600/10",
    tag: "Money",
  },

  // ── Social ──
  {
    icon: HeartHandshake,
    title: "Friends & Direct Messages",
    desc: "Send requests, chat one-to-one in real time, and pull people into a trip from the same place.",
    color: "text-rose-500 bg-rose-500/10",
    tag: "Social",
  },
  {
    icon: Users,
    title: "Community Groups & Events",
    desc: "Create or join groups, talk in group chat, post events and collect RSVPs.",
    color: "text-indigo-500 bg-indigo-500/10",
    tag: "Social",
  },

  // ── Safety ──
  {
    icon: Shield,
    title: "SOS Panel",
    desc: "Emergency contacts, the local emergency numbers for where you actually are, and live GPS sharing in one tap.",
    color: "text-red-600 bg-red-600/10",
    tag: "Safety",
  },
  {
    icon: Bell,
    title: "Destination Advisories",
    desc: "Severity-tagged guidance per destination from Wikipedia REST plus curated regional advisories.",
    color: "text-amber-500 bg-amber-500/10",
    tag: "Safety",
  },

  // ── Explore ──
  {
    icon: Compass,
    title: "Place Discovery",
    desc: "Interest-ranked attractions and restaurants over OpenTripMap, Nominatim and Wikipedia, with photos and context.",
    color: "text-lime-600 bg-lime-500/10",
    tag: "Explore",
  },
  {
    icon: BookOpen,
    title: "Curated Destination Guides",
    desc: "Ready-made guides that generate a full plan you can drop straight into a trip.",
    color: "text-orange-500 bg-orange-500/10",
    tag: "Explore",
  },
  {
    icon: Plane,
    title: "Flight & Hotel Search",
    desc: "Deep-links out to free providers for flights and stays, so there's no paid booking API in the path.",
    color: "text-sky-600 bg-sky-600/10",
    tag: "Explore",
  },

  // ── Access & Export ──
  {
    icon: Languages,
    title: `${LANGUAGE_COUNT} Languages`,
    desc: `The full interface in ${LANGUAGE_COUNT} languages, ${INDIAN_LANGUAGE_COUNT} of them Indian, with right-to-left layout where it belongs.`,
    color: "text-pink-500 bg-pink-500/10",
    tag: "Access & Export",
  },
  {
    icon: Accessibility,
    title: "Accessibility Panel",
    desc: "Five tabs — Speak, Listen, Camera, Ask AI, Settings — including voice commands that navigate the app.",
    color: "text-blue-600 bg-blue-600/10",
    tag: "Access & Export",
  },
  {
    icon: Eye,
    title: "High Contrast & Large Text",
    desc: "Display modes that override the palette and type scale app-wide, not just on one screen.",
    color: "text-slate-600 bg-slate-500/10",
    tag: "Access & Export",
  },
  {
    icon: FileDown,
    title: "PDF Itinerary Export",
    desc: "An A4 day-by-day PDF with costs and timings. The generator only downloads when you click Export.",
    color: "text-gray-500 bg-gray-500/10",
    tag: "Access & Export",
  },
];

/** Filter chips are derived from the data, so a new feature can never become
 *  unreachable the way six of them previously were. */
const featureTags = ["All", ...Array.from(new Set(allFeatures.map((f) => f.tag)))];

const categoryColors: Record<string, string> = {
  "AI Core": "bg-primary/10 text-primary border-primary/20",
  "Group & Fairness": "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  "Real-Time": "bg-orange-500/10 text-orange-600 border-orange-500/20",
  "Privacy & Offline": "bg-violet-500/10 text-violet-600 border-violet-500/20",
  "Maps & Nav": "bg-teal-500/10 text-teal-600 border-teal-500/20",
  Money: "bg-green-600/10 text-green-700 border-green-600/20",
  Social: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  Safety: "bg-red-500/10 text-red-600 border-red-500/20",
  Explore: "bg-lime-500/10 text-lime-700 border-lime-500/20",
  "Access & Export": "bg-blue-600/10 text-blue-700 border-blue-600/20",
};

/* ─── AI engines ─── */

const engineComparison = [
  { label: "Model", groq: "LLaMA 3.3 70B", local: "LLaMA 3.2 / Qwen 2.5 / Phi 3.5, 1B–8B" },
  { label: "API key", groq: "Free-tier key", local: "None" },
  { label: "Network", groq: "Every request", local: "One-time model download" },
  { label: "Prompts", groq: "Sent to Groq", local: "Never leave the device" },
  { label: "Works offline", groq: "No", local: "Yes, once cached" },
  { label: "Speed", groq: "Fast", local: "Depends on your GPU" },
  { label: "Quality", groq: "Highest", local: "Lower — 1–8B against 70B" },
];

/* ─── How it works ─── */

const howItWorks = [
  {
    step: "01",
    icon: Volume2,
    title: "Say what you want",
    desc: '"Plan a 5-day Goa trip for 4 friends under ₹40,000." Transcribed in-browser, then parsed into destination, dates, budget, group and interests.',
    color: "bg-primary/10 text-primary border-primary/20",
  },
  {
    step: "02",
    icon: Brain,
    title: "The model drafts options",
    desc: "Candidate plans come back in one structured JSON call — one leaning budget, one balanced, one experience-first.",
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  },
  {
    step: "03",
    icon: Scale,
    title: "Code checks and scores them",
    desc: `${FEASIBILITY_CHECK_COUNT} deterministic checks reject the infeasible ones. Then each traveller's preferences are scored and the lowest worst-case regret wins.`,
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  {
    step: "04",
    icon: Zap,
    title: "Your group takes it live",
    desc: "Vote, chat, split costs, share location. Weather and schedule disruptions replan the days still ahead while you travel.",
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
];

/* ─── Tech stack ─── */

const techStack = [
  { name: "React 18 + TypeScript 5.9", category: "Frontend", color: "text-cyan-500" },
  { name: "Vite 8 (Rolldown + Oxc)", category: "Frontend", color: "text-cyan-500" },
  { name: "Tailwind CSS 3.4", category: "Frontend", color: "text-cyan-500" },
  { name: "TanStack Query 5", category: "Frontend", color: "text-cyan-500" },
  { name: "React Router 7", category: "Frontend", color: "text-cyan-500" },

  { name: "Supabase Postgres", category: "Backend", color: "text-green-500" },
  { name: "Supabase Auth (PKCE)", category: "Backend", color: "text-green-500" },
  { name: "Supabase Realtime", category: "Backend", color: "text-green-500" },
  { name: "Row-Level Security", category: "Backend", color: "text-green-500" },

  { name: "Groq LLaMA 3.3 70B", category: "AI", color: "text-primary" },
  { name: "WebLLM on WebGPU", category: "AI", color: "text-primary" },
  { name: "Web Speech API (STT + TTS)", category: "AI", color: "text-primary" },
  { name: "JSON-mode structured output", category: "AI", color: "text-primary" },

  { name: "Open-Meteo", category: "Live Data", color: "text-sky-500" },
  { name: "Wikipedia / Wikimedia REST", category: "Live Data", color: "text-sky-500" },
  { name: "OpenTripMap", category: "Live Data", color: "text-sky-500" },

  { name: "Leaflet + OpenStreetMap", category: "Maps", color: "text-orange-500" },
  { name: "MapLibre GL JS", category: "Maps", color: "text-orange-500" },
  { name: "Nominatim geocoding", category: "Maps", color: "text-orange-500" },
  { name: "OpenRouteService", category: "Maps", color: "text-orange-500" },

  { name: "vite-plugin-pwa + Workbox", category: "Offline", color: "text-slate-500" },
  { name: "IndexedDB via idb", category: "Offline", color: "text-slate-500" },
  { name: "OSM tile pre-caching", category: "Offline", color: "text-slate-500" },
  { name: "Durable mutation queue", category: "Offline", color: "text-slate-500" },

  { name: "jsPDF + autoTable", category: "Export", color: "text-gray-400" },
  { name: "Vitest + Testing Library", category: "Quality", color: "text-yellow-500" },
  { name: "ESLint 9 flat config", category: "Quality", color: "text-yellow-500" },
];

const techCategories = [
  "Frontend",
  "Backend",
  "AI",
  "Live Data",
  "Maps",
  "Offline",
  "Export",
  "Quality",
];

const techCategoryColors: Record<string, string> = {
  Frontend: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  Backend: "bg-green-500/10 text-green-600 border-green-500/20",
  AI: "bg-primary/10 text-primary border-primary/20",
  "Live Data": "bg-sky-500/10 text-sky-600 border-sky-500/20",
  Maps: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  Offline: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  Export: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  Quality: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
};

/* ─── Destinations ───
   `destinations` and `beyondIndia` live in @/data/destinations so the cards
   below and the TouristDestination ItemList in this page's structured data are
   generated from one array. Markup that describes content the visitor can't see
   is a policy violation, and sharing the source makes that impossible. ─── */

const tripTypes = [
  { title: "Beach & Relaxation", image: travelBeach },
  { title: "Mountain Adventure", image: travelHiker },
  { title: "Cultural Heritage", image: travelBoat },
  { title: "Water Sports", image: travelKayak },
];

/* ─── How it's built (replaces the fabricated review section) ─── */

const principles = [
  {
    icon: ListChecks,
    title: "No invented capabilities",
    desc: "An earlier version of this page advertised infrastructure that was never in the codebase. It was removed rather than quietly reworded, and the audit is committed to the repository claim by claim.",
    color: "text-primary bg-primary/10",
  },
  {
    icon: Scale,
    title: "Scores you can falsify",
    desc: "The fairness score is computed from stated preferences with plain arithmetic. That means it can be wrong — which is the point. A number that can't be wrong isn't a measurement.",
    color: "text-emerald-500 bg-emerald-500/10",
  },
  {
    icon: Quote,
    title: "No fake reviews",
    desc: "There are no testimonials here because there is no review system yet. Fabricated ratings were also stripped out of the page's structured data.",
    color: "text-violet-500 bg-violet-500/10",
  },
  {
    icon: IndianRupee,
    title: "Free all the way down",
    desc: "No paid API sits anywhere in the stack. Where one was once assumed, it was replaced with a free provider or a plain deep-link — not left behind as dead configuration.",
    color: "text-green-600 bg-green-600/10",
  },
  {
    icon: Zap,
    title: "A real bundle budget",
    desc: "Every route is code-split and the heavy map, PDF and on-device AI bundles load only on use. First load is roughly 175 kB gzipped.",
    color: "text-orange-500 bg-orange-500/10",
  },
  {
    icon: Lock,
    title: "Locked down by default",
    desc: "Row-Level Security on every table, PKCE auth, and the request cache purged on sign-out so one session can't read another's data.",
    color: "text-blue-600 bg-blue-600/10",
  },
];

/* ─── The request pipeline ───
   Every parameter below is read off the implementation: services/groqVoice.ts,
   lib/aiPlanner.ts, lib/itineraryVerifier.ts, lib/planRepair.ts,
   lib/groupRegret.ts and components/RegretPlanner.tsx. If one of those changes,
   change it here too — this section is the page's most falsifiable claim. */

interface PipelineStage {
  id: string;
  step: string;
  icon: LucideIcon;
  title: string;
  headline: string;
  detail: string;
  meta: { k: string; v: string }[];
  source: string;
  accent: string;
  bar: string;
}

const pipelineStages: PipelineStage[] = [
  {
    id: "capture",
    step: "01",
    icon: Mic,
    title: "Capture",
    headline: "Your sentence is transcribed in the browser",
    detail:
      "The Web Speech API handles this with no key and no upload. Only when a browser doesn't expose SpeechRecognition — and a Groq key is present — does it fall back to recording audio and sending it to Whisper. Read-aloud uses the browser's own speech synthesis.",
    meta: [
      { k: "Primary", v: "Web Speech API, on-device" },
      { k: "Alternatives kept", v: "3" },
      { k: "Interim results", v: "Streamed while you talk" },
      { k: "Fallback", v: "whisper-large-v3-turbo" },
    ],
    source: "src/services/groqVoice.ts",
    accent: "text-primary bg-primary/10 border-primary/20",
    bar: "from-orange-400 to-primary",
  },
  {
    id: "intent",
    step: "02",
    icon: ListChecks,
    title: "Intent",
    headline: "Eight fields are pulled out of one sentence",
    detail:
      "Destination, start date, duration, traveller count, budget range, interests, trip type and a confidence score. Temperature is pinned to zero because this step should not be creative. If it fails for any reason it returns nulls with confidence 0 rather than throwing — you get asked, not an error page.",
    meta: [
      { k: "Temperature", v: "0.0" },
      { k: "Token budget", v: "512" },
      { k: "Output", v: "Strict JSON mode" },
      { k: "On failure", v: "Nulls, confidence 0" },
    ],
    source: "extractIntent · src/lib/aiPlanner.ts",
    accent: "text-sky-500 bg-sky-500/10 border-sky-500/20",
    bar: "from-sky-400 to-blue-500",
  },
  {
    id: "draft",
    step: "03",
    icon: Brain,
    title: "Draft",
    headline: "Three candidate plans come back in a single call",
    detail:
      "One request returns all three variants, each biased to a different share of your budget, so the options are comparable rather than three separate rolls of the dice. Every activity carries coordinates, timestamps with a +05:30 offset, a category, a cost and a review score — which is exactly what the next two stages need to do their job.",
    meta: [
      { k: "Variants", v: "budget · balanced · experience" },
      { k: "Cost bias", v: "0.6× · 0.8× · 1.0× budget" },
      { k: "Activities each", v: "min(days × 3, 12)" },
      { k: "Temperature", v: "0.7 · 8192 tokens" },
    ],
    source: "regretCounterfactual · src/lib/aiPlanner.ts",
    accent: "text-violet-500 bg-violet-500/10 border-violet-500/20",
    bar: "from-violet-400 to-purple-500",
  },
  {
    id: "verify",
    step: "04",
    icon: ShieldCheck,
    title: "Verify",
    headline: `${FEASIBILITY_CHECK_COUNT} deterministic checks, no model involved`,
    detail:
      "Pure functions, no network, no inference — which is why this runs offline in milliseconds and returns the same answer every time. Errors block a plan; warnings annotate it. Findings are prefixed with the variant they came from so you can tell which candidate broke.",
    meta: [
      { k: "Checks", v: String(FEASIBILITY_CHECK_COUNT) },
      { k: "Blocking", v: "7 errors" },
      { k: "Annotating", v: "4 warnings" },
      { k: "Source-dependent", v: "2 opening-hours checks" },
    ],
    source: "src/lib/itineraryVerifier.ts",
    accent: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    bar: "from-emerald-400 to-teal-500",
  },
  {
    id: "repair",
    step: "05",
    icon: Wrench,
    title: "Repair",
    headline: "One retry, and it has to actually be better",
    detail:
      "Failures are turned into a numbered instruction and sent back once. Warnings are deliberately left out of that prompt, so a nudge about pace never triggers a regeneration. The second plan only wins if it has strictly fewer errors — a tie keeps the original, because a model rewriting a plan sideways is not progress.",
    meta: [
      { k: "Retries", v: "1 (two model calls at most)" },
      { k: "Prompt contains", v: "Errors only" },
      { k: "Tie-break", v: "Original plan is kept" },
      { k: "If the retry throws", v: "First plan, error surfaced" },
    ],
    source: "generateWithRepair · src/lib/planRepair.ts",
    accent: "text-amber-500 bg-warning/10 border-warning/20",
    bar: "from-yellow-400 to-amber-500",
  },
  {
    id: "score",
    step: "06",
    icon: Scale,
    title: "Score",
    headline: "Feasibility first, then fairness",
    detail:
      "Each traveller's utility is computed from their own stated preferences, and a plan's group score is the worst member's regret. The recommendation minimises that — but only among plans that passed verification. A beautifully fair impossible plan still loses to a feasible one.",
    meta: [
      { k: "Strategy", v: "Least Misery" },
      { k: "Utility", v: "0.6 interest · 0.2 quality · 0.2 affordability" },
      { k: "Tie-break", v: "Average regret, then order" },
      { k: "Skipped when", v: "No member has stated preferences" },
    ],
    source: "src/lib/groupRegret.ts",
    accent: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    bar: "from-blue-400 to-indigo-500",
  },
  {
    id: "save",
    step: "07",
    icon: Database,
    title: "Save",
    headline: "Written with the score it was chosen on",
    detail:
      "The itinerary row is created or updated, activities are written with their coordinates and opening-hours provenance, and the computed group regret is stored alongside. A single-plan generation leaves that score null on purpose: regret is measured against alternatives, and one plan has none.",
    meta: [
      { k: "Stored", v: "Itinerary, activities, cost breakdown" },
      { k: "Group score", v: "Persisted as regret_score" },
      { k: "Single plan", v: "Score left null, honestly" },
      { k: "Offline", v: "Trip creation queues and replays" },
    ],
    source: "applyPlan · src/components/RegretPlanner.tsx",
    accent: "text-slate-500 bg-slate-500/10 border-slate-500/20",
    bar: "from-slate-400 to-slate-500",
  },
];

const pipelineNumbers = [
  { value: "1–2", label: "Model calls per plan request", icon: Cpu },
  { value: "3", label: "Candidate plans, one call", icon: Layers },
  { value: String(FEASIBILITY_CHECK_COUNT), label: "Checks before you see it", icon: ShieldCheck },
  { value: "0", label: "Checks that need the network", icon: WifiOff },
];

/** What is actually doing the work at each stage. Three of seven are the model. */
const stageKind: Record<string, { label: string; chip: string }> = {
  capture: { label: "Browser", chip: "bg-primary/10 text-primary border-primary/20" },
  intent: { label: "Model", chip: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  draft: { label: "Model", chip: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  verify: { label: "Code", chip: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  repair: { label: "Model", chip: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  score: { label: "Code", chip: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  save: { label: "Database", chip: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
};

/** The activity shape the model is required to return, field by field. */
const activityFields = [
  { field: "name · description", note: "What it is, in plain language" },
  { field: "location_name · lat · lng", note: "Enough to route to it and sanity-check the region" },
  { field: "start_time · end_time", note: "Timestamps with a +05:30 offset" },
  { field: "category", note: "One of seven — this drives the interest score" },
  { field: "cost", note: "₹, summed and checked against the budget" },
  { field: "review_score", note: "Feeds the quality component of each utility" },
  { field: "estimated_steps", note: "Used for pace and accessibility context" },
  { field: "opening_hours", note: "Carries a source flag: model, or verified" },
  {
    field: "reasoning — per plan",
    note: "Selection criteria, budget strategy and local tips for the whole plan",
  },
];

/* ─── The verifier, check by check ───
   Mirrors the ViolationCode union in lib/itineraryVerifier.ts. */

type CheckSeverity = "error" | "warning" | "conditional";

interface VerificationCheck {
  code: string;
  severity: CheckSeverity;
  icon: LucideIcon;
  what: string;
  detail: string;
}

const verificationChecks: VerificationCheck[] = [
  {
    code: "BUDGET_EXCEEDED",
    severity: "error",
    icon: Wallet,
    what: "Costs add up to more than the budget",
    detail:
      "Summed activity costs against the budget with a 2% tolerance, so rounding doesn't trip it but ₹80,000 of plans on ₹40,000 does.",
  },
  {
    code: "TIME_OVERLAP",
    severity: "error",
    icon: Timer,
    what: "Two activities booked over each other",
    detail:
      "Activities are sorted by start time, then each start is compared against the previous end. Two things at 3 pm is the classic model failure.",
  },
  {
    code: "TRAVEL_INFEASIBLE",
    severity: "error",
    icon: Route,
    what: "A gap too short to cover the distance",
    detail:
      "Straight-line distance between consecutive stops has to fit inside the scheduled gap at 45 km/h plus 15 minutes of slack. Hops under 1 km are ignored.",
  },
  {
    code: "TIME_REVERSED",
    severity: "error",
    icon: Clock,
    what: "An activity that ends before it starts",
    detail: "end <= start. Rare, and unambiguous when it happens.",
  },
  {
    code: "TIME_INVALID",
    severity: "error",
    icon: AlertTriangle,
    what: "A timestamp that isn't a real time",
    detail:
      "Unparseable or missing start or end. That activity is then excluded from the overlap and travel checks rather than corrupting them.",
  },
  {
    code: "COORD_INVALID",
    severity: "error",
    icon: MapPin,
    what: "Coordinates that aren't on Earth",
    detail: "Latitude outside ±90 or longitude outside ±180.",
  },
  {
    code: "EMPTY_ITINERARY",
    severity: "error",
    icon: XCircle,
    what: "A plan with no activities in it",
    detail:
      "Short-circuits the whole run — none of the other checks have anything to say about nothing.",
  },
  {
    code: "CLOSED_ON_DAY",
    severity: "conditional",
    icon: Lock,
    what: "Booked on a day the place is shut",
    detail:
      "Blocks when the opening hours came from OpenStreetMap or a person. Only warns when the model supplied them, because that isn't evidence.",
  },
  {
    code: "OUTSIDE_OPENING_HOURS",
    severity: "conditional",
    icon: Clock,
    what: "Booked outside that day's open hours",
    detail:
      "Same provenance rule. Where hours are missing entirely, no check runs at all — absence of data isn't evidence of closure.",
  },
  {
    code: "PACE_EXCEEDED",
    severity: "warning",
    icon: Gauge,
    what: "More than 6 activities in one day",
    detail:
      "Counted per local calendar day. Some people genuinely want that, so it annotates instead of blocking.",
  },
  {
    code: "COST_SUM_MISMATCH",
    severity: "warning",
    icon: Calculator,
    what: "The stated total doesn't match the parts",
    detail: "Difference of more than ₹1 between total_cost and the sum of activity costs.",
  },
  {
    code: "DURATION_IMPLAUSIBLE",
    severity: "warning",
    icon: Clock,
    what: "A single activity longer than 14 hours",
    detail: "Usually a timestamp error rather than an ambitious afternoon.",
  },
  {
    code: "COORD_OUT_OF_REGION",
    severity: "warning",
    icon: Compass,
    what: "A stop far outside the destination",
    detail:
      "Implemented and tested, but it needs an anchor point to arm and neither caller passes one today. Listed because it's in the union, not because it's protecting you.",
  },
];

const severityMeta: Record<
  CheckSeverity,
  { label: string; chip: string; dot: string; blurb: string }
> = {
  error: {
    label: "Blocks the plan",
    chip: "bg-red-500/10 text-red-600 border-red-500/20",
    dot: "bg-red-500",
    blurb: "A plan is only ok when there are zero of these.",
  },
  warning: {
    label: "Annotates it",
    chip: "bg-warning/10 text-amber-600 border-warning/20",
    dot: "bg-warning",
    blurb: "Shown to you, never hidden, but they don't reject a plan.",
  },
  conditional: {
    label: "Depends on the source",
    chip: "bg-violet-500/10 text-violet-600 border-violet-500/20",
    dot: "bg-violet-500",
    blurb: "Blocks on verified data, warns on model-supplied data.",
  },
};

const severityFilters: ("All" | CheckSeverity)[] = ["All", "error", "conditional", "warning"];

const verifierConstants = [
  { label: "Assumed road speed", value: "45 km/h", note: "Applied to straight-line distance, so a real route is longer" },
  { label: "Travel slack", value: "+15 min", note: "Added to every leg before it's called infeasible" },
  { label: "Budget tolerance", value: "2%", note: "Rounding room before a plan is rejected on cost" },
  { label: "Cost sum tolerance", value: "₹1", note: "Before the stated total is flagged as wrong" },
  { label: "Max activity length", value: "14 h", note: "Longer reads as a timestamp bug" },
  { label: "Default pace ceiling", value: "6 / day", note: "Per local calendar day" },
];

const repairSteps = [
  {
    icon: XCircle,
    title: "Collect the errors",
    desc: "Only errors. A pace warning never causes a regeneration.",
  },
  {
    icon: RefreshCw,
    title: "Ask once, specifically",
    desc: "A numbered list of what failed, with the same JSON shape required back.",
  },
  {
    icon: Scale,
    title: "Keep the better plan",
    desc: "Strictly fewer errors wins. A tie keeps the original.",
  },
  {
    icon: Info,
    title: "Say what happened",
    desc: '"Second pass fixed 2 of 3 issues; 1 remains" — not a silent swap.',
  },
];

/* ─── Fairness, with a worked example ───
   Component values below are the inputs; every utility, regret and group score
   rendered on the page is computed from them with the same weights the app
   uses, so the arithmetic on screen can't drift from lib/groupRegret.ts. */

const UTILITY_WEIGHTS = { interest: 0.6, quality: 0.2, affordability: 0.2 };

const fairnessMembers = [
  {
    id: "asha",
    name: "Asha",
    prefs: "Food 0.9 · Attractions 0.9",
    ceiling: "₹20,000",
    tint: "text-primary bg-primary/10 border-primary/20",
  },
  {
    id: "ben",
    name: "Ben",
    prefs: "Shopping 0.9",
    ceiling: "₹40,000",
    tint: "text-violet-600 bg-violet-500/10 border-violet-500/20",
  },
];

interface FairnessPlan {
  id: string;
  variant: string;
  cost: string;
  mix: string;
  rating: string;
  /** interest, quality, affordability per member — the three utility components */
  components: Record<string, { interest: number; quality: number; affordability: number }>;
}

const fairnessPlans: FairnessPlan[] = [
  {
    id: "budget",
    variant: "Budget",
    cost: "₹18,000",
    mix: "2 food · 2 attractions",
    rating: "4.0",
    components: {
      asha: { interest: 0.9, quality: 0.8, affordability: 1 },
      ben: { interest: 0.5, quality: 0.8, affordability: 1 },
    },
  },
  {
    id: "balanced",
    variant: "Balanced",
    cost: "₹24,000",
    mix: "Food · attraction · shopping · other",
    rating: "4.0",
    components: {
      asha: { interest: 0.7, quality: 0.8, affordability: 0.8 },
      ben: { interest: 0.6, quality: 0.8, affordability: 1 },
    },
  },
  {
    id: "experience",
    variant: "Experience",
    cost: "₹30,000",
    mix: "2 shopping · 2 attractions",
    rating: "4.5",
    components: {
      asha: { interest: 0.7, quality: 0.9, affordability: 0.5 },
      ben: { interest: 0.7, quality: 0.9, affordability: 1 },
    },
  },
];

const utilityComponents = [
  {
    key: "interest",
    weight: "0.6",
    icon: Sparkles,
    title: "Interest",
    desc: "The mean of your own category weights across the plan's activities. A category you never rated counts as a neutral 0.5. Transport and accommodation are left out — nobody picks a trip for the taxi.",
    color: "text-primary bg-primary/10",
  },
  {
    key: "quality",
    weight: "0.2",
    icon: CheckCircle,
    title: "Quality",
    desc: "Mean review score over the rated activities, normalised against 5. When nothing in the plan carries a rating, this contributes a flat 0.5 rather than punishing the plan for missing data.",
    color: "text-emerald-500 bg-emerald-500/10",
  },
  {
    key: "affordability",
    weight: "0.2",
    icon: Wallet,
    title: "Affordability",
    desc: "1.0 while the plan sits inside your personal ceiling, then decays linearly to 0 at twice that ceiling. Your ceiling, not the group's — which is how a shared budget stops hiding an individual's squeeze.",
    color: "text-blue-500 bg-blue-500/10",
  },
];

/* ─── Offline capability matrix ─── */

type OfflineLevel = "full" | "stale" | "none";

const offlineMatrix: {
  level: OfflineLevel;
  label: string;
  sub: string;
  icon: LucideIcon;
  chip: string;
  items: string[];
}[] = [
  {
    level: "full",
    label: "Works with no connection",
    sub: "Cached or computed locally",
    icon: CheckCircle,
    chip: "border-emerald-500/30 bg-emerald-500/[0.05]",
    items: [
      "The app shell and every route",
      "Any trip you saved, with its itinerary and activities",
      "Map tiles around a saved trip — about 173 pre-cached per trip",
      "Expense maths, currency conversion and PDF export",
      "Local emergency numbers in the SOS panel",
      "On-device AI, once the model weights are cached",
      `${FEASIBILITY_CHECK_COUNT} plan checks — pure functions, no network`,
      "Your edits, queued in order and replayed on reconnect",
    ],
  },
  {
    level: "stale",
    label: "Serves what it last saw",
    sub: "Revalidated when you're back",
    icon: Clock,
    chip: "border-amber-500/30 bg-warning/[0.05]",
    items: [
      "Trip and profile reads you've already made — up to a day",
      "Weather, for 15 minutes, then it wants the network",
      "Place lookups and geocoding — up to a week",
      "Wikipedia context and imagery — a week and a month",
    ],
  },
  {
    level: "none",
    label: "Needs a connection",
    sub: "And says so instead of failing quietly",
    icon: WifiOff,
    chip: "border-border bg-muted/30",
    items: [
      "Signing in or signing up — deliberately never cached",
      "Hosted inference, if you're on the Groq engine",
      "Live chat, votes and location sharing",
      "A route you haven't calculated yet",
    ],
  },
];

const queueRules = [
  {
    icon: ListChecks,
    title: "Strict order, across reloads",
    desc: "Writes replay first-in-first-out on a monotonic sequence number rather than a millisecond timestamp, so a burst of edits can't come back shuffled.",
  },
  {
    icon: Signal,
    title: "Only network failures queue",
    desc: "A permission denial or a constraint violation tells you immediately. Queueing those would just delay the bad news.",
  },
  {
    icon: AlertTriangle,
    title: "Conflicts surface, never merge",
    desc: "If the row changed while you were offline, the write is retired and shown to you. Silently overwriting someone else's edit is worse than asking.",
  },
  {
    icon: Lock,
    title: "One sync at a time",
    desc: "A single in-flight lock means reconnecting and hitting retry can't apply the same change twice.",
  },
];

/* ─── Verified state ───
   Figures from the repository's own verification pass, documented in
   docs/BACKLOG.md §1. Paired with what that pass could NOT check, because a
   list of green ticks with no caveats is a marketing claim, not a test report. */

const verifiedState = [
  { label: "TypeScript", value: "Clean", note: "tsc --noEmit, strict project config" },
  { label: "Lint", value: "0 errors", note: "157 warnings, all at network boundaries" },
  { label: "Unit tests", value: "228 passing", note: "Across 9 files" },
  { label: "Production build", value: "Succeeds", note: "Every route code-split" },
  { label: "Service worker", value: "91 entries", note: "≈4.9 MB precached, printed by the build" },
  { label: "Dependencies", value: "No paid tier", note: "Only Supabase is required" },
];

const notVerified = [
  "On-device inference has never been measured — no load time, tokens per second or peak GPU figure",
  "Lighthouse hasn't been run against a production deploy",
  "Home-screen install is untested on real Android and iOS hardware",
  "Row-Level Security is written and reviewed, but not probed against the live project",
];

const testBreakdown = [
  { name: "Group regret scoring", count: 36 },
  { name: "Opening hours + verifier integration", count: 46 },
  { name: "Travel preferences", count: 33 },
  { name: "Offline mutation queue", count: 31 },
  { name: "Itinerary verifier", count: 26 },
  { name: "Plan repair loop", count: 21 },
  { name: "AI provider selection", count: 19 },
  { name: "IndexedDB offline trips", count: 15 },
];

const quickstart = [
  { cmd: "git clone https://github.com/HarshTambade/Radiator-Routes.git", note: "MIT licensed" },
  { cmd: "npm install", note: "No paid registry, no private packages" },
  { cmd: "cp .env.example .env", note: "Two Supabase values are all that's required" },
  { cmd: "npm run dev", note: "Everything else degrades gracefully without a key" },
];

const requiredEnv = [
  { key: "VITE_SUPABASE_URL", need: "Required", desc: "Auth, database and realtime" },
  { key: "VITE_SUPABASE_PUBLISHABLE_KEY", need: "Required", desc: "The anon publishable key" },
  { key: "VITE_GROQ_API_KEY", need: "Optional", desc: "Free tier. Skip it and use on-device AI" },
  { key: "VITE_ORS_API_KEY", need: "Optional", desc: "Routing and elevation, 2k requests a day" },
  { key: "VITE_OPENTRIPMAP_API_KEY", need: "Optional", desc: "Place discovery, 1k requests a day" },
];

/* ─── What isn't here yet ───
   From docs/BACKLOG.md §4. A roadmap section that only lists wins is a
   feature list wearing a different hat. */

const roadmap: {
  group: string;
  icon: LucideIcon;
  tint: string;
  items: { title: string; desc: string }[];
}[] = [
  {
    group: "Known limits",
    icon: AlertTriangle,
    tint: "text-amber-600 bg-warning/10 border-warning/20",
    items: [
      {
        title: "Opening hours aren't authoritative",
        desc: "The model supplies them, so a closed-on-Tuesday finding warns instead of blocking. Nothing imports hours from OpenStreetMap yet.",
      },
      {
        title: "Conflicts are redone, not merged",
        desc: "There's no field-level merge. If a row moved under you while offline, the queue retires the write and asks you to redo it.",
      },
      {
        title: "Updates replace rather than diff",
        desc: "Applying a plan deletes the old activities and inserts the new ones, so per-activity history isn't preserved.",
      },
      {
        title: "Three write paths skip the queue",
        desc: "Expense splits, community memberships and event RSVPs still need a connection to succeed.",
      },
    ],
  },
  {
    group: "Planned next",
    icon: GitBranch,
    tint: "text-primary bg-primary/10 border-primary/20",
    items: [
      {
        title: "Votes feeding the fairness score",
        desc: "Activity votes are stored and realtime already, but the scorer still reads only stated preferences.",
      },
      {
        title: "Offline route geometry",
        desc: "Tiles cache per trip; the routes drawn on them don't. A saved trip should keep its lines too.",
      },
      {
        title: "Budget against actuals",
        desc: "Planned cost and money actually spent are tracked separately today and never compared.",
      },
      {
        title: "Trip export and import",
        desc: "PDF export exists. A round-trippable format that another instance can read doesn't.",
      },
    ],
  },
  {
    group: "Out of scope for now",
    icon: Compass,
    tint: "text-slate-500 bg-slate-500/10 border-slate-500/20",
    items: [
      {
        title: "On-device vision",
        desc: "Every curated local model is text-only, so the camera description feature can't run without the network.",
      },
      {
        title: "A true route optimiser",
        desc: "The plan is scored, not solved. A tour-and-orienteering solver is a research project, not a sprint.",
      },
      {
        title: "Agents negotiating live",
        desc: "Interesting, and previously claimed on this very page without existing. It stays on the backlog until it's real.",
      },
      {
        title: "Learning preferences across users",
        desc: "Travel memory is per account. Anything federated needs a privacy design first.",
      },
    ],
  },
];

/* ─── FAQ ─── */

const faqs: { q: string; a: string }[] = [
  {
    q: "What does it cost to use?",
    a: "Nothing, and there's no card anywhere in the flow. Every integration is free or free-tier: Groq for hosted inference, Open-Meteo for weather, OpenStreetMap and Nominatim for maps and geocoding, Wikipedia for place context, OpenRouteService for routing. Paid services that an earlier version of this project assumed were removed and replaced, not left behind as dead configuration.",
  },
  {
    q: "Do I need an API key?",
    a: "To run your own copy, only the Supabase URL and publishable key. Voice input needs no key at all because it uses the browser's own speech recognition. A Groq key is free and optional — pick the on-device engine instead and there's no key in the picture at all.",
  },
  {
    q: "How private is on-device mode really?",
    a: "The model weights download once, then inference runs on your own GPU through WebGPU and prompts never leave the machine. That's a property of where the code runs, not a promise about a server. The trade-off is honest too: you're running a 1–8B model instead of a 70B one, so the plans are noticeably simpler.",
  },
  {
    q: "What happens when the AI gets it wrong?",
    a: `Some of it gets caught: ${FEASIBILITY_CHECK_COUNT} deterministic checks reject impossible plans and one repair pass asks for a fix. Some of it doesn't — a place can be real, open, affordable, reachable and still a bad idea. Warnings are shown rather than hidden, the reasoning panel explains why each activity was picked, and everything stays editable.`,
  },
  {
    q: "Which browsers support the on-device engine?",
    a: "WebGPU is needed: Chrome or Edge 113 and up, Chrome for Android 121 and up, Safari 26 and up, plus roughly as much free GPU memory as the model. The app asks for a real GPU adapter before offering the option, because a browser can expose the API and still refuse one. If that probe fails it tells you why and stays on hosted.",
  },
  {
    q: "Does anything work without a connection?",
    a: "Saved trips, their activities and the map tiles around them open offline, and edits you make are queued in order and replayed when you reconnect. Signing in and hosted inference need the network and say so. Full breakdown in the offline section above.",
  },
  {
    q: "Is my trip data isolated from other users?",
    a: "Every table is guarded by Row-Level Security policies, auth uses the PKCE flow, and the request cache is purged on sign-out so one session can't read another's data. Worth being precise: those policies are written and reviewed, but the project's own notes record that they haven't been probed against the live database yet.",
  },
  {
    q: "Does it work outside India?",
    a: "Yes, with an Indian default. Budgets are ₹ INR native and the destinations up front are Indian, but discovery, routing and maps are OpenStreetMap-based, so anywhere OSM covers is fair game — and currency plus date formatting follow the country you're in.",
  },
  {
    q: "Is there an app to install?",
    a: "It's a PWA, so it installs from the browser to your home screen rather than from a store, with the service worker caching the shell and your saved trips. Being straight about it: install has been verified in a desktop browser, not yet on physical Android or iOS hardware.",
  },
  {
    q: "Can I run or fork it myself?",
    a: "It's MIT licensed and the whole thing is in the repository, including the audit that removed the false claims from this page. Clone it, add two Supabase values, run npm run dev. The quickstart in the tech section has the exact commands.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
   Motion helpers
   ──────────────────────────────────────────────────────────────────────────── */

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Reveals children on first scroll into view.
 *
 * Starts visible when IntersectionObserver is missing or the user has asked for
 * reduced motion, so content is never gated behind an effect that might not run.
 */
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(
    () => typeof IntersectionObserver === "undefined" || prefersReducedMotion(),
  );

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      style={shown && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  accent,
  children,
  align = "center",
}: {
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  title: ReactNode;
  accent?: string;
  children?: ReactNode;
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "text-center mb-14" : "mb-14"}>
      {eyebrow && (
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-5">
          {EyebrowIcon && <EyebrowIcon className="w-3.5 h-3.5" aria-hidden="true" />}
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
        {title}
        {accent && <span className="text-primary italic"> {accent}</span>}
      </h2>
      {children && (
        <p
          className={`text-muted-foreground leading-relaxed ${
            centered ? "max-w-2xl mx-auto" : "max-w-2xl"
          }`}
        >
          {children}
        </p>
      )}
    </div>
  );
}

/** Reading-position bar. Sits on the navbar's lower edge rather than at the top
 *  of the viewport, so it doesn't fight the browser chrome on mobile. */
function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      setPct(scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-16 left-0 right-0 z-[49] h-[2px] overflow-hidden pointer-events-none"
    >
      <div
        className="h-full w-full bg-primary origin-left transition-transform duration-150 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
}

/**
 * Counts to `to` once scrolled into view.
 *
 * Renders the final value straight away when IntersectionObserver is missing or
 * reduced motion is requested, so the number is never gated behind an animation.
 */
function CountUp({
  to,
  prefix = "",
  suffix = "",
  duration = 1200,
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const skip =
    typeof IntersectionObserver === "undefined" ||
    typeof requestAnimationFrame === "undefined" ||
    prefersReducedMotion();
  const [value, setValue] = useState(() => (skip ? to : 0));
  const ref = useRef<HTMLSpanElement | null>(null);
  const done = useRef(skip || to === 0);

  useEffect(() => {
    if (done.current) return;
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (done.current || !entries.some((e) => e.isIntersecting)) return;
        done.current = true;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value}
      {suffix}
    </span>
  );
}

/** Monospace pill for a file path or identifier lifted from the codebase. */
function CodeChip({ children }: { children: ReactNode }) {
  return (
    <code className="inline-block px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-muted-foreground break-all">
      {children}
    </code>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────────────────────── */

export default function Landing() {
  const [activeReason, setActiveReason] = useState(0);
  const [activeFeatureTag, setActiveFeatureTag] = useState("All");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  // New interactive sections
  const [activeStage, setActiveStage] = useState(0);
  const [checkSeverity, setCheckSeverity] = useState<"All" | CheckSeverity>("All");
  const [activePlan, setActivePlan] = useState("budget");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Hero slideshow: `heroPaused` is the user's explicit pause, `heroHold` is a
  // transient pause while the controls have keyboard focus or the pointer.
  const [heroSlide, setHeroSlide] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroHold, setHeroHold] = useState(false);
  const [heroExpanded, setHeroExpanded] = useState(false);

  // Slides 2..n mount slightly late so three extra full-bleed images aren't
  // competing with the LCP image for bandwidth on first paint. The first
  // transition isn't due for HERO_INTERVAL_MS, which is ample time to fetch.
  useEffect(() => {
    const id = window.setTimeout(() => setHeroExpanded(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  // Auto-advance. A timeout keyed on the current slide means a manual pick also
  // restarts the dwell time. Skipped entirely under prefers-reduced-motion.
  useEffect(() => {
    if (heroPaused || heroHold || prefersReducedMotion()) return;
    const id = window.setTimeout(
      () => setHeroSlide((i) => (i + 1) % heroSlides.length),
      HERO_INTERVAL_MS,
    );
    return () => window.clearTimeout(id);
  }, [heroSlide, heroPaused, heroHold]);

  // Swap the navbar from glass-over-hero to solid once the hero is behind us,
  // otherwise white nav text sits on light sections further down the page.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Highlight the nav link for whichever section is in view.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = navLinks
      .map((l) => document.getElementById(l.href.slice(1)))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setActiveSection(best.target.id);
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: [0, 0.2, 0.5, 1] },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const featureCounts = useMemo(() => {
    const counts = new Map<string, number>([["All", allFeatures.length]]);
    for (const f of allFeatures) {
      counts.set(f.tag, (counts.get(f.tag) ?? 0) + 1);
    }
    return counts;
  }, []);

  const filteredFeatures = useMemo(
    () =>
      activeFeatureTag === "All"
        ? allFeatures
        : allFeatures.filter((f) => f.tag === activeFeatureTag),
    [activeFeatureTag],
  );

  const currentReason = reasons[activeReason] ?? reasons[0];
  const currentStage = pipelineStages[activeStage] ?? pipelineStages[0];

  const checkCounts = useMemo(() => {
    const counts = new Map<string, number>([["All", verificationChecks.length]]);
    for (const c of verificationChecks) {
      counts.set(c.severity, (counts.get(c.severity) ?? 0) + 1);
    }
    return counts;
  }, []);

  const filteredChecks = useMemo(
    () =>
      checkSeverity === "All"
        ? verificationChecks
        : verificationChecks.filter((c) => c.severity === checkSeverity),
    [checkSeverity],
  );

  /**
   * The worked fairness example, computed rather than typed in.
   *
   * Same weights and the same Least Misery aggregation as lib/groupRegret.ts:
   * utility per member, best available utility across the candidate set, regret
   * as the gap, group score as the worst member's regret.
   */
  const fairness = useMemo(() => {
    const utilityOf = (c: { interest: number; quality: number; affordability: number }) =>
      Math.min(
        1,
        Math.max(
          0,
          UTILITY_WEIGHTS.interest * c.interest +
            UTILITY_WEIGHTS.quality * c.quality +
            UTILITY_WEIGHTS.affordability * c.affordability,
        ),
      );

    const utilities = new Map<string, Map<string, number>>();
    for (const plan of fairnessPlans) {
      const perMember = new Map<string, number>();
      for (const member of fairnessMembers) {
        const components = plan.components[member.id];
        perMember.set(member.id, components ? utilityOf(components) : 0);
      }
      utilities.set(plan.id, perMember);
    }

    const bestPerMember = new Map<string, number>();
    for (const member of fairnessMembers) {
      bestPerMember.set(
        member.id,
        Math.max(...fairnessPlans.map((p) => utilities.get(p.id)?.get(member.id) ?? 0)),
      );
    }

    const scored = fairnessPlans.map((plan) => {
      const members = fairnessMembers.map((member) => {
        const utility = utilities.get(plan.id)?.get(member.id) ?? 0;
        const best = bestPerMember.get(member.id) ?? 0;
        return { ...member, utility, best, regret: Math.max(0, best - utility) };
      });
      const regrets = members.map((m) => m.regret);
      return {
        ...plan,
        members,
        groupRegret: Math.max(...regrets),
        averageRegret: regrets.reduce((a, b) => a + b, 0) / regrets.length,
      };
    });

    const recommended = [...scored].sort(
      (a, b) => a.groupRegret - b.groupRegret || a.averageRegret - b.averageRegret,
    )[0];

    return { scored, recommendedId: recommended?.id ?? null };
  }, []);

  const currentFairnessPlan =
    fairness.scored.find((p) => p.id === activePlan) ?? fairness.scored[0];

  const copyCommand = (cmd: string) => {
    void navigator.clipboard
      ?.writeText(cmd)
      .then(() => {
        setCopiedCmd(cmd);
        window.setTimeout(
          () => setCopiedCmd((c) => (c === cmd ? null : c)),
          1600,
        );
      })
      .catch(() => setCopiedCmd(null));
  };

  const navLinkClass = (active: boolean) => {
    if (scrolled) {
      return active
        ? "text-primary"
        : "text-muted-foreground hover:text-foreground";
    }
    return active ? "text-white" : "text-white/70 hover:text-white";
  };

  /* ─── Structured data ───
     Built from the same arrays the sections below render, so the markup can
     never describe something a visitor can't see. The base metadata — title,
     description, canonical, Open Graph, Twitter — comes from the route registry
     in src/lib/seoRoutes.ts; only the page-specific graph is assembled here. */
  const structuredData = useMemo<JsonLd[]>(() => {
    const pageUrl = canonicalUrl("/");

    return [
      destinationListJsonLd(
        destinations,
        "Featured destinations in India",
        pageUrl,
      ),
      destinationListJsonLd(beyondIndia, "Destinations beyond India", pageUrl),
      // Rendered verbatim by the #faq section further down; FAQ rich results
      // require exactly that.
      faqPageJsonLd(
        faqs.map((faq) => ({ question: faq.q, answer: faq.a })),
        pageUrl,
      ),
    ];
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Seo jsonLd={structuredData} />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-full focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>

      {/* ─── Navbar ─── */}
      <header
        className={`fixed top-0 w-full z-50 transition-colors duration-300 ${
          scrolled
            ? "bg-background/85 backdrop-blur-md border-b border-border shadow-card"
            : "bg-black/30 backdrop-blur-md border-b border-white/10"
        }`}
      >
        <nav
          aria-label="Main"
          className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between"
        >
          <a href="#main" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <MapPin className="w-4 h-4 text-primary-foreground" aria-hidden="true" />
            </div>
            <span
              className={`font-display text-lg font-bold tracking-tight transition-colors ${
                scrolled ? "text-foreground" : "text-white"
              }`}
            >
              Atlas AI
            </span>
          </a>

          <div className="hidden lg:flex items-center gap-3.5 xl:gap-5">
            {navLinks.map((link) => {
              const active = activeSection === link.href.slice(1);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "location" : undefined}
                  className={`relative text-[13px] xl:text-sm font-medium transition-colors ${navLinkClass(active)}`}
                >
                  {link.label}
                  <span
                    aria-hidden="true"
                    className={`absolute -bottom-1.5 left-0 right-0 h-0.5 rounded-full transition-transform duration-300 origin-left motion-reduce:transition-none ${
                      scrolled ? "bg-primary" : "bg-white"
                    } ${active ? "scale-x-100" : "scale-x-0"}`}
                  />
                </a>
              );
            })}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/auth"
              className={`hidden sm:inline-block px-4 py-2 text-sm font-medium transition-colors ${
                scrolled
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Log in
            </Link>
            <Link
              to="/auth?mode=signup"
              className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className={`lg:hidden w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                scrolled
                  ? "text-foreground hover:bg-muted"
                  : "text-white hover:bg-white/10"
              }`}
            >
              {menuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </nav>

        {/* Mobile menu — the previous navbar simply had no links below `md`. */}
        {menuOpen && (
          <div
            id="mobile-menu"
            className="lg:hidden bg-background border-t border-border shadow-elevated max-h-[75vh] overflow-y-auto overscroll-contain"
          >
            <ul className="px-6 py-4 space-y-1">
              {[...navLinks, ...mobileOnlyLinks].map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between py-2.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {link.label}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  </a>
                </li>
              ))}
              <li className="pt-2">
                <Link
                  to="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="block py-2.5 text-sm font-semibold text-primary"
                >
                  Log in
                </Link>
              </li>
            </ul>
          </div>
        )}
      </header>

      <ScrollProgress />

      <main id="main">
        {/* ─── Hero ─── */}
        <section className="relative min-h-[100svh] flex items-center justify-center overflow-hidden">
          {/* Crossfading slides. The first is the LCP image and renders
              immediately; `fetchpriority` is omitted because react-dom 18
              doesn't recognise the prop and warns. */}
          {heroSlides.map((slide, i) => {
            if (i > 0 && !heroExpanded) return null;
            return (
              <img
                key={slide.image}
                src={slide.image}
                alt=""
                aria-hidden="true"
                decoding="async"
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-out motion-reduce:transition-none ${
                  i === heroSlide
                    ? "opacity-100 animate-ken-burns motion-reduce:animate-none"
                    : "opacity-0"
                }`}
              />
            );
          })}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/80" />
          {/* Warms the frame toward the brand colour without washing the photo out. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_115%,hsl(var(--primary)/0.35),transparent_60%)]"
          />

          {/* Slide controls. These are the numbers that previously did nothing.
              Vertical rail on large screens, horizontal row above the stats bar
              on smaller ones. */}
          <div
            role="group"
            aria-label="Hero background image"
            onMouseEnter={() => setHeroHold(true)}
            onMouseLeave={() => setHeroHold(false)}
            onFocus={() => setHeroHold(true)}
            onBlur={() => setHeroHold(false)}
            /* The stats bar below wraps to two rows under `md`, so the row of
               controls has to sit higher there to clear it. */
            className="absolute z-20 flex items-center gap-3 left-1/2 -translate-x-1/2 bottom-[9.5rem] md:bottom-24 lg:left-8 lg:bottom-auto lg:top-1/2 lg:translate-x-0 lg:-translate-y-1/2 lg:flex-col lg:gap-4"
          >
            {heroSlides.map((slide, i) => {
              const active = i === heroSlide;
              return (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => setHeroSlide(i)}
                  aria-label={`Show slide ${i + 1}: ${slide.label}, ${slide.place}`}
                  aria-current={active ? "true" : undefined}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center text-xs font-semibold transition-all duration-300 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 ${
                    active
                      ? "bg-primary border-primary text-primary-foreground scale-110"
                      : "bg-black/25 backdrop-blur-sm border-white/40 text-white/70 hover:border-white hover:text-white hover:bg-white/15"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}

            {/* Auto-advancing content needs a stop mechanism (WCAG 2.2.2). */}
            <button
              type="button"
              onClick={() => setHeroPaused((p) => !p)}
              aria-label={
                heroPaused ? "Resume background slideshow" : "Pause background slideshow"
              }
              className="w-9 h-9 rounded-full border border-white/25 bg-black/25 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white hover:border-white/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
            >
              {heroPaused ? (
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Caption tying the active number to what's on screen. */}
          <div className="absolute right-8 bottom-[6.5rem] z-20 hidden lg:block text-right pointer-events-none">
            <p className="text-white/50 text-[11px] font-medium uppercase tracking-[0.25em]">
              {String(heroSlide + 1).padStart(2, "0")} /{" "}
              {String(heroSlides.length).padStart(2, "0")}
            </p>
            <p className="font-display text-white text-xl italic leading-tight mt-0.5">
              {heroSlides[heroSlide].label}
            </p>
            <p className="text-white/60 text-xs mt-0.5">
              {heroSlides[heroSlide].place}
            </p>
          </div>

          {/* Bottom padding reserves room for the slide controls and the stats
              bar, both of which are absolutely positioned over this. */}
          <div className="relative z-10 text-center px-6 max-w-5xl pt-24 pb-56 md:pb-40">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 text-xs font-medium mb-6">
              <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
              Voice-first · Verified plans · Runs on your device
            </div>

            <p className="text-white/70 uppercase tracking-[0.3em] text-xs sm:text-sm font-medium mb-4">
              Let us plan your perfect
            </p>
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-extrabold text-white leading-[0.92] tracking-tight">
              Group
              <br />
              <span className="font-display italic font-normal text-primary">
                Travel
              </span>
            </h1>

            <p className="text-white/75 text-base sm:text-lg mt-6 max-w-2xl mx-auto leading-relaxed">
              Speak your trip in one sentence. The AI drafts it, code checks it's
              actually possible, and the plan is scored so the least happy person
              in your group still has a good time.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <Link
                to="/auth?mode=signup"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity text-sm"
              >
                Start Planning Free <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold hover:bg-white/20 transition-colors text-sm"
              >
                See How It Works
              </a>
            </div>

            <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
              {[
                { icon: Mic, label: "Voice", sub: "No forms" },
                { icon: ShieldCheck, label: "Verified", sub: "Checked in code" },
                { icon: Scale, label: "Fair", sub: "Computed, not claimed" },
                { icon: Cpu, label: "Private", sub: "Runs on-device" },
              ].map(({ icon: Icon, label, sub }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 sm:px-5 py-2.5"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/80 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-white" aria-hidden="true" />
                  </div>
                  <div className="text-left">
                    <p className="font-display text-white text-sm font-semibold italic">
                      {label}
                    </p>
                    <p className="text-white/60 text-xs">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scroll cue. Desktop only — on smaller screens the slide controls
              and the two-row stats bar already occupy this space. */}
          <a
            href="#about"
            /* Suppressed on short desktop windows, where the hero copy and the
               stats bar already meet in the middle. */
            className="absolute z-20 left-1/2 -translate-x-1/2 bottom-[7rem] hidden lg:[@media(min-height:760px)]:flex flex-col items-center gap-1.5 text-white/50 hover:text-white transition-colors group"
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.25em]">
              Scroll
            </span>
            <span className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center group-hover:border-white/60 transition-colors">
              <ArrowDown
                className="w-3.5 h-3.5 animate-bounce motion-reduce:animate-none"
                aria-hidden="true"
              />
            </span>
          </a>

          {/* Stats bar */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/55 backdrop-blur-md border-t border-white/10">
            <dl className="max-w-5xl mx-auto px-6 py-4 grid grid-cols-3 md:grid-cols-6 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="text-center">
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <CountUp
                      to={s.value}
                      prefix={s.prefix}
                      suffix={s.suffix}
                      className="block text-white text-lg sm:text-xl font-bold tabular-nums"
                    />
                    <span className="block text-white/60 text-[10px] sm:text-xs mt-0.5 leading-tight">
                      {s.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ─── Trust marquee ─── */}
        <section
          aria-label="What this project commits to"
          className="border-y border-border bg-card py-4 overflow-hidden"
        >
          {/* Pauses on hover and on keyboard focus, so the moving content has a
              stop mechanism (WCAG 2.2.2) rather than only honouring reduced motion. */}
          <div className="flex w-max animate-scroll-x motion-reduce:animate-none hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <ul
                key={copy}
                aria-hidden={copy === 1}
                className="flex items-center gap-8 px-4 shrink-0"
              >
                {trustPoints.map((point) => (
                  <li
                    key={point}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground whitespace-nowrap"
                  >
                    <CheckCircle className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        {/* ─── About ─── */}
        <section id="about" className="scroll-mt-20 py-24 px-6 bg-background">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading title="Group travel, minus the group chat">
                Nine people, four opinions about breakfast and one shared budget.
                Atlas AI is built for that trip.
              </SectionHeading>
            </Reveal>

            <Reveal>
              <div className="grid grid-cols-4 gap-3 mb-12 max-w-2xl mx-auto">
                {[travelBeach, aboutTemple, aboutFriends, travelKayak].map((img, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden aspect-square">
                    <img
                      src={img}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 motion-reduce:transition-none"
                    />
                  </div>
                ))}
              </div>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <Reveal>
                <p className="text-muted-foreground leading-relaxed text-base mb-5">
                  You speak a sentence and get a day-by-day plan. Underneath, the
                  parts that matter are boring on purpose: the model proposes,
                  then{" "}
                  <strong className="text-foreground">
                    deterministic code verifies
                  </strong>{" "}
                  the plan is physically and financially possible, and a{" "}
                  <strong className="text-foreground">computed fairness score</strong>{" "}
                  picks the option where the least happy traveller is still happy.
                </p>
                <p className="text-muted-foreground leading-relaxed text-base mb-6">
                  Everything after that is about the trip actually happening —
                  live location between members, alerts before each activity,
                  replanning when the weather turns, expenses split in ₹, and a
                  saved copy that opens with no signal — with edits queued and
                  replayed once you reconnect. You can even run the AI on your
                  own GPU so nothing leaves your device.
                </p>
                <ul className="flex flex-wrap gap-2.5">
                  {[
                    "Voice-first",
                    "Verified plans",
                    "Computed fairness",
                    "On-device option",
                    "Live location",
                    "INR native",
                    "Offline-ready",
                  ].map((tag) => (
                    <li
                      key={tag}
                      className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={100}>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    {
                      icon: Cpu,
                      title: "Two AI engines",
                      desc: "Hosted Groq LLaMA 3.3 70B, or WebLLM on your own GPU with no key",
                      color: "text-violet-500",
                      bg: "bg-violet-500/5",
                    },
                    {
                      icon: ShieldCheck,
                      title: `${FEASIBILITY_CHECK_COUNT} plan checks`,
                      desc: "Budget, timing, travel feasibility and pace, verified client-side",
                      color: "text-sky-500",
                      bg: "bg-sky-500/5",
                    },
                    {
                      icon: Zap,
                      title: "Supabase Realtime",
                      desc: "Live location, chat, votes and expenses over presence channels",
                      color: "text-orange-500",
                      bg: "bg-orange-500/5",
                    },
                    {
                      icon: Lock,
                      title: "Row-Level Security",
                      desc: "Per-user and per-trip isolation on every table in the database",
                      color: "text-green-600",
                      bg: "bg-green-600/5",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className={`p-4 rounded-2xl border border-border ${item.bg}`}
                    >
                      <item.icon className={`w-6 h-6 ${item.color} mb-3`} aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-foreground mb-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ─── What's new ─── */}
        <section
          id="whats-new"
          className="scroll-mt-20 py-24 px-6 bg-gradient-to-b from-card to-background"
        >
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading
                eyebrow="Latest updates"
                eyebrowIcon={Sparkles}
                title="What shipped"
                accent="recently"
              >
                {updates.length} changes from the current release. Some of them
                replaced things that previously only looked like features.
              </SectionHeading>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {updates.map((update, i) => (
                <Reveal key={update.title} delay={(i % 3) * 80}>
                  <article className="relative h-full rounded-3xl border border-border bg-card overflow-hidden hover:shadow-elevated transition-shadow motion-reduce:transition-none">
                    <div
                      className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${update.bar}`}
                    />
                    <div className="p-7">
                      <div
                        className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-5 ${update.accent}`}
                      >
                        <update.icon className="w-6 h-6" aria-hidden="true" />
                      </div>

                      <div className="flex items-start gap-2 mb-3">
                        <h3 className="font-display text-xl font-bold text-foreground flex-1">
                          {update.title}
                        </h3>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyles[update.status]}`}
                        >
                          {update.status}
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                        {update.desc}
                      </p>

                      <ul className="space-y-2.5 mb-5">
                        {update.points.map((point) => (
                          <li key={point.text} className="flex items-start gap-2.5">
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${update.accent}`}
                            >
                              <point.icon className="w-3 h-3" aria-hidden="true" />
                            </div>
                            <span className="text-xs text-muted-foreground leading-relaxed">
                              {point.text}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <p className="text-[11px] font-semibold text-muted-foreground/80 pt-4 border-t border-border">
                        {update.footnote}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>

            <Reveal>
              <div className="mt-10 rounded-2xl bg-primary/5 border border-primary/20 px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    All {updates.length} are live right now
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Open a trip for{" "}
                    <span className="font-semibold text-orange-600">Live</span> and{" "}
                    <span className="font-semibold text-warning">Timeline</span> in
                    the itinerary header · pick your engine in{" "}
                    <span className="font-semibold text-violet-600">
                      Profile → AI engine
                    </span>
                  </p>
                </div>
                <Link
                  to="/auth?mode=signup"
                  className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Try It Free <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── AI engines ─── */}
        <section id="engines" className="scroll-mt-20 py-24 px-6 bg-card">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading
                eyebrow="AI engines"
                eyebrowIcon={Cpu}
                title="Hosted, or entirely"
                accent="on your device"
              >
                Every AI surface runs against one of two interchangeable
                backends. The switch lives in Profile and persists per browser.
              </SectionHeading>
            </Reveal>

            <Reveal>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Groq */}
                <div className="rounded-3xl border border-border bg-background p-7">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Zap className="w-6 h-6 text-primary" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold text-foreground">
                        Hosted — Groq
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Default · Highest quality
                      </p>
                    </div>
                  </div>
                  <dl className="space-y-0">
                    {engineComparison.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-4 py-2.5 border-b border-border last:border-0"
                      >
                        <dt className="text-xs text-muted-foreground shrink-0">
                          {row.label}
                        </dt>
                        <dd className="text-sm font-medium text-foreground text-right">
                          {row.groq}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* On-device */}
                <div className="rounded-3xl border border-violet-500/30 bg-violet-500/[0.04] p-7">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                      <Cpu className="w-6 h-6 text-violet-500" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold text-foreground">
                        On-Device — WebLLM
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        No key · Nothing leaves the machine
                      </p>
                    </div>
                  </div>
                  <dl className="space-y-0">
                    {engineComparison.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-4 py-2.5 border-b border-violet-500/15 last:border-0"
                      >
                        <dt className="text-xs text-muted-foreground shrink-0">
                          {row.label}
                        </dt>
                        <dd className="text-sm font-medium text-foreground text-right">
                          {row.local}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </Reveal>

            {/* Model list, straight from lib/aiProvider.ts */}
            <Reveal delay={80}>
              <div className="mt-8 rounded-3xl border border-border bg-background p-7">
                <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
                  <h3 className="font-display text-lg font-bold text-foreground">
                    On-device models
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Quantised q4f16_1 · 4096-token context · Downloaded only when
                    you ask
                  </p>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {WEBLLM_MODELS.map((model) => {
                    const isDefault = model.id === DEFAULT_WEBLLM_MODEL;
                    return (
                      <li
                        key={model.id}
                        className={`p-4 rounded-2xl border ${
                          isDefault
                            ? "border-violet-500/40 bg-violet-500/[0.06]"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-semibold text-foreground">
                            {model.label}
                          </span>
                          {isDefault && (
                            <span className="px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 text-[9px] font-bold border border-violet-500/20">
                              DEFAULT
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {model.downloadLabel} download ·{" "}
                          {(model.vramMB / 1024).toFixed(1)} GB GPU memory
                        </p>
                        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                          {model.note}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
                  On-device needs a WebGPU browser — Chrome or Edge 113+, Chrome
                  for Android 121+, Safari 26+ — and roughly as much free GPU
                  memory as the model. The app requests a real GPU adapter before
                  offering the option, because a browser can expose the API and
                  still refuse one. If that probe fails, it says why and stays on
                  hosted.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── How it works ─── */}
        <section id="how" className="scroll-mt-20 py-24 px-6 bg-background">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading title="How it works">
                One spoken sentence to a checked, scored itinerary.
              </SectionHeading>
            </Reveal>

            <Reveal>
              <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
                {howItWorks.map((step, i) => (
                  <li
                    key={step.step}
                    className="relative flex flex-col items-center text-center"
                  >
                    {i < howItWorks.length - 1 && (
                      <div
                        aria-hidden="true"
                        className="hidden lg:block absolute top-10 left-[60%] w-[80%] h-px bg-border"
                      />
                    )}
                    <div
                      className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center mb-4 ${step.color}`}
                    >
                      <step.icon className="w-8 h-8" aria-hidden="true" />
                    </div>
                    <span className="text-xs font-bold text-muted-foreground mb-2 tracking-widest">
                      STEP {step.step}
                    </span>
                    <h3 className="text-base font-semibold text-foreground mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.desc}
                    </p>
                  </li>
                ))}
              </ol>
            </Reveal>

            <Reveal>
              <div className="relative rounded-3xl overflow-hidden">
                <img
                  src={featureVoice}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-64 sm:h-56 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" />
                <div className="absolute inset-0 flex items-center px-6 sm:px-10">
                  <div className="max-w-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <Mic className="w-4 h-4 text-white" aria-hidden="true" />
                      </div>
                      <span className="text-white/70 text-sm font-medium">
                        Example voice command
                      </span>
                    </div>
                    <p className="font-display text-white text-lg sm:text-xl font-semibold italic">
                      "Plan a 5-day Goa trip for 4 friends, budget ₹40,000, we
                      love beaches and seafood."
                    </p>
                    <ul className="mt-4 flex gap-2 flex-wrap">
                      {["5 days", "4 friends", "₹40,000", "Goa", "Beaches", "Seafood"].map(
                        (tag) => (
                          <li
                            key={tag}
                            className="px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-medium"
                          >
                            ✓ {tag}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Pipeline ─── */}
        <section
          id="pipeline"
          className="scroll-mt-20 py-24 px-6 bg-gradient-to-b from-background via-card to-background"
        >
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading
                eyebrow="Inside one request"
                eyebrowIcon={Layers}
                title="Between your sentence and"
                accent="a saved plan"
              >
                Seven stages, and only three of them involve a language model.
                Every parameter below is the one in the source — pick a stage to
                see it.
              </SectionHeading>
            </Reveal>

            <Reveal>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
                {/* Stage rail */}
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="hidden lg:block absolute left-[2.1rem] top-6 bottom-6 w-px bg-border"
                  />
                  <ol className="relative space-y-1.5">
                    {pipelineStages.map((stage, i) => {
                      const active = i === activeStage;
                      const kind = stageKind[stage.id];
                      return (
                        <li key={stage.id}>
                          <button
                            type="button"
                            onClick={() => setActiveStage(i)}
                            aria-pressed={active}
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all motion-reduce:transition-none ${
                              active
                                ? "bg-card border-border shadow-card"
                                : "border-transparent hover:bg-card/70"
                            }`}
                          >
                            <span
                              className={`relative z-10 w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors motion-reduce:transition-none ${
                                active
                                  ? stage.accent
                                  : "bg-background border-border text-muted-foreground"
                              }`}
                            >
                              <stage.icon className="w-5 h-5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[10px] font-bold tracking-widest text-muted-foreground">
                                STAGE {stage.step}
                              </span>
                              <span
                                className={`block text-sm font-semibold truncate ${
                                  active ? "text-foreground" : "text-muted-foreground"
                                }`}
                              >
                                {stage.title}
                              </span>
                            </span>
                            {kind && (
                              <span
                                className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold border ${kind.chip}`}
                              >
                                {kind.label}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                {/* Stage detail */}
                <div className="rounded-3xl border border-border bg-card overflow-hidden">
                  <div
                    aria-hidden="true"
                    className={`h-1 bg-gradient-to-r ${currentStage.bar}`}
                  />
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start gap-4 mb-5">
                      <div
                        className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${currentStage.accent}`}
                      >
                        <currentStage.icon className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold tracking-widest text-muted-foreground">
                          STAGE {currentStage.step} · {currentStage.title.toUpperCase()}
                        </p>
                        <h3 className="font-display text-2xl sm:text-3xl font-bold text-foreground mt-1 leading-tight">
                          {currentStage.headline}
                        </h3>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                      {currentStage.detail}
                    </p>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentStage.meta.map((m) => (
                        <div
                          key={m.k}
                          className="p-3.5 rounded-2xl bg-background border border-border"
                        >
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                            {m.k}
                          </dt>
                          <dd className="text-sm font-semibold text-foreground">{m.v}</dd>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-6 pt-5 border-t border-border flex flex-wrap items-center gap-2.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Implemented in
                      </span>
                      <CodeChip>{currentStage.source}</CodeChip>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveStage((i) => Math.max(0, i - 1))}
                        disabled={activeStage === 0}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <ChevronRight className="w-3.5 h-3.5 rotate-180" aria-hidden="true" />
                        Previous
                      </button>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {activeStage + 1} / {pipelineStages.length}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveStage((i) => Math.min(pipelineStages.length - 1, i + 1))
                        }
                        disabled={activeStage === pipelineStages.length - 1}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:pointer-events-none"
                      >
                        Next stage
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Numbers */}
            <Reveal delay={80}>
              <dl className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
                {pipelineNumbers.map((n) => (
                  <div
                    key={n.label}
                    className="p-5 rounded-2xl bg-card border border-border text-center"
                  >
                    <n.icon
                      className="w-5 h-5 text-primary mx-auto mb-2.5"
                      aria-hidden="true"
                    />
                    <dd className="font-display text-3xl font-bold text-foreground tabular-nums">
                      {n.value}
                    </dd>
                    <dt className="text-[11px] text-muted-foreground mt-1 leading-tight">
                      {n.label}
                    </dt>
                  </div>
                ))}
              </dl>
            </Reveal>

            {/* Required output shape */}
            <Reveal delay={120}>
              <div className="mt-8 rounded-3xl border border-border bg-card p-6 sm:p-8">
                <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
                  <h3 className="font-display text-xl font-bold text-foreground">
                    What every activity has to carry
                  </h3>
                  <CodeChip>response_format: json_object</CodeChip>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-3xl">
                  The prompt pins this shape exactly, because the verifier and the
                  fairness scorer are ordinary code — they need coordinates to
                  measure a distance and a category to weigh an interest. A plan
                  missing these fields can't be checked, so it isn't accepted.
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {activityFields.map((f) => (
                    <li
                      key={f.field}
                      className="p-4 rounded-2xl bg-background border border-border"
                    >
                      <p className="font-mono text-xs text-primary mb-1.5 break-all">
                        {f.field}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {f.note}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Verification ─── */}
        <section id="verification" className="scroll-mt-20 py-24 px-6 bg-card">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading
                eyebrow="Plan verification"
                eyebrowIcon={ShieldCheck}
                title={`${FEASIBILITY_CHECK_COUNT} ways a plan gets caught`}
                accent="before you see it"
              >
                A language model will return an itinerary that parses perfectly
                and is still impossible. These checks are pure functions — no
                model, no network — so they give the same answer every time and
                run offline in milliseconds.
              </SectionHeading>
            </Reveal>

            {/* Severity legend */}
            <Reveal>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                {(["error", "conditional", "warning"] as CheckSeverity[]).map((sev) => (
                  <div
                    key={sev}
                    className="p-5 rounded-2xl bg-background border border-border"
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <span
                        aria-hidden="true"
                        className={`w-2.5 h-2.5 rounded-full ${severityMeta[sev].dot}`}
                      />
                      <p className="text-sm font-bold text-foreground">
                        {severityMeta[sev].label}
                      </p>
                      <span className="ml-auto text-xs font-semibold text-muted-foreground tabular-nums">
                        {checkCounts.get(sev) ?? 0}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {severityMeta[sev].blurb}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Filter */}
            <Reveal>
              <div
                role="group"
                aria-label="Filter checks by severity"
                className="flex flex-wrap gap-2 justify-center mb-8"
              >
                {severityFilters.map((sev) => {
                  const selected = checkSeverity === sev;
                  return (
                    <button
                      key={sev}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setCheckSeverity(sev)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all motion-reduce:transition-none ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {sev === "All" ? "All checks" : severityMeta[sev].label}
                      <span
                        className={`ml-1.5 ${selected ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}
                      >
                        {checkCounts.get(sev) ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Reveal>

            {/* Checks */}
            <Reveal>
              <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredChecks.map((check) => (
                  <li
                    key={check.code}
                    className="p-5 rounded-2xl bg-background border border-border hover:border-primary/30 transition-colors motion-reduce:transition-none"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${severityMeta[check.severity].chip}`}
                      >
                        <check.icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11px] text-muted-foreground break-all">
                          {check.code}
                        </p>
                        <p className="text-sm font-semibold text-foreground mt-0.5 leading-snug">
                          {check.what}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                      {check.detail}
                    </p>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${severityMeta[check.severity].chip}`}
                    >
                      {severityMeta[check.severity].label}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>

            {/* Constants + repair loop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
              <Reveal>
                <div className="h-full rounded-3xl border border-border bg-background p-6 sm:p-7">
                  <h3 className="font-display text-xl font-bold text-foreground mb-1.5">
                    The numbers it judges by
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                    Published rather than buried, because a check is only
                    trustworthy if you can disagree with its thresholds.
                  </p>
                  <dl className="space-y-0">
                    {verifierConstants.map((c) => (
                      <div
                        key={c.label}
                        className="py-3 border-b border-border last:border-0"
                      >
                        <div className="flex items-baseline justify-between gap-4">
                          <dt className="text-sm text-foreground font-medium">{c.label}</dt>
                          <dd className="text-sm font-bold text-primary shrink-0 tabular-nums">
                            {c.value}
                          </dd>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{c.note}</p>
                      </div>
                    ))}
                  </dl>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <div className="h-full rounded-3xl border border-border bg-background p-6 sm:p-7">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <Wrench className="w-5 h-5 text-amber-500" aria-hidden="true" />
                    <h3 className="font-display text-xl font-bold text-foreground">
                      When a check fails
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                    One repair pass, not a loop that grinds until something
                    passes. Two model calls is the ceiling for any plan request.
                  </p>
                  <ol className="space-y-3.5">
                    {repairSteps.map((step, i) => (
                      <li key={step.title} className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-lg bg-warning/10 border border-warning/20 text-amber-600 text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {step.title}
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                            {step.desc}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-5 pt-4 border-t border-border text-[11px] text-muted-foreground leading-relaxed">
                    A plan is reported as ok only when it has zero errors.
                    Warnings travel with it and stay visible.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ─── Fairness ─── */}
        <section id="fairness" className="scroll-mt-20 py-24 px-6 bg-background">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading
                eyebrow="Group fairness"
                eyebrowIcon={Scale}
                title="A group score you can"
                accent="check by hand"
              >
                The old version of this was a number the prompt asked the model to
                emit — unfalsifiable by construction. It's now arithmetic over
                each traveller's own stated preferences, which means it can be
                wrong, and you can prove it.
              </SectionHeading>
            </Reveal>

            {/* Formula */}
            <Reveal>
              <div className="rounded-3xl border border-primary/20 bg-primary/[0.04] p-6 sm:p-8 mb-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <Calculator className="w-5 h-5 text-primary" aria-hidden="true" />
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    One traveller's utility
                  </h3>
                </div>
                <p className="font-mono text-sm sm:text-base text-foreground leading-relaxed break-words">
                  utility = <span className="text-primary font-bold">0.6</span> ·
                  interest + <span className="text-primary font-bold">0.2</span> ·
                  quality + <span className="text-primary font-bold">0.2</span> ·
                  affordability
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-4 max-w-3xl">
                  Clamped to 0–1. A plan with no activities scores zero rather
                  than dividing by nothing. Every input comes from that person's
                  profile and the plan itself, so two members looking at the same
                  itinerary get genuinely different numbers.
                </p>
              </div>
            </Reveal>

            <Reveal>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                {utilityComponents.map((c) => (
                  <div
                    key={c.key}
                    className="p-6 rounded-2xl bg-card border border-border"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}
                      >
                        <c.icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-lg font-bold text-primary">
                        ×{c.weight}
                      </span>
                    </div>
                    <h4 className="text-base font-semibold text-foreground mb-2">
                      {c.title}
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{c.desc}</p>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Worked example */}
            <Reveal>
              <div className="rounded-3xl border border-border bg-card overflow-hidden">
                <div className="px-6 sm:px-8 pt-7 pb-5 border-b border-border">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h3 className="font-display text-2xl font-bold text-foreground">
                      Worked example
                    </h3>
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      Two travellers · three candidate plans
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2 max-w-3xl">
                    Asha loves food and temples on a tighter ceiling. Ben wants
                    markets and has more room. Neither gets to be the default.
                  </p>
                  <ul className="flex flex-wrap gap-2.5 mt-4">
                    {fairnessMembers.map((m) => (
                      <li
                        key={m.id}
                        className={`px-3.5 py-2 rounded-2xl border text-xs ${m.tint}`}
                      >
                        <span className="font-bold">{m.name}</span>
                        <span className="opacity-80"> · {m.prefs} · ceiling {m.ceiling}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Plan picker */}
                <div
                  role="group"
                  aria-label="Choose a candidate plan"
                  className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border"
                >
                  {fairness.scored.map((plan) => {
                    const selected = plan.id === currentFairnessPlan?.id;
                    const recommended = plan.id === fairness.recommendedId;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setActivePlan(plan.id)}
                        className={`text-left p-5 transition-colors motion-reduce:transition-none ${
                          selected ? "bg-primary/[0.06]" : "bg-card hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`text-sm font-bold ${selected ? "text-primary" : "text-foreground"}`}
                          >
                            {plan.variant}
                          </span>
                          {recommended && (
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-bold border border-emerald-500/20">
                              BEST FIT
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {plan.cost} · {plan.mix}
                        </p>
                        <div className="flex items-baseline gap-1.5 mt-3">
                          <span className="font-display text-2xl font-bold text-foreground tabular-nums">
                            {Math.round(plan.groupRegret * 100)}%
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            worst-case gap
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Breakdown */}
                {currentFairnessPlan && (
                  <div className="p-6 sm:p-8">
                    <div className="space-y-5">
                      {currentFairnessPlan.members.map((m) => {
                        const components = currentFairnessPlan.components[m.id];
                        return (
                          <div key={m.id}>
                            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                              <p className="text-sm font-bold text-foreground">
                                {m.name}
                              </p>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                utility{" "}
                                <span className="font-bold text-foreground">
                                  {m.utility.toFixed(2)}
                                </span>{" "}
                                · best available {m.best.toFixed(2)} · regret{" "}
                                <span
                                  className={`font-bold ${m.regret > 0 ? "text-amber-600" : "text-emerald-600"}`}
                                >
                                  {m.regret.toFixed(2)}
                                </span>
                              </p>
                            </div>
                            <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
                              <div
                                className="h-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                                style={{ width: `${m.utility * 100}%` }}
                              />
                              <div
                                className="h-full bg-warning/60 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                                style={{ width: `${m.regret * 100}%` }}
                              />
                            </div>
                            {components && (
                              <p className="text-[11px] text-muted-foreground mt-1.5 font-mono">
                                0.6·{components.interest.toFixed(2)} + 0.2·
                                {components.quality.toFixed(2)} + 0.2·
                                {components.affordability.toFixed(2)} ={" "}
                                {m.utility.toFixed(2)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-7 pt-6 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                          Group score
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {currentFairnessPlan.groupRegret.toFixed(2)} — the worst
                          member's regret
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                          Average regret
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {currentFairnessPlan.averageRegret.toFixed(2)} —
                          reported, not used to pick
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                          Verdict
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {currentFairnessPlan.id === fairness.recommendedId
                            ? "Recommended — lowest worst-case gap"
                            : "Beaten by a plan with a smaller worst case"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/20 p-5 flex items-start gap-3">
                      <TrendingDown
                        className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Averaging would have picked{" "}
                        <span className="font-semibold text-foreground">Budget</span>{" "}
                        too here, but not always — an average happily buries one
                        person having a miserable trip under three people having a
                        great one. Minimising the worst case can't.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Reveal>

            {/* Honesty notes */}
            <Reveal delay={80}>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    icon: Info,
                    title: "Regret is relative to the options",
                    desc: "It measures the gap to the best plan on offer, so at least one candidate always has somebody at zero. It is not a claim about the best trip imaginable.",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Feasibility outranks fairness",
                    desc: "The recommendation is made among plans that passed verification. A perfectly fair impossible itinerary still loses to a possible one.",
                  },
                  {
                    icon: AlertTriangle,
                    title: "No preferences, no score",
                    desc: "If nobody in the trip has stated any, the app says fairness is unscored instead of printing a confident zero. Pace fit is computed but deliberately left out of the utility.",
                  },
                ].map((n) => (
                  <div
                    key={n.title}
                    className="p-5 rounded-2xl bg-card border border-border"
                  >
                    <n.icon className="w-5 h-5 text-muted-foreground mb-3" aria-hidden="true" />
                    <p className="text-sm font-semibold text-foreground mb-1.5">
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{n.desc}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Reasons ─── */}
        <section className="py-24 px-6 bg-card">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading title="Five reasons this isn't another itinerary generator">
                Each one maps to a module you can open and read.
              </SectionHeading>
            </Reveal>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
              <div className="rounded-3xl overflow-hidden aspect-[4/5] relative lg:sticky lg:top-24 order-last lg:order-first">
                <img
                  key={currentReason.id}
                  src={currentReason.image}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover animate-fade-in motion-reduce:animate-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="flex items-center gap-2 mb-2">
                    <currentReason.icon className="w-5 h-5 text-white" aria-hidden="true" />
                    <span className="text-white/70 text-xs font-medium uppercase tracking-widest">
                      {currentReason.label}
                    </span>
                  </div>
                  <h3 className="font-display text-white text-lg font-bold">
                    {currentReason.title}
                  </h3>
                </div>
              </div>

              <ul className="space-y-2">
                {reasons.map((reason, i) => {
                  const open = activeReason === i;
                  return (
                    <li
                      key={reason.id}
                      className={`rounded-2xl transition-all motion-reduce:transition-none ${
                        open
                          ? "bg-background border border-border shadow-lg"
                          : "border border-transparent hover:bg-background/60"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveReason(i)}
                        aria-expanded={open}
                        aria-controls={`reason-${reason.id}`}
                        className="w-full text-left p-5"
                      >
                        <span className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                          Reason {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="flex items-center gap-3">
                          <reason.icon
                            className={`w-5 h-5 shrink-0 ${
                              open ? "text-primary" : "text-muted-foreground"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="text-lg font-semibold text-foreground">
                            {reason.title}
                          </span>
                        </span>
                      </button>
                      <p
                        id={`reason-${reason.id}`}
                        hidden={!open}
                        className="text-sm text-muted-foreground leading-relaxed pr-5 pb-5 pl-[3.25rem]"
                      >
                        {reason.description}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* ─── Quote ─── */}
        <section className="relative py-32 px-6 overflow-hidden">
          <img
            src={travelSummit}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/60" />
          <blockquote className="relative z-10 max-w-3xl mx-auto text-center">
            <Quote className="w-10 h-10 text-primary mx-auto mb-6" aria-hidden="true" />
            <p className="font-display text-3xl md:text-4xl text-white font-bold leading-snug">
              Sometimes you will never know the value of a moment until it
              becomes a memory.
            </p>
            <footer className="text-white/60 mt-6 text-sm">— Dr. Seuss</footer>
          </blockquote>
        </section>

        {/* ─── Features ─── */}
        <section id="features" className="scroll-mt-20 py-24 px-6 bg-background">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading title={`${allFeatures.length} features, and`} accent="no filler">
                Across AI, group fairness, real-time coordination, privacy, maps,
                money, safety and accessibility.
              </SectionHeading>
            </Reveal>

            {/* Filter — options come from the feature data itself */}
            <Reveal>
              {/* Toggle-button group rather than a tablist: `role="tablist"`
                  would promise arrow-key navigation between the chips, which
                  this control doesn't implement. */}
              <div
                role="group"
                aria-label="Filter features by category"
                className="flex flex-wrap gap-2 justify-center mb-10"
              >
                {featureTags.map((tag) => {
                  const selected = activeFeatureTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setActiveFeatureTag(tag)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all motion-reduce:transition-none ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {tag}
                      <span
                        className={`ml-1.5 ${selected ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}
                      >
                        {featureCounts.get(tag) ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Reveal>

            <Reveal>
              {filteredFeatures.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-12">
                  Nothing in this category yet.
                </p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredFeatures.map((feat) => (
                    <li
                      key={feat.title}
                      className="p-5 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-200 motion-reduce:transition-none"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${feat.color}`}
                      >
                        <feat.icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">
                        {feat.title}
                      </h3>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border mb-2 ${
                          categoryColors[feat.tag] ??
                          "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {feat.tag}
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {feat.desc}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Reveal>

            <div className="mt-10 text-center">
              <Link
                to="/auth?mode=signup"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity text-sm"
              >
                Start Planning Free <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* ─── Offline ─── */}
        <section
          id="offline"
          className="scroll-mt-20 py-24 px-6 bg-gradient-to-b from-background via-card to-background"
        >
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading
                eyebrow="Offline behaviour"
                eyebrowIcon={WifiOff}
                title="Signal is worst exactly when"
                accent="you're travelling"
              >
                So here's the honest breakdown — what keeps working, what serves
                you something slightly old, and what genuinely needs a connection
                and tells you so.
              </SectionHeading>
            </Reveal>

            <Reveal>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {offlineMatrix.map((column) => (
                  <div
                    key={column.level}
                    className={`rounded-3xl border p-6 ${column.chip}`}
                  >
                    <div className="flex items-start gap-3 mb-1">
                      <column.icon
                        className={`w-5 h-5 shrink-0 mt-0.5 ${
                          column.level === "full"
                            ? "text-emerald-600"
                            : column.level === "stale"
                              ? "text-amber-600"
                              : "text-muted-foreground"
                        }`}
                        aria-hidden="true"
                      />
                      <div>
                        <h3 className="text-base font-bold text-foreground leading-tight">
                          {column.label}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {column.sub}
                        </p>
                      </div>
                    </div>
                    <ul className="mt-5 space-y-2.5">
                      {column.items.map((item) => (
                        <li key={item} className="flex items-start gap-2.5">
                          <CircleDot
                            className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-1"
                            aria-hidden="true"
                          />
                          <span className="text-xs text-muted-foreground leading-relaxed">
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Reveal>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
              <Reveal>
                <div className="h-full rounded-3xl border border-border bg-card p-6 sm:p-7">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <CloudUpload className="w-5 h-5 text-primary" aria-hidden="true" />
                    <h3 className="font-display text-xl font-bold text-foreground">
                      How queued edits behave
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                    Ticking activities off happens mid-trip, which is when signal
                    is worst. Those writes land in IndexedDB instead of failing,
                    then replay when you're back — under rules worth stating out
                    loud, because "syncs later" hides a lot of decisions.
                  </p>
                  <ul className="space-y-4">
                    {queueRules.map((rule) => (
                      <li key={rule.title} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <rule.icon className="w-4 h-4 text-primary" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {rule.title}
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                            {rule.desc}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 pt-4 border-t border-border text-[11px] text-muted-foreground leading-relaxed">
                    Pending writes are counted in the offline banner, so the queue
                    is never a black box. 31 tests cover it, 9 of them the
                    conflict path.
                  </p>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <div className="h-full rounded-3xl border border-border bg-card p-6 sm:p-7">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <MapIcon className="w-5 h-5 text-teal-500" aria-hidden="true" />
                    <h3 className="font-display text-xl font-bold text-foreground">
                      Maps that survive a dead zone
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                    Saving a trip for offline pre-fetches the OpenStreetMap tiles
                    around it across five zoom levels, into the same cache the map
                    reads from — which is the part that actually makes it render
                    with no connection.
                  </p>
                  <dl className="grid grid-cols-2 gap-3">
                    {[
                      { k: "Tiles per trip", v: "~173" },
                      { k: "Zoom levels", v: "10 → 14" },
                      { k: "Over the network", v: "~6–8 MB" },
                      { k: "Kept for", v: "30 days" },
                    ].map((s) => (
                      <div
                        key={s.k}
                        className="p-4 rounded-2xl bg-background border border-border"
                      >
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                          {s.k}
                        </dt>
                        <dd className="text-base font-bold text-foreground tabular-nums">
                          {s.v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-5 pt-4 border-t border-border text-[11px] text-muted-foreground leading-relaxed">
                    Twelve separate runtime caches sit behind this, each with its
                    own strategy — weather is network-first with a 6-second
                    timeout, imagery is cache-first for a month. Route lines
                    aren't cached yet; that one's on the roadmap below.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ─── Languages ─── */}
        <section id="languages" className="scroll-mt-20 py-24 px-6 bg-card">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading
                eyebrow={`${LANGUAGE_COUNT} languages`}
                eyebrowIcon={Languages}
                title="In the language your group"
                accent="actually argues in"
              >
                The whole interface, not a translated marketing page —{" "}
                {INDIAN_LANGUAGE_COUNT} Indian languages in their own scripts,
                right-to-left layout for {RTL_LANGUAGES.join(" and ")}, and voice
                input that follows your choice.
              </SectionHeading>
            </Reveal>

            <Reveal>
              <ul className="flex flex-wrap justify-center gap-2.5">
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const indian = INDIAN_LANGUAGE_CODES.has(lang.code);
                  return (
                    <li
                      key={lang.code}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm ${
                        indian
                          ? "bg-primary/5 border-primary/20"
                          : "bg-background border-border"
                      }`}
                    >
                      <span aria-hidden="true">{lang.flag}</span>
                      <span className="font-medium text-foreground">
                        {lang.nativeName}
                      </span>
                      {lang.nativeName !== lang.name && (
                        <span className="text-xs text-muted-foreground">
                          {lang.name}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ─── Tech stack ─── */}
        <section id="tech" className="scroll-mt-20 py-24 px-6 bg-background">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading title="Everything under the hood">
                No paid API anywhere in the stack. Only Supabase is required —
                every other integration degrades gracefully without its key.
              </SectionHeading>
            </Reveal>

            <Reveal>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {techCategories.map((cat) => {
                  const items = techStack.filter((t) => t.category === cat);
                  if (items.length === 0) return null;
                  return (
                    <div
                      key={cat}
                      className="p-5 rounded-2xl bg-card border border-border"
                    >
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border mb-4 ${
                          techCategoryColors[cat] ??
                          "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {cat}
                      </span>
                      <ul className="space-y-2">
                        {items.map((t) => (
                          <li
                            key={t.name}
                            className="flex items-start gap-2 text-sm text-muted-foreground"
                          >
                            <CheckCircle
                              className={`w-3.5 h-3.5 shrink-0 mt-1 ${t.color}`}
                              aria-hidden="true"
                            />
                            {t.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Reveal>

            {/* Verified state — and what the same pass couldn't check */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
              <Reveal>
                <div className="h-full rounded-3xl border border-border bg-card p-6 sm:p-7">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <FlaskConical className="w-5 h-5 text-emerald-500" aria-hidden="true" />
                    <h3 className="font-display text-xl font-bold text-foreground">
                      Checked, on the current commit
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                    Commands anyone with the repository can run and compare
                    against.
                  </p>
                  <dl className="space-y-0">
                    {verifiedState.map((v) => (
                      <div
                        key={v.label}
                        className="flex items-start gap-3 py-3 border-b border-border last:border-0"
                      >
                        <CheckCircle
                          className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-sm font-medium text-foreground">
                              {v.label}
                            </dt>
                            <dd className="text-sm font-bold text-emerald-600 shrink-0">
                              {v.value}
                            </dd>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {v.note}
                          </p>
                        </div>
                      </div>
                    ))}
                  </dl>
                  <ul className="mt-5 pt-4 border-t border-border flex flex-wrap gap-2">
                    {testBreakdown.map((t) => (
                      <li
                        key={t.name}
                        className="px-2.5 py-1 rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
                      >
                        {t.name} <span className="font-bold tabular-nums">{t.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <div className="h-full rounded-3xl border border-warning/25 bg-warning/[0.04] p-6 sm:p-7">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden="true" />
                    <h3 className="font-display text-xl font-bold text-foreground">
                      Not verified yet
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                    A page of green ticks with no caveats is a marketing claim,
                    not a test report. These are the gaps in the same pass.
                  </p>
                  <ul className="space-y-3">
                    {notVerified.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <Minus
                          className="w-4 h-4 text-amber-600/70 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span className="text-sm text-muted-foreground leading-relaxed">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 pt-4 border-t border-warning/20 text-[11px] text-muted-foreground leading-relaxed">
                    Tracked in the repository's own backlog rather than quietly
                    left off the page. When one of these gets measured, the number
                    goes in the column on the left.
                  </p>
                </div>
              </Reveal>
            </div>

            {/* Quickstart */}
            <Reveal delay={120}>
              <div className="mt-8 rounded-3xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  <div className="p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-border">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <Terminal className="w-5 h-5 text-primary" aria-hidden="true" />
                      <h3 className="font-display text-xl font-bold text-foreground">
                        Run your own copy
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                      MIT licensed, four commands, and two environment values
                      you'll get free from Supabase in about a minute.
                    </p>
                    <ol className="space-y-2.5">
                      {quickstart.map((step, i) => {
                        const copied = copiedCmd === step.cmd;
                        return (
                          <li key={step.cmd}>
                            <div className="flex items-center gap-2 rounded-2xl bg-background border border-border p-2.5">
                              <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                                {i + 1}
                              </span>
                              <code className="flex-1 min-w-0 font-mono text-[11px] sm:text-xs text-foreground overflow-x-auto whitespace-nowrap">
                                {step.cmd}
                              </code>
                              <button
                                type="button"
                                onClick={() => copyCommand(step.cmd)}
                                aria-label={
                                  copied ? "Command copied" : `Copy: ${step.cmd}`
                                }
                                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              >
                                {copied ? (
                                  <ClipboardCheck
                                    className="w-3.5 h-3.5 text-emerald-500"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                              </button>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 ml-11">
                              {step.note}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  <div className="p-6 sm:p-8 bg-background/40">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <KeyRound className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                      <h3 className="font-display text-xl font-bold text-foreground">
                        Every key it can read
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                      Two required, three optional, none of them paid. Leave an
                      optional one blank and that feature degrades with a notice
                      instead of breaking the app.
                    </p>
                    <ul className="space-y-2.5">
                      {requiredEnv.map((env) => (
                        <li
                          key={env.key}
                          className="p-3.5 rounded-2xl bg-card border border-border"
                        >
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <code className="font-mono text-[11px] text-primary break-all">
                              {env.key}
                            </code>
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                env.need === "Required"
                                  ? "bg-primary/10 text-primary border-primary/20"
                                  : "bg-muted text-muted-foreground border-border"
                              }`}
                            >
                              {env.need.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{env.desc}</p>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Server className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      Skip the Groq key entirely and use the on-device engine.
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Destinations ─── */}
        <section id="destinations" className="scroll-mt-20 py-24 px-6 bg-card">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading title="Journey of India">
                Start with the classics, then go anywhere OpenStreetMap knows —
                place discovery, routing and currency all follow you out of the
                country.
              </SectionHeading>
            </Reveal>

            <Reveal>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
                {destinations.map((dest) => (
                  <li key={dest.name} className="group">
                    <div className="rounded-2xl overflow-hidden aspect-[4/3] mb-4 relative">
                      <img
                        src={dest.image}
                        alt={dest.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 motion-reduce:transition-none"
                      />
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold">
                        {dest.tag}
                      </span>
                    </div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          {dest.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {dest.description}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-colors shrink-0 ml-3">
                        <ChevronRight
                          className="w-4 h-4 text-muted-foreground group-hover:text-primary-foreground transition-colors"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal>
              <div className="flex items-baseline justify-between gap-4 mb-5">
                <h3 className="font-display text-2xl font-bold text-foreground">
                  Beyond India
                </h3>
                <p className="text-sm text-muted-foreground text-right">
                  Multi-currency and country detection come along
                </p>
              </div>
              <ul className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {beyondIndia.map((place) => (
                  <li key={place.name} className="group">
                    <div className="rounded-2xl overflow-hidden aspect-square relative">
                      <img
                        src={place.image}
                        alt={place.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 motion-reduce:transition-none"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                      <p className="absolute bottom-2.5 left-3 right-3 text-white text-xs font-semibold">
                        {place.name}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ─── Trip types ─── */}
        <section className="py-20 px-6 bg-background">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
                <div>
                  <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground">
                    Trip styles
                  </h2>
                  <p className="text-muted-foreground mt-2">
                    Tell it what kind of trip and the scoring adjusts
                  </p>
                </div>
                <p className="text-sm text-muted-foreground sm:max-w-xs sm:text-right">
                  Category weights and pace feed straight into how each plan is
                  scored for your group
                </p>
              </div>
            </Reveal>

            <Reveal>
              <ul className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {tripTypes.map((type) => (
                  <li key={type.title} className="group">
                    <div className="rounded-2xl overflow-hidden aspect-[3/4] relative">
                      <img
                        src={type.image}
                        alt={type.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 motion-reduce:transition-none"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                      <div className="absolute bottom-4 left-4 right-4">
                        <p className="text-white font-semibold text-sm">
                          {type.title}
                        </p>
                        <p className="flex items-center gap-1 mt-1.5">
                          <Scale className="w-3 h-3 text-primary" aria-hidden="true" />
                          <span className="text-white/60 text-[10px]">
                            Scored for your group
                          </span>
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ─── How it's built ─── */}
        <section className="py-24 px-6 bg-card">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading
                eyebrow="How it's built"
                eyebrowIcon={ListChecks}
                title="Claims we're willing to be"
                accent="held to"
              >
                An earlier version of this page advertised technology that wasn't
                in the codebase. Rather than quietly editing it, the whole thing
                is documented in the repo — here's the standard the page is held
                to now.
              </SectionHeading>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {principles.map((item, i) => (
                <Reveal key={item.title} delay={(i % 3) * 80}>
                  <article className="h-full p-6 rounded-2xl bg-background border border-border">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${item.color}`}
                    >
                      <item.icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2">
                      {item.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.desc}
                    </p>
                  </article>
                </Reveal>
              ))}
            </div>

            <Reveal>
              <div className="mt-8 rounded-2xl border border-border bg-background px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  The audit that removed those claims, the prior-art research and
                  the honest capability matrix all live in the repository.
                </p>
                <a
                  href="https://github.com/HarshTambade/Radiator-Routes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <Github className="w-4 h-4" aria-hidden="true" />
                  Read the source
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Roadmap ─── */}
        <section id="roadmap" className="scroll-mt-20 py-24 px-6 bg-background">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <SectionHeading
                eyebrow="The other list"
                eyebrowIcon={GitBranch}
                title="What isn't here"
                accent="yet"
              >
                A roadmap that only lists wins is a feature list wearing a
                different hat. These are the limits and gaps the project tracks
                against itself.
              </SectionHeading>
            </Reveal>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {roadmap.map((group, gi) => (
                <Reveal key={group.group} delay={gi * 80}>
                  <div className="h-full rounded-3xl border border-border bg-card p-6">
                    <div className="flex items-center gap-2.5 mb-5">
                      <span
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center ${group.tint}`}
                      >
                        <group.icon className="w-4 h-4" aria-hidden="true" />
                      </span>
                      <h3 className="text-base font-bold text-foreground">
                        {group.group}
                      </h3>
                      <span className="ml-auto text-xs font-semibold text-muted-foreground tabular-nums">
                        {group.items.length}
                      </span>
                    </div>
                    <ul className="space-y-4">
                      {group.items.map((item) => (
                        <li key={item.title}>
                          <p className="text-sm font-semibold text-foreground mb-1">
                            {item.title}
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {item.desc}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal>
              <div className="mt-8 rounded-2xl border border-border bg-card px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Each of these is an open item in the repository's backlog, with
                  the reasoning attached. Nothing on this list is described
                  anywhere else on the page as though it were finished.
                </p>
                <a
                  href="https://github.com/HarshTambade/Radiator-Routes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <GitBranch className="w-4 h-4" aria-hidden="true" />
                  See the backlog
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section id="faq" className="scroll-mt-20 py-24 px-6 bg-card">
          <div className="max-w-4xl mx-auto">
            <Reveal>
              <SectionHeading
                eyebrow="Questions"
                eyebrowIcon={HelpCircle}
                title="The things people actually"
                accent="ask first"
              >
                Including the ones with awkward answers.
              </SectionHeading>
            </Reveal>

            <Reveal>
              <ul className="space-y-3">
                {faqs.map((faq, i) => {
                  const open = openFaq === i;
                  return (
                    <li
                      key={faq.q}
                      className={`rounded-2xl border transition-colors motion-reduce:transition-none ${
                        open
                          ? "border-primary/30 bg-background shadow-card"
                          : "border-border bg-background/60 hover:border-primary/20"
                      }`}
                    >
                      <h3>
                        <button
                          type="button"
                          onClick={() => setOpenFaq(open ? null : i)}
                          aria-expanded={open}
                          aria-controls={`faq-panel-${i}`}
                          className="w-full flex items-start gap-4 text-left p-5"
                        >
                          <span className="flex-1 text-base font-semibold text-foreground leading-snug">
                            {faq.q}
                          </span>
                          <span
                            className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-colors motion-reduce:transition-none ${
                              open
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            {open ? (
                              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </span>
                        </button>
                      </h3>
                      <div id={`faq-panel-${i}`} hidden={!open}>
                        <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
                          {faq.a}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Reveal>

            <Reveal>
              <div className="mt-8 rounded-2xl bg-primary/5 border border-primary/20 px-6 py-5 text-center">
                <p className="text-sm font-semibold text-foreground">
                  Something not answered here?
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  The source is the documentation of record — including the audit
                  of what this page used to claim.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    to="/auth?mode=signup"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    Start Planning Free <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                  <a
                    href="https://github.com/HarshTambade/Radiator-Routes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border bg-background text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    <Github className="w-4 h-4" aria-hidden="true" />
                    Read the source
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="relative py-32 px-6 overflow-hidden">
          <img
            src={destinationKerala}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/55" />
          <div className="relative z-10 max-w-3xl mx-auto text-center">
            <h2 className="font-display text-5xl md:text-6xl font-bold text-white mb-4">
              Atlas AI
            </h2>
            <p className="text-white/75 mb-4 max-w-lg mx-auto text-lg">
              Speak the trip. Let code check it. Travel with the plan your whole
              group can live with.
            </p>
            <p className="text-white/50 mb-8 text-sm">
              Free to use · No paid API keys · ₹ INR native · Works offline once
              saved
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/auth?mode=signup"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                Start Planning Free
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/30 text-white font-semibold hover:bg-white/20 transition-colors"
              >
                Log In
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer className="bg-foreground text-background py-14 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-8 mb-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <MapPin className="w-4 h-4 text-primary-foreground" aria-hidden="true" />
              </div>
              <span className="font-display text-lg font-bold">
                Atlas AI
              </span>
            </div>
            <p className="text-sm text-background/60 mb-4 max-w-xs leading-relaxed">
              Voice-first group travel planning for India. Plans verified in
              code, scored for the whole group, and able to run entirely on your
              own device.
            </p>
            <ul className="flex flex-wrap gap-2">
              {[
                "Voice-first",
                "Verified plans",
                "Computed fairness",
                "On-device AI",
                "₹ INR native",
              ].map((tag) => (
                <li
                  key={tag}
                  className="px-2.5 py-1 rounded-full bg-white/10 text-background/70 text-[10px] font-medium"
                >
                  {tag}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-semibold mb-4 text-sm">Product</h2>
            <ul className="space-y-2.5 text-sm text-background/60">
              <li>
                <a href="#whats-new" className="hover:text-background transition-colors">
                  What's New
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-background transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#how" className="hover:text-background transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#destinations" className="hover:text-background transition-colors">
                  Destinations
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-background transition-colors">
                  FAQ
                </a>
              </li>
              <li>
                <Link
                  to="/auth?mode=signup"
                  className="hover:text-background transition-colors"
                >
                  Get Started
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold mb-4 text-sm">How it works</h2>
            <ul className="space-y-2.5 text-sm text-background/60">
              <li>
                <a href="#pipeline" className="hover:text-background transition-colors">
                  The pipeline
                </a>
              </li>
              <li>
                <a href="#verification" className="hover:text-background transition-colors">
                  Plan verification
                </a>
              </li>
              <li>
                <a href="#fairness" className="hover:text-background transition-colors">
                  Fairness scoring
                </a>
              </li>
              <li>
                <a href="#engines" className="hover:text-background transition-colors">
                  AI engines
                </a>
              </li>
              <li>
                <a href="#offline" className="hover:text-background transition-colors">
                  Offline behaviour
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold mb-4 text-sm">Project</h2>
            <ul className="space-y-2.5 text-sm text-background/60">
              <li>
                <a href="#tech" className="hover:text-background transition-colors">
                  Tech stack
                </a>
              </li>
              <li>
                <a href="#languages" className="hover:text-background transition-colors">
                  {LANGUAGE_COUNT} languages
                </a>
              </li>
              <li>
                <a href="#roadmap" className="hover:text-background transition-colors">
                  What isn't built yet
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/HarshTambade/Radiator-Routes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-background transition-colors"
                >
                  Source on GitHub
                </a>
              </li>
              <li>
                <Link to="/auth" className="hover:text-background transition-colors">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-6xl mx-auto pt-6 border-t border-background/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-background/40">
            © {new Date().getFullYear()} Atlas AI. Made with care in
            India. Every feature on this page is in the codebase.
          </p>
          <Link
            to="/auth?mode=signup"
            className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Register Free
          </Link>
        </div>
      </footer>
    </div>
  );
}
