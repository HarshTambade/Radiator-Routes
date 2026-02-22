import { Link } from "react-router-dom";
import {
  MapPin,
  ArrowRight,
  Mic,
  Brain,
  Users,
  RefreshCw,
  Compass,
  Star,
  ChevronRight,
  Shield,
  Quote,
  Globe,
  Zap,
  Wallet,
  MessageSquare,
  Navigation,
  CloudSun,
  Car,
  Camera,
  CreditCard,
  Bell,
  Wifi,
  Map,
  Share2,
  Clock,
  TrendingUp,
  Smartphone,
  BarChart3,
  Route,
  HeartHandshake,
  Sparkles,
  Volume2,
  CheckCircle,
  Lock,
  Radio,
  CalendarClock,
  Timer,
  Locate,
} from "lucide-react";
import { useState } from "react";

// Image imports
import heroOcean from "@/assets/hero-ocean.jpg";
import aboutTemple from "@/assets/about-temple.jpg";
import aboutFriends from "@/assets/about-friends.jpg";
import featureVoice from "@/assets/feature-voice.jpg";
import travelBeach from "@/assets/travel-beach.jpg";
import travelHiker from "@/assets/travel-hiker.jpg";
import travelBoat from "@/assets/travel-boat.jpg";
import travelKayak from "@/assets/travel-kayak.jpg";
import travelSummit from "@/assets/travel-summit.jpg";
import destinationGoa from "@/assets/destination-goa.jpg";
import destinationAgra from "@/assets/destination-agra.jpg";
import destinationKerala from "@/assets/destination-kerala.jpg";

/* ─── Data ─── */

const stats = [
  { value: "200+", label: "Indian Destinations" },
  { value: "24/7", label: "AI Planning Engine" },
  { value: "100%", label: "Voice-First UX" },
  { value: "0 Forms", label: "Required to Plan" },
  { value: "Live", label: "Location Sharing" },
  { value: "Smart", label: "Timeline Alerts" },
];

const reasons = [
  {
    id: "voice",
    label: "Voice-First",
    title: "Voice-First Planning",
    description:
      "Just speak your travel dreams — our multimodal NLU pipeline powered by Whisper + GPT extracts destinations, dates, budget, group size, and interests from natural speech. No forms, no friction.",
    icon: Mic,
  },
  {
    id: "ai",
    label: "AI Itineraries",
    title: "Regret-Aware AI Itineraries",
    description:
      "Our counterfactual planning engine generates multiple optimized itinerary variants and uses regret minimization to pick the one where no traveler misses out on their must-have experiences.",
    icon: Brain,
  },
  {
    id: "group",
    label: "Group Travel",
    title: "Multi-Agent Group Negotiation",
    description:
      "Each group member gets a personal AI proxy that advocates for their preferences. These agents negotiate autonomously using Nash equilibrium-inspired consensus to build the perfect group itinerary.",
    icon: Users,
  },
  {
    id: "replan",
    label: "Dynamic Replan",
    title: "Real-Time Dynamic Replanning",
    description:
      "Flight delayed? Weather changed? Our event-driven system detects disruptions via Amadeus & OpenWeatherMap APIs, then instantly replans your itinerary with minimal regret — all via WebSocket push.",
    icon: RefreshCw,
  },
  {
    id: "discover",
    label: "Smart Discovery",
    title: "Intelligent Place Discovery",
    description:
      "Explore curated attractions, restaurants, and hidden gems powered by OpenTripMap & TomTom. Our semantic search uses pgvector embeddings to match places with your unique travel personality.",
    icon: Compass,
  },
];

const allFeatures = [
  {
    icon: Radio,
    title: "Live Location Sharing",
    desc: "Trip members share real-time GPS location with each other — just like WhatsApp. Split up and regroup effortlessly with one-tap navigation to any member.",
    color: "text-emerald-500 bg-emerald-500/10",
    tag: "Collaboration",
  },
  {
    icon: CalendarClock,
    title: "Smart Timeline Notifications",
    desc: "Get push alerts 15 min and 5 min before each activity. Running late? Delay your entire upcoming schedule with one tap — +10m, +15m, +30m, and more.",
    color: "text-warning bg-warning/10",
    tag: "Real-Time",
  },
  {
    icon: Mic,
    title: "Voice-First Planning",
    desc: "Speak naturally to plan your trip. Groq Whisper STT extracts all trip details from voice — works on every browser, no Chrome required.",
    color: "text-primary bg-primary/10",
    tag: "AI Core",
  },
  {
    icon: Brain,
    title: "Regret-Minimized Itineraries",
    desc: "Counterfactual AI engine generates multiple plan variants, then picks the one with the least regret.",
    color: "text-purple-500 bg-purple-500/10",
    tag: "AI Core",
  },
  {
    icon: Sparkles,
    title: "AI Reasoning Transparency",
    desc: '"Why This Plan" panel explains every AI decision — selection criteria, budget logic, insider tips.',
    color: "text-indigo-500 bg-indigo-500/10",
    tag: "AI Core",
  },
  {
    icon: Users,
    title: "Multi-Agent Group Negotiation",
    desc: "Every traveler gets an AI proxy. Agents negotiate autonomously via Nash equilibrium consensus.",
    color: "text-blue-500 bg-blue-500/10",
    tag: "Group AI",
  },
  {
    icon: RefreshCw,
    title: "Real-Time Dynamic Replanning",
    desc: "Disruptions detected via Amadeus & OpenWeatherMap. Instant replanning pushed over WebSockets.",
    color: "text-orange-500 bg-orange-500/10",
    tag: "Real-Time",
  },
  {
    icon: CloudSun,
    title: "Live Weather Forecasting",
    desc: "7-day Open-Meteo forecasts with severe weather alerts baked into your daily plan.",
    color: "text-sky-500 bg-sky-500/10",
    tag: "Live Data",
  },
  {
    icon: Car,
    title: "Live Traffic & Navigation",
    desc: "TomTom live traffic overlaid on your route. ORS routing with distance & ETA per activity.",
    color: "text-green-500 bg-green-500/10",
    tag: "Navigation",
  },
  {
    icon: Map,
    title: "2D & 3D Interactive Maps",
    desc: "Switch between 2D Leaflet maps and 3D Mapbox/Mappls globe views for your destination.",
    color: "text-teal-500 bg-teal-500/10",
    tag: "Maps",
  },
  {
    icon: MessageSquare,
    title: "Real-Time Trip Chat",
    desc: "Supabase Realtime-powered group chat. Coordinate, share updates, and collaborate live.",
    color: "text-pink-500 bg-pink-500/10",
    tag: "Collaboration",
  },
  {
    icon: Wallet,
    title: "Group Expense Splitting",
    desc: "Track shared expenses, split bills equally or custom, and settle up — all inside the app.",
    color: "text-emerald-500 bg-emerald-500/10",
    tag: "Finance",
  },
  {
    icon: CreditCard,
    title: "UPI P2P Payments",
    desc: "Send & receive payments via UPI deep-link. No third-party app needed for settling bills.",
    color: "text-yellow-600 bg-yellow-500/10",
    tag: "Finance",
  },
  {
    icon: Globe,
    title: "Multi-Currency Support",
    desc: "All budgets tracked in ₹ INR with smart conversion. No spreadsheet juggling needed.",
    color: "text-green-600 bg-green-600/10",
    tag: "Finance",
  },
  {
    icon: Navigation,
    title: "Turn-by-Turn Navigation",
    desc: "One-tap navigation to any activity via Google Maps, with real-time ORS route calculations.",
    color: "text-red-500 bg-red-500/10",
    tag: "Navigation",
  },
  {
    icon: Share2,
    title: "Trip Invite Links",
    desc: "Generate shareable invite codes. Friends join with one click — no sign-up friction.",
    color: "text-violet-500 bg-violet-500/10",
    tag: "Collaboration",
  },
  {
    icon: HeartHandshake,
    title: "Friends & Social Graph",
    desc: "Send friend requests, direct message travelers, and build your adventure crew.",
    color: "text-rose-500 bg-rose-500/10",
    tag: "Social",
  },
  {
    icon: Shield,
    title: "SOS & Emergency Panel",
    desc: "One-tap SOS with emergency contacts, nearest hospitals, and police numbers for your destination.",
    color: "text-red-600 bg-red-600/10",
    tag: "Safety",
  },
  {
    icon: Bell,
    title: "Safety Warnings",
    desc: "Auto-fetched travel advisories and safety warnings for every destination you plan.",
    color: "text-amber-500 bg-amber-500/10",
    tag: "Safety",
  },
  {
    icon: Wifi,
    title: "Offline Mode & PWA",
    desc: "Install as a PWA. Save trips offline with service workers — plan even without internet.",
    color: "text-slate-500 bg-slate-500/10",
    tag: "Offline",
  },
  {
    icon: BarChart3,
    title: "Regret Score Analytics",
    desc: "Each itinerary gets a regret score so you always pick the plan your group will love most.",
    color: "text-violet-500 bg-violet-500/10",
    tag: "Analytics",
  },
  {
    icon: Camera,
    title: "360° Street View",
    desc: "Preview any attraction with embedded street-level imagery before you visit.",
    color: "text-cyan-500 bg-cyan-500/10",
    tag: "Explore",
  },
  {
    icon: Compass,
    title: "Intelligent Place Discovery",
    desc: "pgvector semantic search matches hidden gems to your travel personality across 200+ destinations.",
    color: "text-lime-600 bg-lime-500/10",
    tag: "Explore",
  },
  {
    icon: TrendingUp,
    title: "AR Attraction Viewer",
    desc: "Point your camera at landmarks for AR overlays with history, ratings, and booking links.",
    color: "text-fuchsia-500 bg-fuchsia-500/10",
    tag: "AR/XR",
  },
  {
    icon: Clock,
    title: "Accessibility Planning",
    desc: "Filter activities by wheelchair access, hearing assistance, visual aids, and more.",
    color: "text-blue-600 bg-blue-600/10",
    tag: "Accessibility",
  },
  {
    icon: Route,
    title: "PDF Itinerary Export",
    desc: "Download a beautifully formatted PDF with your full day-by-day itinerary, costs, and maps.",
    color: "text-gray-500 bg-gray-500/10",
    tag: "Export",
  },
];

const techStack = [
  {
    name: "React 18 + TypeScript",
    category: "Frontend",
    color: "text-cyan-500",
  },
  { name: "Vite + Tailwind CSS", category: "Frontend", color: "text-cyan-500" },
  {
    name: "Supabase Postgres + Auth",
    category: "Backend",
    color: "text-green-500",
  },
  { name: "Supabase Realtime", category: "Backend", color: "text-green-500" },
  {
    name: "Row-Level Security (RLS)",
    category: "Backend",
    color: "text-green-500",
  },
  { name: "LangGraph Agent Workflows", category: "AI", color: "text-primary" },
  { name: "OpenAI GPT-4o", category: "AI", color: "text-primary" },
  { name: "Whisper STT", category: "AI", color: "text-primary" },
  { name: "pgvector Embeddings", category: "AI", color: "text-primary" },
  { name: "Open-Meteo Weather API", category: "Data", color: "text-sky-500" },
  { name: "TomTom Traffic API", category: "Data", color: "text-sky-500" },
  { name: "Amadeus Travel API", category: "Data", color: "text-sky-500" },
  { name: "OpenTripMap API", category: "Data", color: "text-sky-500" },
  { name: "Nominatim / OSM", category: "Maps", color: "text-orange-500" },
  { name: "Mapbox GL JS", category: "Maps", color: "text-orange-500" },
  { name: "Mappls Maps SDK", category: "Maps", color: "text-orange-500" },
  {
    name: "OpenRouteService (ORS)",
    category: "Routing",
    color: "text-red-500",
  },
  { name: "jsPDF + AutoTable", category: "Export", color: "text-gray-400" },
  { name: "TanStack Query", category: "Frontend", color: "text-cyan-500" },
  {
    name: "Vitest + Testing Library",
    category: "Testing",
    color: "text-yellow-500",
  },
];

const howItWorks = [
  {
    step: "01",
    icon: Volume2,
    title: "Speak Your Dream",
    desc: 'Say "Plan a 5-day Goa trip for 4 friends under ₹40,000" — our voice NLU captures every detail instantly.',
    color: "bg-primary/10 text-primary border-primary/20",
  },
  {
    step: "02",
    icon: Brain,
    title: "AI Negotiates & Plans",
    desc: "Multi-agent AI creates preference-weighted itineraries and runs regret minimization across all variants.",
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  },
  {
    step: "03",
    icon: Users,
    title: "Group Reviews & Tweaks",
    desc: "Each member votes on activities, chats in real-time, and collaboratively fine-tunes the itinerary.",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  {
    step: "04",
    icon: Zap,
    title: "Live-Updated on the Go",
    desc: "Disruptions auto-trigger replanning. Weather, traffic, SOS, and expenses are always live.",
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
];

const destinations = [
  {
    name: "Goa Beaches",
    desc: "Sun, sand & serenity on India's finest coastline",
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
    desc: "Cruise through tranquil palm-fringed waterways",
    image: destinationKerala,
    tag: "Nature & Wellness",
  },
];

const tripTypes = [
  { title: "Beach & Relaxation", image: travelBeach },
  { title: "Mountain Adventure", image: travelHiker },
  { title: "Cultural Heritage", image: travelBoat },
  { title: "Water Sports", image: travelKayak },
];

const testimonials = [
  {
    name: "Priya Sharma",
    location: "Mumbai",
    text: "Planned our entire Goa trip in 5 minutes with voice commands. The group negotiation feature is brilliant — everyone in our squad was happy!",
    rating: 5,
    tag: "Group Travel",
  },
  {
    name: "Rahul Mehta",
    location: "Delhi",
    text: "When our flight got delayed, Radiator Routes instantly replanned our Jaipur itinerary. Absolute lifesaver for group travel.",
    rating: 5,
    tag: "Dynamic Replan",
  },
  {
    name: "Ananya Reddy",
    location: "Bangalore",
    text: "The AI understood exactly what our family needed. Budget-friendly yet packed with amazing experiences. All in ₹ — no conversion hassle!",
    rating: 5,
    tag: "AI Planning",
  },
];

const categoryColors: Record<string, string> = {
  "AI Core": "bg-primary/10 text-primary border-primary/20",
  "Group AI": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "Real-Time": "bg-orange-500/10 text-orange-500 border-orange-500/20",
  "Live Data": "bg-sky-500/10 text-sky-500 border-sky-500/20",
  Navigation: "bg-green-500/10 text-green-500 border-green-500/20",
  Maps: "bg-teal-500/10 text-teal-500 border-teal-500/20",
  Collaboration: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  Finance: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  Social: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  Safety: "bg-red-500/10 text-red-500 border-red-500/20",
  Offline: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  Analytics: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  Explore: "bg-lime-500/10 text-lime-600 border-lime-500/20",
  "AR/XR": "bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20",
  Accessibility: "bg-blue-600/10 text-blue-600 border-blue-600/20",
  Export: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const techCategoryColors: Record<string, string> = {
  Frontend: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  Backend: "bg-green-500/10 text-green-600 border-green-500/20",
  AI: "bg-primary/10 text-primary border-primary/20",
  Data: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  Maps: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  Routing: "bg-red-500/10 text-red-600 border-red-500/20",
  Export: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  Testing: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
};

/* ─── Component ─── */

export default function Landing() {
  const [activeReason, setActiveReason] = useState(0);
  const [activeFeatureTag, setActiveFeatureTag] = useState<string>("All");

  const featureTags = [
    "All",
    "AI Core",
    "Group AI",
    "Real-Time",
    "Navigation",
    "Finance",
    "Collaboration",
    "Social",
    "Safety",
    "Explore",
    "Offline",
  ];

  const filteredFeatures =
    activeFeatureTag === "All"
      ? allFeatures
      : allFeatures.filter((f) => f.tag === activeFeatureTag);

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 w-full z-50 bg-black/30 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <MapPin className="w-4 h-4 text-primary-foreground" />
            </div>
            <span
              className="text-lg font-bold text-white tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Radiator Routes
            </span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a
              href="#about"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              About
            </a>
            <a
              href="#how"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              How It Works
            </a>
            <a
              href="#features"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Features
            </a>
            <a
              href="#tech"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Tech Stack
            </a>
            <a
              href="#destinations"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Destinations
            </a>
            <a
              href="#testimonials"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Reviews
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/auth?mode=signup"
              className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative min-h-[100vh] flex items-center justify-center overflow-hidden">
        <img
          src={heroOcean}
          alt="Aerial ocean view"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/75" />

        {/* Left numbered dots */}
        <div className="absolute left-8 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-6 z-10">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="w-8 h-8 rounded-full border border-white/40 flex items-center justify-center text-white/60 text-xs font-medium"
            >
              {n}
            </div>
          ))}
        </div>

        <div className="relative z-10 text-center px-6 max-w-5xl pt-16">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            AI-Powered · Voice-First · Regret-Minimized
          </div>

          <p className="text-white/70 uppercase tracking-[0.3em] text-sm font-medium mb-4">
            Let us plan your perfect
          </p>
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-extrabold text-white leading-[0.92] tracking-tight">
            Group
            <br />
            <span
              className="italic font-normal text-primary"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Travel
            </span>
          </h1>

          <p className="text-white/70 text-lg mt-6 max-w-2xl mx-auto leading-relaxed">
            The world's first voice-first, regret-aware AI travel planner built
            for Indian group trips. Speak your plans, let AI negotiate, and
            travel without regret.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/auth?mode=signup"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity text-sm"
            >
              Start Planning Free <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold hover:bg-white/20 transition-colors text-sm"
            >
              See How It Works
            </a>
          </div>

          {/* Feature pills */}
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            {[
              { icon: Mic, label: "Voice", sub: "Speak your plans" },
              { icon: Brain, label: "AI Plan", sub: "Regret-minimized" },
              { icon: Users, label: "Group AI", sub: "Multi-agent" },
              { icon: RefreshCw, label: "Live Replan", sub: "Auto-updates" },
            ].map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-5 py-2.5"
              >
                <div className="w-8 h-8 rounded-full bg-primary/80 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="text-left">
                  <p
                    className="text-white text-sm font-semibold italic"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {label}
                  </p>
                  <p className="text-white/60 text-xs">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Know More */}
        <div className="absolute bottom-20 left-8 z-10 hidden md:flex items-center gap-3">
          <span
            className="text-white font-semibold text-sm italic"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Know More
          </span>
          <a
            href="#about"
            className="w-10 h-10 rounded-full border border-white/40 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Stats bar */}
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/50 backdrop-blur-md border-t border-white/10">
          <div className="max-w-4xl mx-auto px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-white text-xl font-bold">{s.value}</p>
                <p className="text-white/60 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── About ─── */}
      <section id="about" className="py-24 px-6 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-4xl md:text-5xl font-bold text-foreground mb-4"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              About Radiator Routes
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Built for the modern Indian group traveler — powered by
              cutting-edge AI architecture
            </p>
          </div>

          {/* Image grid */}
          <div className="grid grid-cols-4 gap-3 mb-12 max-w-2xl mx-auto">
            {[travelBeach, aboutTemple, aboutFriends, travelKayak].map(
              (img, i) => (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden aspect-square"
                >
                  <img
                    src={img}
                    alt="Travel"
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  />
                </div>
              ),
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-muted-foreground leading-relaxed text-base mb-5">
                Radiator Routes is an AI-powered intelligent travel planning
                system designed specifically for group travel optimization. We
                combine voice-first interaction, regret-aware counterfactual
                planning, multi-agent AI orchestration, real-time dynamic
                replanning,{" "}
                <strong className="text-foreground">
                  live location sharing
                </strong>
                , and{" "}
                <strong className="text-foreground">
                  smart timeline notifications
                </strong>{" "}
                to deliver the perfect trip — every time.
              </p>
              <p className="text-muted-foreground leading-relaxed text-base mb-6">
                All budgets are tracked in ₹ INR, powered by Groq AI, Supabase
                real-time infrastructure, and a suite of live travel APIs.
                Whether you're planning a weekend getaway or a multi-week
                adventure, Radiator Routes eliminates the chaos of group travel
                planning — from the first voice command to the final group
                selfie.
              </p>
              <div className="flex flex-wrap gap-3">
                {[
                  "Voice-First",
                  "Regret-Aware",
                  "Group AI",
                  "Live Replanning",
                  "INR-Native",
                  "Live Location",
                  "Smart Alerts",
                ].map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  icon: Brain,
                  title: "LangGraph AI",
                  desc: "Multi-agent workflow orchestration for intelligent planning",
                  color: "text-primary",
                  bg: "bg-primary/5",
                },
                {
                  icon: Zap,
                  title: "Supabase Realtime",
                  desc: "Live location sharing & group chat over WebSocket presence channels",
                  color: "text-orange-500",
                  bg: "bg-orange-500/5",
                },
                {
                  icon: Lock,
                  title: "Row-Level Security",
                  desc: "Enterprise-grade data isolation per user and trip",
                  color: "text-green-500",
                  bg: "bg-green-500/5",
                },
                {
                  icon: Smartphone,
                  title: "PWA + Offline",
                  desc: "Install on any device, works without internet connection",
                  color: "text-blue-500",
                  bg: "bg-blue-500/5",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className={`p-4 rounded-2xl border border-border ${item.bg}`}
                >
                  <item.icon className={`w-6 h-6 ${item.color} mb-3`} />
                  <h4 className="text-sm font-semibold text-foreground mb-1">
                    {item.title}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── New Features Spotlight ─── */}
      <section className="py-20 px-6 bg-gradient-to-b from-card to-background">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-5">
              <Sparkles className="w-3.5 h-3.5" />
              Just Shipped — New Features
            </div>
            <h2
              className="text-4xl md:text-5xl font-bold text-foreground mb-4"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Travel Together,{" "}
              <span className="text-primary italic">Smarter</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Two powerful new features that keep your group in sync — whether
              you're on-schedule or running fashionably late.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Live Location Card */}
            <div className="relative rounded-3xl border border-border bg-card overflow-hidden group hover:shadow-elevated transition-shadow">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
              <div className="p-8">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-5">
                  <Radio className="w-7 h-7 text-emerald-500" />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <h3
                    className="text-2xl font-bold text-foreground"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    Live Location Sharing
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold border border-emerald-500/20">
                    LIVE
                  </span>
                </div>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Split up at a market, explore different trails, or wander a
                  city — then regroup effortlessly. Every trip member can share
                  their real-time GPS with the group, just like WhatsApp Live
                  Location. See distances, timestamps, and navigate to any
                  friend with one tap.
                </p>
                <div className="space-y-3">
                  {[
                    {
                      icon: Locate,
                      text: "Real-time GPS broadcast via Supabase Presence",
                    },
                    {
                      icon: Navigation,
                      text: "One-tap Google Maps navigation to any member",
                    },
                    {
                      icon: Users,
                      text: "See distance to each group member live",
                    },
                    {
                      icon: Lock,
                      text: "Visible only to your trip members — private & secure",
                    },
                  ].map((item) => (
                    <div key={item.text} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                        <item.icon className="w-3.5 h-3.5 text-emerald-500" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs text-emerald-600 font-semibold">
                    Updates every 5 seconds · Auto-clears on disconnect
                  </span>
                </div>
              </div>
            </div>

            {/* Timeline Notifications Card */}
            <div className="relative rounded-3xl border border-border bg-card overflow-hidden group hover:shadow-elevated transition-shadow">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
              <div className="p-8">
                <div className="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center mb-5">
                  <CalendarClock className="w-7 h-7 text-warning" />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <h3
                    className="text-2xl font-bold text-foreground"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    Smart Timeline Alerts
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-bold border border-warning/20">
                    NEW
                  </span>
                </div>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Never miss an activity again. Get push notifications 15 and 5
                  minutes before each item on your itinerary. Running late?
                  Delay your entire upcoming schedule with a single tap — no
                  manual rescheduling needed.
                </p>
                <div className="space-y-3">
                  {[
                    {
                      icon: Bell,
                      text: "Browser push alerts 15 min & 5 min before activities",
                    },
                    {
                      icon: Timer,
                      text: 'Running late? Tap "+15m" to shift all upcoming events',
                    },
                    {
                      icon: CheckCircle,
                      text: "Visual status: Upcoming · Starting Soon · Active · Late",
                    },
                    {
                      icon: RefreshCw,
                      text: "Reset to original schedule anytime with one tap",
                    },
                  ].map((item) => (
                    <div key={item.text} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-warning/10 flex items-center justify-center shrink-0 mt-0.5">
                        <item.icon className="w-3.5 h-3.5 text-warning" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                  <span className="text-xs text-warning font-semibold">
                    Delay options: +10m, +15m, +20m, +30m, +45m, +60m
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom CTA strip */}
          <div className="mt-10 rounded-2xl bg-primary/5 border border-primary/20 px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-foreground">
                🚀 Both features are live right now
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Open any trip → look for the{" "}
                <span className="font-semibold text-emerald-600">Live</span> and{" "}
                <span className="font-semibold text-warning">Timeline</span>{" "}
                buttons in the itinerary header
              </p>
            </div>
            <Link
              to="/auth?mode=signup"
              className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Try It Free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how" className="py-24 px-6 bg-card">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="text-4xl md:text-5xl font-bold text-foreground mb-4"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From voice to verified itinerary in under 60 seconds
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {howItWorks.map((step, i) => (
              <div
                key={step.step}
                className="relative flex flex-col items-center text-center"
              >
                {i < howItWorks.length - 1 && (
                  <div className="hidden lg:block absolute top-10 left-[60%] w-[80%] h-px bg-border" />
                )}
                <div
                  className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center mb-4 ${step.color}`}
                >
                  <step.icon className="w-8 h-8" />
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
              </div>
            ))}
          </div>

          {/* Example voice command banner */}
          <div className="relative rounded-3xl overflow-hidden">
            <img
              src={featureVoice}
              alt="Voice planning"
              className="w-full h-56 object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
            <div className="absolute inset-0 flex items-center px-10">
              <div className="max-w-lg">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Mic className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-white/70 text-sm font-medium">
                    Example Voice Command
                  </span>
                </div>
                <p
                  className="text-white text-xl font-semibold italic"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  "Plan a 5-day Goa trip for 4 friends, budget ₹40,000, we love
                  beaches and seafood."
                </p>
                <div className="mt-4 flex gap-2 flex-wrap">
                  {[
                    "5 days",
                    "4 friends",
                    "₹40,000",
                    "Goa",
                    "Beaches",
                    "Seafood",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-medium"
                    >
                      ✓ {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 5 Reasons ─── */}
      <section className="py-24 px-6 bg-background">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-4xl md:text-5xl font-bold text-foreground text-center mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            5 Reasons Why You
            <br />
            Should Use Radiator Routes
          </h2>
          <p className="text-muted-foreground text-center mb-14 max-w-xl mx-auto">
            Built with cutting-edge AI architecture from our SOP
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div className="rounded-3xl overflow-hidden aspect-[4/5] relative sticky top-24">
              <img
                src={
                  reasons[activeReason]?.id === "voice"
                    ? featureVoice
                    : travelSummit
                }
                alt="Feature illustration"
                className="w-full h-full object-cover transition-all duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <div className="flex items-center gap-2 mb-2">
                  {(() => {
                    const R = reasons[activeReason];
                    return R ? <R.icon className="w-5 h-5 text-white" /> : null;
                  })()}
                  <span className="text-white/70 text-xs font-medium uppercase tracking-widest">
                    {reasons[activeReason]?.label}
                  </span>
                </div>
                <h3
                  className="text-white text-lg font-bold"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {reasons[activeReason]?.title}
                </h3>
              </div>
            </div>

            <div className="space-y-2">
              {reasons.map((reason, i) => (
                <button
                  key={reason.id}
                  onClick={() => setActiveReason(i)}
                  className={`w-full text-left p-5 rounded-2xl transition-all ${
                    activeReason === i
                      ? "bg-card border border-border shadow-lg"
                      : "hover:bg-card/60 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Feature {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <reason.icon
                      className={`w-5 h-5 flex-shrink-0 ${activeReason === i ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <h3 className="text-lg font-semibold text-foreground">
                      {reason.title}
                    </h3>
                  </div>
                  {activeReason === i && (
                    <p className="text-sm text-muted-foreground mt-3 leading-relaxed pl-8">
                      {reason.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Quote ─── */}
      <section className="relative py-32 px-6 overflow-hidden">
        <img
          src={travelSummit}
          alt="Summit"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <Quote className="w-10 h-10 text-primary mx-auto mb-6" />
          <p
            className="text-3xl md:text-4xl text-white font-bold leading-snug"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Sometimes you will never know the value of a moment until it becomes
            a memory.
          </p>
          <p className="text-white/60 mt-6 text-sm">— Dr. Seuss</p>
        </div>
      </section>

      {/* ─── All Features Grid ─── */}
      <section id="features" className="py-24 px-6 bg-card">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-4xl md:text-5xl font-bold text-foreground mb-4"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Everything You Need
              <br />
              to Travel Smarter
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              24 powerful features across AI, navigation, finance, safety, and
              collaboration
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2 justify-center mb-10">
            {featureTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveFeatureTag(tag)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  activeFeatureTag === tag
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Features grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFeatures.map((feat) => (
              <div
                key={feat.title}
                className="group p-5 rounded-2xl bg-background border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-200"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${feat.color}`}
                >
                  <feat.icon className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-foreground flex-1">
                    {feat.title}
                  </h3>
                </div>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border mb-2 ${categoryColors[feat.tag] ?? "bg-muted text-muted-foreground border-border"}`}
                >
                  {feat.tag}
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {feat.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              to="/auth?mode=signup"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity text-sm"
            >
              Explore All Features <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Tech Stack ─── */}
      <section id="tech" className="py-24 px-6 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-4xl md:text-5xl font-bold text-foreground mb-4"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Built on World-Class
              <br />
              Technology
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A modern, production-grade stack powering every feature
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              "Frontend",
              "Backend",
              "AI",
              "Data",
              "Maps",
              "Routing",
              "Export",
              "Testing",
            ].map((cat) => {
              const items = techStack.filter((t) => t.category === cat);
              if (items.length === 0) return null;
              return (
                <div
                  key={cat}
                  className="p-5 rounded-2xl bg-card border border-border"
                >
                  <span
                    className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border mb-4 ${techCategoryColors[cat] ?? "bg-muted text-muted-foreground border-border"}`}
                  >
                    {cat}
                  </span>
                  <ul className="space-y-2">
                    {items.map((t) => (
                      <li
                        key={t.name}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle
                          className={`w-3.5 h-3.5 shrink-0 ${t.color}`}
                        />
                        {t.name}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Destinations ─── */}
      <section id="destinations" className="py-24 px-6 bg-card">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-4xl md:text-5xl font-bold text-foreground text-center mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Journey of
            <br />
            India
          </h2>
          <p className="text-muted-foreground text-center mb-14 max-w-xl mx-auto">
            200+ Indian destinations optimized with AI-powered itineraries
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
            {destinations.map((dest) => (
              <div key={dest.name} className="group cursor-pointer">
                <div className="rounded-2xl overflow-hidden aspect-[4/3] mb-4 relative">
                  <img
                    src={dest.image}
                    alt={dest.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold">
                      {dest.tag}
                    </span>
                  </div>
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
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary-foreground transition-colors" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Trip Types ─── */}
      <section className="py-20 px-6 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2
                className="text-4xl md:text-5xl font-bold text-foreground"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Trip Plan
              </h2>
              <p className="text-muted-foreground mt-2">
                Browse trip types and interests
              </p>
            </div>
            <p className="hidden md:block text-sm text-muted-foreground max-w-xs text-right">
              Our AI planner creates regret-minimized itineraries tailored for
              every travel style
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {tripTypes.map((type) => (
              <div key={type.title} className="group cursor-pointer">
                <div className="rounded-2xl overflow-hidden aspect-[3/4] relative">
                  <img
                    src={type.image}
                    alt={type.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <p className="text-white font-semibold text-sm">
                      {type.title}
                    </p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <Brain className="w-3 h-3 text-primary" />
                      <span className="text-white/60 text-[10px]">
                        AI-planned
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section id="testimonials" className="py-24 px-6 bg-card">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-4xl md:text-5xl font-bold text-foreground mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            What Our Travelers
            <br />
            Say About Us
          </h2>
          <p className="text-muted-foreground mb-12 max-w-xl">
            Real stories from real travelers who planned with Radiator Routes
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="p-6 rounded-2xl bg-background border border-border flex flex-col"
              >
                <div className="flex items-center justify-between mb-4">
                  <Quote className="w-6 h-6 text-primary" />
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${categoryColors[t.tag === "Dynamic Replan" ? "Real-Time" : t.tag === "Group Travel" ? "Group AI" : "AI Core"] ?? "bg-muted text-muted-foreground border-border"}`}
                  >
                    {t.tag}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed mb-6 flex-1">
                  "{t.text}"
                </p>
                <div>
                  <div className="flex items-center gap-1 mb-3">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star
                        key={i}
                        className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500"
                      />
                    ))}
                  </div>
                  <div className="pt-4 border-t border-border">
                    <p className="text-sm font-semibold text-foreground">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.location}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="relative py-32 px-6 overflow-hidden">
        <img
          src={destinationKerala}
          alt="Kerala backwaters"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h2
            className="text-5xl md:text-6xl font-bold text-white mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Radiator Routes
          </h2>
          <p className="text-white/70 mb-4 max-w-lg mx-auto text-lg">
            AI-powered group travel intelligence. Voice-first planning.
            Regret-minimized itineraries.
          </p>
          <p className="text-white/50 mb-8 text-sm">
            All in ₹ INR. No forms. No friction. Just travel.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/auth?mode=signup"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              Start Planning Free
              <ArrowRight className="w-5 h-5" />
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

      {/* ─── Footer ─── */}
      <footer className="bg-foreground text-background py-14 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-8 mb-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <MapPin className="w-4 h-4 text-primary-foreground" />
              </div>
              <span
                className="text-lg font-bold"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Radiator Routes
              </span>
            </div>
            <p className="text-sm text-background/60 mb-4 max-w-xs leading-relaxed">
              AI-powered intelligent travel planning for Indian group travel.
              Voice-first, regret-minimized, and live-updated.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "Voice-First",
                "Regret-Aware AI",
                "Group Travel",
                "₹ INR Native",
              ].map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full bg-white/10 text-background/70 text-[10px] font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm">Product</h4>
            <ul className="space-y-2.5 text-sm text-background/60">
              <li>
                <a
                  href="#features"
                  className="hover:text-background transition-colors"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#how"
                  className="hover:text-background transition-colors"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="#destinations"
                  className="hover:text-background transition-colors"
                >
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
            <h4 className="font-semibold mb-4 text-sm">Technology</h4>
            <ul className="space-y-2.5 text-sm text-background/60">
              <li>Voice NLU Pipeline</li>
              <li>LangGraph Agents</li>
              <li>Regret-Aware Engine</li>
              <li>Supabase Realtime</li>
              <li>pgvector Search</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-sm">Resources</h4>
            <ul className="space-y-2.5 text-sm text-background/60">
              <li>
                <Link
                  to="/auth"
                  className="hover:text-background transition-colors"
                >
                  Sign In
                </Link>
              </li>
              <li>
                <a
                  href="#tech"
                  className="hover:text-background transition-colors"
                >
                  Tech Stack
                </a>
              </li>
              <li>
                <a
                  href="#testimonials"
                  className="hover:text-background transition-colors"
                >
                  Reviews
                </a>
              </li>
              <li>SOP Reference</li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto pt-6 border-t border-background/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-background/40">
            © 2026 Radiator Routes. Made with ❤️ in India. AI-powered group
            travel intelligence.
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
