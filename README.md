# 🗺️ Radiator Routes

> **The world's first voice-first, regret-aware AI travel planner for Indian group trips.**

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Realtime-3ECF8E?logo=supabase)](https://supabase.com)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![PWA](https://img.shields.io/badge/PWA-Offline--Ready-5A0FC8)](https://web.dev/progressive-web-apps/)

---

## 📖 Table of Contents

1. [Overview](#-overview)
2. [Live Demo](#-live-demo)
3. [Key Features](#-key-features)
4. [Tech Stack](#-tech-stack)
5. [Architecture](#-architecture)
6. [Getting Started](#-getting-started)
7. [Project Structure](#-project-structure)
8. [Database Schema](#-database-schema)
9. [API Integrations](#-api-integrations)
10. [AI Engine](#-ai-engine)
11. [Environment Variables](#-environment-variables)
12. [Available Scripts](#-available-scripts)
13. [Pages & Routing](#-pages--routing)
14. [Components Reference](#-components-reference)
15. [Supabase Setup](#-supabase-setup)
16. [Deployment](#-deployment)
17. [Contributing](#-contributing)
18. [License](#-license)

---

## 🌟 Overview

**Radiator Routes** is an AI-powered intelligent travel planning system purpose-built for Indian group travel optimization. It eliminates the friction of coordinating group trips by combining:

- **Voice-First Interaction** — Speak your travel dreams, no forms required
- **Regret-Aware Counterfactual Planning** — AI picks the itinerary everyone will love
- **Multi-Agent Group Negotiation** — Every traveler gets their own AI proxy
- **Real-Time Dynamic Replanning** — Live disruption detection and instant adaptation
- **₹ INR Native** — All budgets, expenses, and payments in Indian Rupees

Built as a production-grade Progressive Web App (PWA) with offline support, Supabase Realtime collaboration, and a full suite of live travel APIs.

---

## 🚀 Live Demo

> 🔗 **[radiator-routes.vercel.app](https://radiator-routes.vercel.app)** *(deploy link)*

---

## ✨ Key Features

### 🤖 AI Core
| Feature | Description |
|---|---|
| **Voice-First Planning** | Whisper STT + GPT-4o NLU extracts destination, dates, budget, group size, and interests from natural speech |
| **Regret-Minimized Itineraries** | Counterfactual planning engine generates multiple variants, picks lowest-regret plan |
| **AI Reasoning Transparency** | "Why This Plan" panel reveals selection criteria, budget logic, and insider tips |
| **Multi-Agent Group Negotiation** | Each traveler gets a personal AI proxy; agents reach Nash equilibrium consensus |
| **Regret Score Analytics** | Numeric regret score per itinerary so you always pick the best plan |

### 🗓️ Itinerary & Planning
| Feature | Description |
|---|---|
| **Day-by-Day Timeline** | Visual activity timeline with category icons, costs, times, and notes |
| **Activity Categories** | Food, Attraction, Transport, Shopping, Accommodation, Entertainment, Other — all with dedicated icons |
| **PDF Export** | Beautiful A4 PDF with trip header, stats table, activity schedule, and page numbers |
| **Collaborative Planner** | Real-time multi-user activity voting and plan editing |
| **Regret-Aware Counterfactual Planner** | Generate optimized plan variants with regret minimization |
| **Disruption Replanner** | Trigger live replanning when flights, weather, or plans change |

### 🌍 Maps & Navigation
| Feature | Description |
|---|---|
| **2D Interactive Maps** | Leaflet + OpenStreetMap with destination pin and activity overlays |
| **3D Globe View** | MapLibre GL JS / Mappls 3D maps for immersive destination exploration |
| **Turn-by-Turn Navigation** | One-tap Google Maps / navigation deep-link per activity |
| **ORS Route Calculation** | OpenRouteService routing with real distance and ETA per activity |
| **360° Street View** | Street-level imagery preview before visiting any attraction |
| **AR Attraction Viewer** | Augmented reality overlays for landmarks |

### ⛅ Live Data
| Feature | Description |
|---|---|
| **7-Day Weather Forecast** | Open-Meteo daily forecasts with max/min temp, rain, UV, wind, sunrise/sunset |
| **Severe Weather Alerts** | Automatic warnings baked into itinerary planning |
| **Live Traffic Status** | TomTom Traffic API with current speed vs. free-flow speed |
| **Traffic Labels** | Color-coded: 🟢 Free flow → 🟡 Moderate → 🔴 Heavy |

### 👥 Social & Collaboration
| Feature | Description |
|---|---|
| **Friends & Social Graph** | Send/receive friend requests, view friend profiles |
| **Direct Messaging** | Real-time DMs between travelers via Supabase Realtime |
| **Trip Invite Links** | Generate hex-encoded invite codes; friends join with one click |
| **Join Request System** | Public trip discovery with organizer-approved join requests |
| **Real-Time Trip Chat** | WebSocket group chat within each trip |

### 💰 Finance
| Feature | Description |
|---|---|
| **Group Expense Splitting** | Track shared expenses with equal/custom/percentage split modes |
| **Expense Categories** | Accommodation, Food, Transport, Activity, Shopping, General, Other |
| **Bill Settlement Tracking** | Mark individual splits as settled with timestamps |
| **UPI P2P Payments** | Deep-link UPI payment to any trip member |
| **Multi-Currency Display** | Smart ₹ INR formatting with country-aware currency display |

### 🛡️ Safety
| Feature | Description |
|---|---|
| **SOS & Emergency Panel** | One-tap emergency call with local police/hospital numbers |
| **Safety Warnings** | Auto-fetched travel advisories for destination |
| **Offline Mode** | Service worker caches trips; works without internet |

### ♿ Accessibility
| Feature | Description |
|---|---|
| **Accessibility Panel** | Filter by wheelchair access, hearing assistance, visual aids |
| **PWA Install** | Install as native-like app on any device |
| **Offline Trip Saving** | Save trips to local storage for offline access |

---

## 🛠️ Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 18.3 | UI framework |
| **TypeScript** | 5.8 | Type safety |
| **Vite** | 5.4 | Build tool & dev server |
| **Tailwind CSS** | 3.4 | Utility-first styling |
| **shadcn/ui** | latest | Accessible component library |
| **Radix UI** | latest | Headless UI primitives |
| **TanStack Query** | 5.83 | Server state management & caching |
| **React Router DOM** | 6.30 | Client-side routing |
| **Lucide React** | 0.462 | Icon library |
| **React Hook Form** | 7.61 | Form management |
| **Zod** | 3.25 | Schema validation |
| **Recharts** | 2.15 | Data visualization |

### Backend & Database
| Technology | Purpose |
|---|---|
| **Supabase** | PostgreSQL database, Auth, Realtime, Storage |
| **PostgreSQL** | Relational database with JSONB support |
| **Row-Level Security (RLS)** | Per-user and per-trip data isolation |
| **Supabase Realtime** | WebSocket subscriptions for live collaboration |
| **pgvector** | Vector embeddings for semantic place search |

### AI & Machine Learning
| Technology | Purpose |
|---|---|
| **OpenAI GPT-4o** | Itinerary generation, NLU, reasoning |
| **Whisper STT** | Voice-to-text for voice-first planning |
| **LangGraph** | Multi-agent workflow orchestration |
| **pgvector** | Semantic similarity search for place discovery |

### Maps & Geospatial
| Technology | Purpose |
|---|---|
| **Leaflet + React-Leaflet** | 2D interactive maps |
| **MapLibre GL JS** | 3D WebGL maps |
| **Mappls Web Maps SDK** | India-specific maps |
| **Nominatim / OSM** | Geocoding and reverse geocoding |
| **OpenRouteService (ORS)** | Turn-by-turn routing |

### External APIs
| API | Purpose |
|---|---|
| **Open-Meteo** | Free 7-day weather forecast |
| **TomTom Traffic API** | Real-time traffic flow data |
| **Amadeus Travel API** | Flight disruption detection |
| **OpenTripMap API** | Place of interest discovery |
| **Google Maps (deep-link)** | Navigation handoff |

### DevOps & Tools
| Technology | Purpose |
|---|---|
| **Vite PWA Plugin** | Service worker & offline support |
| **Workbox** | Cache strategies for PWA |
| **Vitest** | Unit & integration testing |
| **Testing Library** | Component testing |
| **ESLint** | Code quality |
| **jsPDF + AutoTable** | PDF generation |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        RADIATOR ROUTES                          │
│                    AI Group Travel Planner                      │
└─────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
   ┌──────▼──────┐    ┌───────▼──────┐    ┌────────▼────────┐
   │  React 18   │    │   Supabase   │    │   AI Engine     │
   │  Frontend   │    │   Backend    │    │  (LangGraph +   │
   │  (Vite/TS)  │    │  (Postgres + │    │   GPT-4o +      │
   └──────┬──────┘    │   Realtime)  │    │   Whisper)      │
          │           └───────┬──────┘    └────────┬────────┘
          │                   │                    │
   ┌──────▼──────────────────▼────────────────────▼────────┐
   │                    Feature Modules                      │
   │                                                         │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
   │  │Itinerary │  │  Maps &  │  │  Group   │             │
   │  │  AI Plan │  │  Routing │  │  Social  │             │
   │  └──────────┘  └──────────┘  └──────────┘             │
   │                                                         │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
   │  │ Weather  │  │ Finance  │  │  Safety  │             │
   │  │ Traffic  │  │ Expenses │  │   SOS    │             │
   │  └──────────┘  └──────────┘  └──────────┘             │
   └────────────────────────────────────────────────────────┘
```

### Data Flow
```
User Voice Input
       │
       ▼
Whisper STT → GPT-4o NLU → Extract (destination, dates, budget, interests)
       │
       ▼
LangGraph Multi-Agent Orchestration
  ├── Agent 1: Destination Research (OpenTripMap)
  ├── Agent 2: Weather Check (Open-Meteo)
  ├── Agent 3: Budget Optimizer
  └── Agent 4: Regret Minimizer (counterfactual variants)
       │
       ▼
Supabase (itineraries + activities tables)
       │
       ▼
Supabase Realtime → All group members see updates live
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x (or yarn / bun)
- **Supabase** account (free tier works)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/HarshTambade/Radiator-Routes.git
cd Radiator-Routes

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Fill in your keys (see Environment Variables section)

# 4. Set up Supabase database
# Paste supabase/master_schema.sql into Supabase SQL Editor and run

# 5. Start the development server
npm run dev
```

The app will be available at **http://localhost:5173**

---

## 📁 Project Structure

```
Radiator-Routes/
│
├── public/                         # Static assets & PWA manifest
│
├── src/
│   ├── assets/                     # Images (hero, destinations, travel photos)
│   │   ├── hero-ocean.jpg
│   │   ├── destination-goa.jpg
│   │   ├── destination-agra.jpg
│   │   ├── destination-kerala.jpg
│   │   └── ...
│   │
│   ├── components/                 # Reusable UI components
│   │   ├── ui/                     # shadcn/ui base components
│   │   ├── AIAssistant.tsx         # Voice-first AI assistant
│   │   ├── ARViewer.tsx            # Augmented reality attraction viewer
│   │   ├── AccessibilityPanel.tsx  # Accessibility filter panel
│   │   ├── AddToTripButton.tsx     # Add activity to trip button
│   │   ├── AppSidebar.tsx          # Main navigation sidebar
│   │   ├── CollaborativePlanner.tsx # Real-time multi-user planner
│   │   ├── DisruptionReplanner.tsx  # Live disruption & replanning
│   │   ├── ItineraryReasoning.tsx   # "Why This Plan" AI reasoning panel
│   │   ├── Layout.tsx               # Main layout wrapper
│   │   ├── Map3D.tsx                # 3D MapLibre map component
│   │   ├── MapplsMap.tsx            # Mappls India map component
│   │   ├── MobileHeader.tsx         # Mobile top header
│   │   ├── MobileNav.tsx            # Mobile bottom navigation
│   │   ├── NavLink.tsx              # Sidebar nav link
│   │   ├── OfflineSaveButton.tsx    # Save trip for offline access
│   │   ├── PWAInstallPrompt.tsx     # PWA installation prompt
│   │   ├── ProtectedLayout.tsx      # Auth-protected layout
│   │   ├── ProtectedRoute.tsx       # Auth-protected route guard
│   │   ├── RegretPlanner.tsx        # Counterfactual regret planner
│   │   ├── SOSPanel.tsx             # Emergency SOS panel
│   │   ├── SafetyWarnings.tsx       # Destination safety warnings
│   │   ├── StreetView360.tsx        # 360° street view
│   │   ├── TravelMemory.tsx         # Trip memory / photo journal
│   │   ├── TripCreationChat.tsx     # AI chat for trip creation
│   │   ├── TripMoneyExpenses.tsx    # Group expense tracker
│   │   ├── UPIPayment.tsx           # UPI P2P payment
│   │   └── WorldMap.tsx             # 2D Leaflet world map
│   │
│   ├── data/                        # Static data files
│   │
│   ├── hooks/                       # Custom React hooks
│   │   ├── useAuth.ts               # Authentication hook
│   │   ├── useOfflineTrip.ts        # Offline storage hook
│   │   ├── useTrips.ts              # Trip CRUD hooks
│   │   └── use-toast.ts             # Toast notification hook
│   │
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts            # Supabase client instance
│   │       └── types.ts             # Auto-generated DB types
│   │
│   ├── lib/
│   │   ├── currency.ts              # ₹ INR + multi-currency formatting
│   │   └── utils.ts                 # Tailwind merge utilities
│   │
│   ├── pages/                       # Route page components
│   │   ├── Auth.tsx                 # Login / Registration page
│   │   ├── Community.tsx            # Community hub page
│   │   ├── Dashboard.tsx            # User dashboard
│   │   ├── Explore.tsx              # Destination explorer
│   │   ├── Friends.tsx              # Friends, DMs, invites, join requests
│   │   ├── Guide.tsx                # Travel guide
│   │   ├── Index.tsx                # App entry redirect
│   │   ├── Itinerary.tsx            # Main itinerary planner page
│   │   ├── JoinTrip.tsx             # Join trip via invite link
│   │   ├── Landing.tsx              # Public marketing landing page
│   │   ├── NotFound.tsx             # 404 page
│   │   └── Profile.tsx              # User profile page
│   │
│   ├── services/                    # External API service modules
│   │   ├── aiPlanner.ts             # GPT-4o itinerary planning
│   │   ├── climate.ts               # Open-Meteo weather service
│   │   ├── nominatim.ts             # OSM geocoding service
│   │   └── traffic.ts               # TomTom traffic service
│   │
│   ├── test/                        # Test files
│   ├── App.tsx                      # Root app component with routing
│   ├── main.tsx                     # React entry point
│   └── index.css                    # Global styles + Tailwind directives
│
├── supabase/
│   ├── migrations/                  # Incremental database migrations
│   │   ├── 20260221080224_*.sql     # Initial schema
│   │   ├── 20260221084836_*.sql     # Auth & profiles
│   │   ├── 20260221090907_*.sql     # Trips & memberships
│   │   ├── 20260221104720_*.sql     # Itineraries & activities
│   │   ├── 20260221105025_*.sql     # Community tables
│   │   ├── 20260221110549_*.sql     # Activity status & votes
│   │   ├── 20260221110824_*.sql     # Activity voting
│   │   ├── 20260221112103_*.sql     # Trip invites & join requests
│   │   ├── 20260221112457_*.sql     # Disruption events
│   │   ├── 20260221130439_*.sql     # Profile visibility
│   │   ├── 20260222000001_friends_and_expenses.sql  # Friends, DMs, expenses
│   │   └── 20260222000002_fix_trip_join_requests_status.sql  # Status constraint fix
│   │
│   ├── master_schema.sql            # Complete idempotent schema (run on fresh DB)
│   ├── schema.sql                   # Alternate schema reference
│   ├── config.toml                  # Supabase local config
│   └── SETUP_INSTRUCTIONS.md        # Step-by-step Supabase setup guide
│
├── index.html                       # HTML entry point
├── vite.config.ts                   # Vite configuration with PWA plugin
├── tailwind.config.ts               # Tailwind theme configuration
├── tsconfig.json                    # TypeScript configuration
├── vercel.json                      # Vercel deployment config (SPA rewrites)
└── package.json                     # Dependencies & scripts
```

---

## 🗄️ Database Schema

Radiator Routes uses **PostgreSQL via Supabase** with full **Row-Level Security (RLS)**.

### Core Tables

| Table | Description |
|---|---|
| `profiles` | User profiles (name, avatar, bio, travel preferences) |
| `trips` | Trip records (destination, dates, budget, status, organizer) |
| `trip_memberships` | Many-to-many: users ↔ trips with roles (organizer/member) |
| `itineraries` | AI-generated itinerary versions per trip |
| `activities` | Day-by-day activities within an itinerary |
| `activity_votes` | Member votes on activities (upvote/downvote) |
| `messages` | Real-time group chat messages per trip |
| `disruption_events` | Flight/weather disruptions triggering replanning |

### Social & Invite Tables

| Table | Description |
|---|---|
| `trip_invites` | Invite codes with max_uses, expiry |
| `trip_join_requests` | Join requests: `pending` → `approved` / `rejected` |
| `friend_requests` | Friend connections: `pending` → `accepted` / `rejected` |
| `direct_messages` | Private 1-to-1 messages between users |

### Finance Tables

| Table | Description |
|---|---|
| `group_expenses` | Shared trip expenses with split type |
| `expense_splits` | Per-member expense shares with settlement status |

### Community Tables

| Table | Description |
|---|---|
| `communities` | Public travel communities |
| `community_memberships` | User ↔ community relationships |
| `community_messages` | Community chat messages |
| `community_events` | Community events |
| `event_rsvps` | Event attendance tracking |

### Status Constraints

```sql
-- trips.status
CHECK (status IN ('planning', 'booked', 'ongoing', 'completed'))

-- trip_join_requests.status
CHECK (status IN ('pending', 'approved', 'rejected'))

-- friend_requests.status
CHECK (status IN ('pending', 'accepted', 'rejected'))

-- event_rsvps.status
CHECK (status IN ('going', 'maybe', 'not_going'))
```

### Key Database Functions

```sql
-- Check if user is a trip member
public.is_trip_member(trip_id UUID) → BOOLEAN

-- Check if user is the trip organizer
public.is_trip_organizer(trip_id UUID) → BOOLEAN

-- Auto-update updated_at timestamp
public.set_updated_at() → TRIGGER
```

### Realtime Subscriptions

The following tables are added to `supabase_realtime` publication for live updates:
- `messages` — Trip group chat
- `activity_votes` — Live voting
- `community_messages` — Community chat
- `trip_join_requests` — Organizer notifications
- `direct_messages` — Friend DMs
- `friend_requests` — Friend request notifications
- `group_expenses` — Expense updates
- `expense_splits` — Settlement updates

---

## 🔌 API Integrations

### Open-Meteo (Weather)
```typescript
// src/services/climate.ts
// Free, no API key required
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,
         weathercode,windspeed_10m_max,uv_index_max,sunrise,sunset
  &timezone=auto
  &forecast_days=7
```

### TomTom Traffic
```typescript
// src/services/traffic.ts
GET https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json
  ?point={lat},{lon}&key={VITE_TOMTOM_KEY}
```

### OpenRouteService (Routing)
```typescript
// Used in Itinerary.tsx for per-activity routes
POST https://api.openrouteservice.org/v2/directions/driving-car
Authorization: Bearer {ORS_KEY}
Body: { coordinates: [[originLon, originLat], [destLon, destLat]], units: "km" }
```

### Nominatim (Geocoding)
```typescript
// src/services/nominatim.ts — Free, no key required
GET https://nominatim.openstreetmap.org/search
  ?q={destination}&format=json&limit=1
```

### OpenAI GPT-4o (AI Planning)
```typescript
// src/services/aiPlanner.ts
// Generates structured itinerary JSON with regret scoring
POST https://api.openai.com/v1/chat/completions
  model: "gpt-4o"
  messages: [system prompt + trip context]
```

---

## 🤖 AI Engine

### Voice-First NLU Pipeline

```
User speaks → MediaRecorder API → Audio Blob
     → Whisper STT API → Transcript
     → GPT-4o NLU → Structured JSON:
        {
          destination: "Goa",
          start_date: "2026-03-15",
          end_date: "2026-03-20",
          travelers: 4,
          budget_total: 40000,
          interests: ["beaches", "seafood", "nightlife"],
          trip_type: "leisure"
        }
```

### Regret-Minimization Planner

The AI generates itinerary plans using a **counterfactual regret minimization** approach:

1. Generate **N candidate itineraries** (different activity mixes)
2. For each plan, compute **regret score** = how much each traveler misses out
3. Select the plan with the **minimum maximum regret** across all travelers
4. Output includes `reasoning` object explaining every decision:
   - `plan_title` — Creative trip name
   - `selection_summary` — One-line plan justification
   - `selection_criteria` — Array of criteria with icons and reasons
   - `why_these_activities` — Activity selection logic
   - `budget_strategy` — How budget was allocated
   - `best_value_picks` — Top value-for-money activities
   - `time_optimization` — Route and schedule optimization notes
   - `traveler_fit` — Why this fits the group
   - `local_tips` — Insider tips for the destination
   - `potential_savings` — Money-saving suggestions

### Multi-Agent Group Negotiation

```
Trip Members: [Alice (beaches), Bob (history), Carol (food)]
       │
       ▼
  Agent Alice  →  Preference vector: beaches=0.9, history=0.2, food=0.5
  Agent Bob    →  Preference vector: beaches=0.3, history=0.9, food=0.6
  Agent Carol  →  Preference vector: beaches=0.4, history=0.4, food=0.95
       │
       ▼
  Nash Equilibrium Solver
  → Weighted activity scores
  → Pareto-optimal itinerary
  → Regret score: 0.23 (everyone gets ≥70% of what they want)
```

---

## 🔐 Environment Variables

Create a `.env` file in the project root:

```env
# ─── Supabase ─────────────────────────────────────────────────────
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# ─── OpenAI (AI Itinerary Planning + Voice NLU) ───────────────────
VITE_OPENAI_API_KEY=sk-your-openai-key-here

# ─── TomTom (Live Traffic) ────────────────────────────────────────
VITE_TOMTOM_KEY=your-tomtom-api-key-here

# ─── OpenRouteService (Turn-by-Turn Routing) ──────────────────────
VITE_ORS_KEY=your-ors-key-here

# ─── Mappls (India Maps SDK) ──────────────────────────────────────
VITE_MAPPLS_KEY=your-mappls-key-here

# ─── Amadeus (Flight Disruption Detection) ────────────────────────
VITE_AMADEUS_CLIENT_ID=your-amadeus-client-id
VITE_AMADEUS_CLIENT_SECRET=your-amadeus-client-secret

# ─── OpenTripMap (Place Discovery) ───────────────────────────────
VITE_OPENTRIPMAP_KEY=your-opentripmap-key-here
```

> **Note:** Open-Meteo and Nominatim are completely free with no API key required.

---

## 📦 Available Scripts

```bash
# Development server (http://localhost:5173)
npm run dev

# Production build (output to /dist)
npm run build

# Preview production build locally
npm run preview

# Run all tests (Vitest)
npm run test

# Run tests in watch mode
npm run test:watch

# Lint code (ESLint)
npm run lint

# Development build (with source maps)
npm run build:dev
```

---

## 🗺️ Pages & Routing

| Route | Page | Access | Description |
|---|---|---|---|
| `/` | `Index.tsx` | Public | Redirects to Landing or Dashboard |
| `/landing` | `Landing.tsx` | Public | Marketing landing page |
| `/auth` | `Auth.tsx` | Public | Login / Registration |
| `/auth?mode=signup` | `Auth.tsx` | Public | Registration mode |
| `/dashboard` | `Dashboard.tsx` | Protected | User dashboard with trips |
| `/itinerary` | `Itinerary.tsx` | Protected | Itinerary without trip ID |
| `/itinerary/:tripId` | `Itinerary.tsx` | Protected | Full itinerary planner |
| `/explore` | `Explore.tsx` | Protected | Destination explorer |
| `/friends` | `Friends.tsx` | Protected | Friends, DMs, invites |
| `/community` | `Community.tsx` | Protected | Community hub |
| `/guide` | `Guide.tsx` | Protected | Travel guide |
| `/profile` | `Profile.tsx` | Protected | User profile |
| `/join/:inviteCode` | `JoinTrip.tsx` | Protected | Join via invite link |
| `*` | `NotFound.tsx` | Public | 404 page |

---

## 🧩 Components Reference

### Core Planner Components

#### `RegretPlanner`
Generates multiple itinerary variants using counterfactual reasoning and lets users pick the best plan.

**Props:**
```typescript
{
  tripId: string;
  destination: string;
  country?: string;
  days: number;
  budget: number;
  activeItineraryId?: string;
  onPlanApplied: () => void;
}
```

#### `DisruptionReplanner`
Detects and handles disruptions (flight delays, severe weather) with live replanning.

**Props:**
```typescript
{
  tripId: string;
  activeItineraryId?: string;
  onReplanApplied: () => void;
}
```

#### `CollaborativePlanner`
Real-time multi-user activity collaboration with voting.

**Props:**
```typescript
{
  tripId: string;
  activities: Activity[];
  onActivityUpdated: () => void;
}
```

#### `ItineraryReasoningPanel`
Displays AI reasoning in a tabbed panel: "Why This Plan", "Budget Logic", "Insider Tips".

**Props:**
```typescript
{
  reasoning: ItineraryReasoning;
  totalCost?: number;
  budget?: number;
  destination?: string;
  explanation?: string;
}
```

#### `TripMoneyExpenses`
Full group expense tracker with bill splitting, settlements, and budget visualization.

**Props:**
```typescript
{
  activities: Activity[];
  tripBudget: number;
  country?: string;
  travelers: number;
  memberNames?: string[];
}
```

#### `SOSPanel`
Emergency panel with one-tap SOS, local emergency numbers, and nearest hospital locator.

#### `SafetyWarnings`
Auto-fetches destination-specific travel advisories.

**Props:**
```typescript
{
  destination: string;
  autoFetch?: boolean;
}
```

#### `WorldMap`
2D Leaflet map centered on a destination.

**Props:**
```typescript
{
  lat: number;
  lng: number;
  name: string;
  zoom?: number;
  className?: string;
}
```

#### `Map3D`
3D MapLibre GL map with satellite/terrain view.

**Props:**
```typescript
{
  lat: number;
  lng: number;
  name: string;
  zoom?: number;
  className?: string;
}
```

---

## ⚙️ Supabase Setup

### Option 1: Master Schema (Recommended for fresh setup)

1. Go to your **Supabase Dashboard** → **SQL Editor** → **New Query**
2. Open `supabase/master_schema.sql`
3. Paste the entire contents and click **Run**
4. This script is **100% idempotent** — safe to re-run on existing databases

### Option 2: Incremental Migrations

Run migrations in order from the `supabase/migrations/` directory:

```bash
# Using Supabase CLI
supabase db push

# Or manually in SQL Editor, in this order:
20260221080224_*.sql   # Base schema
20260221084836_*.sql   # Auth & profiles
20260221090907_*.sql   # Trips & memberships
20260221104720_*.sql   # Itineraries & activities
20260221105025_*.sql   # Community
20260221110549_*.sql   # Activity status
20260221110824_*.sql   # Voting
20260221112103_*.sql   # Invites & join requests
20260221112457_*.sql   # Disruption events
20260221130439_*.sql   # Profile visibility
20260222000001_*.sql   # Friends, DMs, expenses
20260222000002_*.sql   # Fix status constraint (IMPORTANT)
```

### Supabase Auth Setup

1. **Dashboard → Authentication → Providers**
2. Enable **Email** provider
3. Set **Site URL** to your deployment URL (e.g., `https://radiator-routes.vercel.app`)
4. Add redirect URLs for local dev: `http://localhost:5173/**`

### Required Supabase Extensions

```sql
-- Enable in Dashboard → Database → Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";       -- for pgvector semantic search
CREATE EXTENSION IF NOT EXISTS "pg_crypto";    -- for gen_random_bytes (invite codes)
```

### Enable Realtime

The master schema automatically enables Realtime for all required tables. To verify:

```sql
-- Check which tables have realtime enabled
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

Expected tables: `messages`, `activity_votes`, `community_messages`, `trip_join_requests`, `direct_messages`, `friend_requests`, `group_expenses`, `expense_splits`

---

## 🚢 Deployment

### Vercel (Recommended)

The project includes `vercel.json` with SPA rewrites pre-configured.

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or connect your GitHub repo directly in the Vercel dashboard.

**Environment Variables in Vercel:**
Add all variables from the [Environment Variables](#-environment-variables) section in:
`Vercel Dashboard → Project Settings → Environment Variables`

### Netlify

```bash
# Build command
npm run build

# Publish directory
dist

# Add _redirects file for SPA routing
echo "/*  /index.html  200" > public/_redirects
```

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### PWA Considerations

The app uses **Vite PWA Plugin** with **Workbox** for caching. After deployment:
- Users can install the app from browser prompts
- Trips saved offline remain accessible without internet
- Service worker auto-updates on new deployments

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Workflow

```bash
# Fork and clone
git clone https://github.com/HarshTambade/Radiator-Routes.git
cd Radiator-Routes

# Create a feature branch
git checkout -b feat/your-feature-name

# Make your changes
# ...

# Run tests
npm run test

# Lint
npm run lint

# Commit with conventional commits
git commit -m "feat: add voice command shortcuts"

# Push and open a PR
git push origin feat/your-feature-name
```

### Code Style Guidelines

- **TypeScript** — No `any` types where avoidable; use proper interfaces
- **Components** — Functional components with hooks only
- **Naming** — PascalCase for components, camelCase for hooks and utilities
- **CSS** — Tailwind utility classes; avoid inline styles except for dynamic font-family
- **Database** — Always add RLS policies for new tables
- **API Keys** — Never hardcode; always use `import.meta.env.VITE_*`

### Adding a New Feature

1. Create service in `src/services/` for any new API integration
2. Add custom hook in `src/hooks/` for reusable data fetching
3. Create component in `src/components/` 
4. Add Supabase migration in `supabase/migrations/` if DB changes needed
5. Update `supabase/master_schema.sql` to reflect changes
6. Add tests in `src/test/`

### Reporting Issues

Please include:
- Browser and OS version
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)
- Supabase error messages (if applicable)

---

## 📊 Key Technical Decisions

| Decision | Rationale |
|---|---|
| **Supabase over Firebase** | PostgreSQL + RLS gives us relational integrity, pgvector support, and SQL expressiveness |
| **TanStack Query** | Server state caching reduces redundant Supabase calls and provides optimistic updates |
| **Vite over CRA** | 10-100x faster HMR, native ESM, better tree-shaking |
| **Tailwind over CSS-in-JS** | Zero runtime cost, consistent design tokens, no style collisions |
| **React Router v6** | Native data loading, nested layouts, type-safe route params |
| **Open-Meteo** | Free, no rate limits, GDPR-compliant weather data |
| **ORS over Google Directions** | Free, open-source, no per-request billing |
| **Nominatim over Google Geocoding** | Free, no API key required, good India coverage |

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2026 Radiator Routes

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 Acknowledgements

- **OpenAI** — GPT-4o and Whisper STT
- **Supabase** — Open-source Firebase alternative
- **Open-Meteo** — Free weather API
- **OpenStreetMap & Nominatim** — Free geocoding
- **OpenRouteService** — Free routing
- **TomTom** — Traffic data
- **shadcn/ui** — Beautiful accessible components
- **Lucide** — Consistent icon library
- **Vercel** — Deployment platform

---

<div align="center">

Made with ❤️ in India 🇮🇳

**[⭐ Star this repo](https://github.com/HarshTambade/Radiator-Routes)** if Radiator Routes helps you plan better trips!

</div>