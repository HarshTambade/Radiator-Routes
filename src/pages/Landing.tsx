import { Link } from "react-router-dom";
import {
  Accessibility,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Brain,
  Camera,
  Car,
  CheckCircle,
  ChevronRight,
  Clock,
  CloudSun,
  CloudUpload,
  Compass,
  Cpu,
  CreditCard,
  Eye,
  FileDown,
  Github,
  Globe,
  HeartHandshake,
  IndianRupee,
  Languages,
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
  Navigation,
  Pause,
  Plane,
  Play,
  Quote,
  Radio,
  RefreshCw,
  Route,
  Scale,
  ScanLine,
  Share2,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  Users,
  Volume2,
  Wallet,
  WifiOff,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { WEBLLM_MODELS, DEFAULT_WEBLLM_MODEL } from "@/lib/aiProvider";
import { SUPPORTED_LANGUAGES } from "@/services/translate";

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
import bangkok from "@/assets/bangkok.jpg";
import tokyo from "@/assets/tokyo.jpg";
import hanoi from "@/assets/hanoi.jpg";
import kualaLumpur from "@/assets/kuala-lumpur.jpg";
import sapa from "@/assets/sapa.jpg";
import malacca from "@/assets/malacca.jpg";

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
  { href: "#engines", label: "AI Engines" },
  { href: "#how", label: "How It Works" },
  { href: "#features", label: "Features" },
  { href: "#tech", label: "Tech" },
];

const mobileOnlyLinks = [
  { href: "#languages", label: "Languages" },
  { href: "#destinations", label: "Destinations" },
];

/* ─── Hero stats — each one is checkable against the codebase ─── */

const stats = [
  { value: "2", label: "AI engines — hosted or on-device" },
  { value: String(LANGUAGE_COUNT), label: `Languages, ${INDIAN_LANGUAGE_COUNT} Indian` },
  { value: String(FEASIBILITY_CHECK_COUNT), label: "Feasibility checks per plan" },
  { value: "₹0", label: "In API costs, no paid keys" },
  { value: "5s", label: "Live location refresh" },
  { value: "0", label: "Forms to plan a trip" },
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
    footnote: "Wired into activity status and inline edits · 22 tests cover the queue",
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

/* ─── Destinations ─── */

const destinations = [
  {
    name: "Goa Beaches",
    desc: "Sun, sand and serenity on India's finest coastline",
    image: destinationGoa,
    tag: "Weekend Getaway",
  },
  {
    name: "Agra Heritage",
    desc: "Walk through centuries of Mughal grandeur",
    image: destinationAgra,
    tag: "Cultural Trip",
  },
  {
    name: "Kerala Backwaters",
    desc: "Cruise tranquil palm-fringed waterways",
    image: destinationKerala,
    tag: "Nature & Wellness",
  },
];

const beyondIndia = [
  { name: "Bangkok", image: bangkok },
  { name: "Tokyo", image: tokyo },
  { name: "Hanoi", image: hanoi },
  { name: "Kuala Lumpur", image: kualaLumpur },
  { name: "Sapa", image: sapa },
  { name: "Malacca", image: malacca },
];

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

/* ────────────────────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────────────────────── */

export default function Landing() {
  const [activeReason, setActiveReason] = useState(0);
  const [activeFeatureTag, setActiveFeatureTag] = useState("All");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

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

  const navLinkClass = (active: boolean) => {
    if (scrolled) {
      return active
        ? "text-primary"
        : "text-muted-foreground hover:text-foreground";
    }
    return active ? "text-white" : "text-white/70 hover:text-white";
  };

  return (
    <div className="min-h-screen bg-background">
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
              Radiator Routes
            </span>
          </a>

          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => {
              const active = activeSection === link.href.slice(1);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "location" : undefined}
                  className={`text-sm font-medium transition-colors ${navLinkClass(active)}`}
                >
                  {link.label}
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
            className="lg:hidden bg-background border-t border-border shadow-elevated"
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
                  i === heroSlide ? "opacity-100" : "opacity-0"
                }`}
              />
            );
          })}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/80" />

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

          {/* Stats bar */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/55 backdrop-blur-md border-t border-white/10">
            <dl className="max-w-5xl mx-auto px-6 py-4 grid grid-cols-3 md:grid-cols-6 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="text-center">
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="block text-white text-lg sm:text-xl font-bold">
                      {s.value}
                    </span>
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
                Radiator Routes is built for that trip.
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
                          {dest.desc}
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
              Radiator Routes
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
                Radiator Routes
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
            <h2 className="font-semibold mb-4 text-sm">Technology</h2>
            <ul className="space-y-2.5 text-sm text-background/60">
              <li>
                <a href="#engines" className="hover:text-background transition-colors">
                  AI Engines
                </a>
              </li>
              <li>
                <a href="#tech" className="hover:text-background transition-colors">
                  Tech Stack
                </a>
              </li>
              <li>
                <a href="#languages" className="hover:text-background transition-colors">
                  {LANGUAGE_COUNT} Languages
                </a>
              </li>
              <li>Plan verification</li>
              <li>Offline-first PWA</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold mb-4 text-sm">Project</h2>
            <ul className="space-y-2.5 text-sm text-background/60">
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
                  Sign In
                </Link>
              </li>
              <li>MIT licensed</li>
              <li>No paid APIs</li>
            </ul>
          </div>
        </div>

        <div className="max-w-6xl mx-auto pt-6 border-t border-background/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-background/40">
            © {new Date().getFullYear()} Radiator Routes. Made with care in
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
