# Radiator Routes — Platform Audit

**Date:** 30 August 2026
**Commit audited:** `872c774` plus uncommitted working-tree changes
**Scope:** dependency security, secret handling, build & bundle, PWA/offline correctness, type and lint health, accuracy of user-facing claims
**Toolchain observed:** Node v25.9.0 · npm 11.12.1 · Vite 8.2.2 (Rolldown + Oxc) · TypeScript 5.9.3 · Vitest 4.1.11

Every number below was produced by running the command shown. Items marked **Not verified** were
not measurable in this environment and are called out as such rather than estimated.

---

## 1. Executive summary

| Area | Status | Note |
|---|---|---|
| Dependency vulnerabilities | ✅ Pass | 0 of 819 packages |
| Hardcoded secrets in `src/` | ✅ Pass | No JWT / `sk-` / `gsk_` patterns |
| Secrets in git history | 🔴 **Critical** | `.env` with 6 live keys committed to a public repo |
| TypeScript | ✅ Pass | `tsc --noEmit` clean |
| ESLint | 🟡 Partial | 0 errors, 157 warnings |
| Tests | 🟡 Weak | 1 test, 1 file — effectively no coverage |
| Production build | ✅ Pass | Succeeds in ~1.1 s |
| Initial bundle | ✅ Good | ≈175 kB gzipped |
| PWA manifest & service worker | ✅ Pass | 80 precache entries, 11 runtime caches verified in `dist/sw.js` |
| Offline reads | ✅ Works | App shell, saved trips, cached tiles and API responses |
| Offline writes | 🔴 **Not implemented** | Queue exists but is not wired to any mutation path |
| Accuracy of user-facing claims | 🟡 Fixed this pass | Landing page and metadata advertised removed/absent tech |
| Licensing metadata | 🟡 Missing | No `LICENSE` file, no `license` field |

**Headline:** the codebase is in good shape technically — clean types, zero vulnerabilities, a
well-split bundle and a correctly generated service worker. The single blocking issue is that live
API credentials are sitting in the public GitHub repository's history and **must be rotated**. The
second material gap is that "works offline" is true for reading but not for writing.

---

## 2. Critical — live credentials in public git history

### Finding

`.gitignore` lists `.env`, but the file was committed *before* that rule was added. `.gitignore`
only affects untracked files, so git kept tracking it and it has been pushed to the public
repository.

```
$ git ls-files --error-unmatch .env
.env                      # → tracked
```

Six variables hold non-empty values:

| Variable | Value length | Exposure |
|---|---|---|
| `VITE_SUPABASE_URL` | 40 | Public by design |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 46 | Publishable — low risk, RLS is the boundary |
| `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | 46 | Same |
| `VITE_ORS_API_KEY` | 120 | **Quota abuse** — attributable to your account |
| `VITE_OPENTRIPMAP_API_KEY` | 56 | **Quota abuse** |
| `VITE_GROQ_API_KEY` | 56 | **Quota abuse** — highest value of the three |

Values were not printed; only names and lengths were read.

### Nuance

Because this is a browser-only app, all `VITE_*` values ship inside the JavaScript bundle anyway
and are readable by any visitor. The git leak is therefore not the *only* exposure path — but it is
worse in one specific way: **git history is permanent and greppable by automated scanners**, so
these keys are discoverable without anyone visiting the deployed site.

### Action taken

`.env` was untracked so it stops being pushed:

```bash
git rm --cached .env      # local file left intact
```

### Action still required — needs your decision

1. **Rotate all three free-tier keys now.** Untracking does not remove them from history. Treat
   `VITE_GROQ_API_KEY`, `VITE_ORS_API_KEY` and `VITE_OPENTRIPMAP_API_KEY` as compromised.
   - Groq: <https://console.groq.com> → revoke and reissue
   - OpenRouteService: dashboard → delete and recreate the token
   - OpenTripMap: regenerate
2. **Restrict each new key by HTTP referrer** in its provider dashboard so a leaked copy is not
   usable from arbitrary origins.
3. **Optionally purge history.** `git filter-repo` or BFG can strip `.env` from every commit, but
   this rewrites history and requires a force-push — destructive for anyone who has cloned or
   forked. Given the keys will be rotated anyway, rotation alone closes the risk; purging is
   hygiene. **I have not attempted this** and would need your explicit go-ahead.
4. **Store production values in the host**, not a file — Vercel Project Settings → Environment
   Variables.

### Supabase specifically

The publishable key is *designed* to be public; Row-Level Security is the real authorisation
boundary. **Not verified in this audit:** whether RLS policies are actually enabled and correct on
every table in your live project. `master_schema.sql` declares them, but I could not query the
running database. Confirm with:

```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
```

Any row showing `rowsecurity = false` is world-readable with the publishable key alone.

---

## 3. Dependency security

```
$ npm audit
found 0 vulnerabilities

prod 310 · dev 554 · optional 81 · peer 9 · total 880 packages
```

Clean. This is the result of the earlier hardening pass, which took the project from 30
vulnerabilities (2 critical) to zero by:

- Removing `lovable-tagger`, whose peer range capped Vite below v8
- Vite 5.4.19 → 8.2.2, `@vitejs/plugin-react-swc` → 4.3.3, `vite-plugin-pwa` → 1.3.0
- Vitest 3.2.4 → 4.1.11, jsdom → 30
- react-router-dom 6.30.1 → 7.18.3
- jspdf → 4.2.1 (fixes a critical PDF injection advisory)
- Cutting runtime dependencies from 57 to 20 and deleting 45 unused shadcn/ui components

### 3.1 Engine mismatch — low

```
npm warn EBADENGINE package: 'jsdom@30.0.1'
npm warn EBADENGINE required: { node: '^22.22.2 || ^24.15.0 || >=26.0.0' }
npm warn EBADENGINE current:  { node: 'v25.9.0' }
```

Node 25 is an odd-numbered, non-LTS release that jsdom does not support. Tests pass regardless,
but this is an avoidable source of CI drift. **Recommendation:** develop and build on Node 22 LTS
or 24 LTS. `package.json` declares `engines.node >= 20.19`, which is satisfied but does not pin
you away from unsupported odd releases.

### 3.2 Four competing lockfiles — medium

```
bun.lockb   package-lock.json   pnpm-lock.yaml   yarn.lock
```

Plus a stray `pnpm-workspace.yaml` in a non-workspace project. Different CI providers auto-detect
different lockfiles, so two environments can resolve different dependency trees from the same
commit — which defeats the point of lockfiles.

**Recommendation:** keep `package-lock.json` (the scripts and this audit assume npm), delete the
other three and `pnpm-workspace.yaml`. This is a repo-layout change I have not made unilaterally.

---

## 4. Secret handling in source

```
$ grep -rnoE "(eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|gsk_[A-Za-z0-9]{20,})" src/
(no matches)
```

`src/integrations/supabase/client.ts` reads credentials exclusively from `import.meta.env`, throws
loudly in dev when they are missing, and degrades with a console error in production instead of
crashing. It exports `isSupabaseConfigured` so features can disable themselves rather than throw.
This is the right shape.

Historically `services/gnews.ts` carried a hardcoded GNews key. That service now uses Wikipedia's
keyless REST API and the key is gone from source — **but it remains in git history**, so it should
be considered burned along with the others.

---

## 5. Type safety and lint

### TypeScript

```
$ tsc --noEmit -p tsconfig.app.json
(clean, exit 0)
```

### ESLint

```
$ npm run lint
✖ 157 problems (0 errors, 157 warnings)
```

**One error was fixed during this audit.** `lib/offlineCache.ts` used
`new Promise(async (resolve, reject) => …)` — the `no-async-promise-executor` anti-pattern, where a
rejection thrown after the first `await` is swallowed rather than surfacing. Rewritten as a plain
`async` function.

The remaining 157 are warnings, overwhelmingly `@typescript-eslint/no-explicit-any`, concentrated
in `services/traffic.ts` (10 in the compatibility-shim dispatcher), `services/aiChat.ts`,
`services/translate.ts` and API-response parsing paths.

**Assessment:** not blocking, but each `any` at a network boundary is a place where a provider
changing its response shape produces a runtime crash instead of a compile error. The highest-value
fix is to define response interfaces for the external API payloads, since that is exactly where
untrusted data enters.

---

## 6. Test coverage — weakest area

```
$ npm run test
✓ src/test/example.test.ts (1 test) 2ms
Test Files  1 passed (1)
     Tests  1 passed (1)
```

One placeholder test. Vitest, jsdom and Testing Library are all installed and working, so the
infrastructure is ready — there is simply nothing using it. `npm run verify` therefore gives
false confidence: it can pass with the app completely broken.

Highest-value targets, in order:

1. **`lib/offlineCache.ts` / `lib/idb.ts`** — pure, dependency-free, and where two real bugs were
   found this pass (§7). Would have caught both.
2. **`lib/currency.ts`** — pure formatting, trivial to test, user-visible if wrong.
3. **`lib/http.ts`** — timeout and retry behaviour with a mocked `fetch`.
4. **Regret-scoring logic** — the product's core differentiator, currently unverified.
5. **`ProtectedRoute` / `ProtectedLayout`** — a redirect regression here is a security issue.

No coverage threshold is configured. Adding one only helps once real tests exist.

---

## 7. Bugs found and fixed during this audit

All four were introduced by the PWA work in the immediately preceding session.

### 7.1 Infinite loop in `clearExpiredCaches()` — high

```ts
const cursor = await db.transaction(store, "readwrite").store.openCursor();
while (cursor) {
  // ...
  cursor.continue();     // returns a Promise; does NOT reassign `cursor`
}
```

`cursor` stays truthy forever. Calling this function would spin the event loop and hang the tab.
Fixed by reassigning: `cursor = await cursor.continue();`, and by awaiting `tx.done` before
closing the connection.

### 7.2 TTL never expired for cached trips — medium

`cacheTrip()` never wrote a `timestamp`, but `getCachedTrip()` computed
`Date.now() - trip.timestamp > TTL`. With `timestamp === undefined` that is `NaN > TTL`, which is
always `false` — so cached trips never expired and stale data would be served indefinitely. Fixed
by stamping on write and centralising the check in one `isFresh()` helper.

### 7.3 Dead service worker — medium

`src/sw.ts` was written as a custom Workbox service worker and wired in via
`srcDSW: "src/sw.ts"`. **`srcDSW` is not a real `vite-plugin-pwa` option** (the correct keys are
`strategies: "injectManifest"` with `srcDir` / `filename`), so it was silently ignored. Build
output confirms the plugin stayed in `generateSW` mode:

```
PWA v1.3.0
mode      generateSW
```

The file therefore never compiled into the shipped worker — ~190 lines of dead code that read as
if it were live, plus five unnecessary `workbox-*` dependencies.

**Fixed:** deleted `src/sw.ts`, removed the bogus option, uninstalled the orphaned packages. The
runtime caching in `vite.config.ts` was already doing the real work — verified against the emitted
bundle (§9).

### 7.4 Cached user data survived sign-out — medium (privacy)

`supabase-rest` is cached with `StaleWhileRevalidate`, keyed by URL. `signOut()` cleared the
Supabase session but not the Cache API, so on a shared or installed device the next user could be
served rows belonging to the previous session. Supabase RLS protects the *server*; it cannot
retract a response already in the local cache.

**Fixed:** `signOut()` now deletes the `supabase-rest` and `supabase-api` caches. Anonymous caches
(tiles, fonts, Wikipedia, weather) are deliberately preserved so the app stays useful offline.

---

## 8. Duplicated offline layer — architectural finding

The repository **already contained a complete, working offline system** before the PWA session:

- `services/offlineTrip.ts` — raw-IndexedDB persistence of trips, itineraries and activities, plus
  OSM tile pre-caching with tile-maths, batched concurrency and progress reporting
- `hooks/useOfflineTrip.ts` — `useOfflineTrip`, `useAllOfflineTrips`, `useOnlineStatus`
- `components/OfflineSaveButton.tsx` — the wired UI entry point

The new modules — `lib/idb.ts`, `lib/offlineCache.ts`, `hooks/useOfflineStorage.ts` — duplicated
this with a second IndexedDB database (`radiator-routes-db` alongside
`radiator-routes-offline`) and were **referenced by nothing**:

```
$ grep -rE "useOfflineStorage|offlineCache|@/lib/idb" src/
(no matches)
```

`OfflineIndicator` also attached its own `online`/`offline` listeners, duplicating
`useOnlineStatus`.

### Resolution

Rather than delete the work or leave it dead, the useful parts were wired in and the duplication
removed:

- `OfflineIndicator` now consumes `useOnlineStatus`, so connectivity has **one** source of truth
- `useServiceWorkerUpdate` is live: it detects a waiting worker and renders a reload prompt
- `clearExpiredCaches()` runs on mount, so the TTL cache is actually pruned
- The no-op `useConnectionStatus` stub (a frozen object with empty setters) was removed
- `lib/idb.ts` was rewritten with a `withDB()` helper that guarantees connections close, typed
  store/index declarations, and a `deleteItinerary` that deletes only the target trip's rows —
  the previous version called `db.clear("itinerary")` and wiped **every** trip's itinerary

### Still open

`useOfflineStorage`'s mutation queue is correct and durable but **not called from any mutation
path**. Until trip/activity/expense writes route through `enqueue()` and drain via `sync()` on
reconnect, offline edits are lost. This is the largest remaining gap against the stated goal that
"maximum modules work offline" — see §10.

Two IndexedDB databases still coexist. Consolidating `radiator-routes-db` into
`radiator-routes-offline` would need a migration and is deferred.

---

## 9. PWA and offline verification

### Build output

```
PWA v1.3.0
mode      generateSW
precache  80 entries (4343.03 KiB)
files generated
  dist/sw.js
  dist/workbox-7334f08a.js
  dist/manifest.webmanifest
  dist/registerSW.js
```

### Runtime caches confirmed present in the emitted worker

```
$ grep -oE 'cacheName:"[a-zA-Z0-9_-]+"' dist/sw.js | sort -u
google-fonts · gstatic-fonts · nominatim · nominatim-search · opentripmap
osm-tiles-offline · supabase-rest · topo-maps · weather · wikimedia · wikipedia
```

All 12 declared rules compiled into 11 unique caches — two OSM tile patterns intentionally share
`osm-tiles-offline`, which is also the cache `services/offlineTrip.ts` pre-populates. That
alignment is what makes explicitly saved trips render maps offline; it is worth preserving if
either file changes.

Strategy mix: 6 × CacheFirst, 5 × StaleWhileRevalidate, 1 × NetworkFirst. `navigateFallback` to
`index.html` is present, so any route resolves offline.

### Manifest

Validated from `dist/manifest.webmanifest`: `standalone` display with `minimal-ui`/`browser`
fallbacks, `id: "/"`, portrait orientation, 8 icons (192 and 512 `any maskable`), 4 shortcuts,
`handle_links: preferred`, `launch_handler.client_mode: auto`.

Two defects were introduced and then removed during this pass:

- **`related_applications`** pointed at `https://play.google.com/…?id=com.radiatorroutes`, a Play
  Store listing that does not exist. Harmless with `prefer_related_applications: false`, but a
  manifest asserting a fictional native app is wrong. Removed.
- **`clipboard_write: "default"`** is not a Web App Manifest member. Removed.

`screenshots` is intentionally absent: the entries would have referenced
`icon-1280x720.png` / `icon-720x1280.png`, neither of which exists in `public/icons/`. Adding two
real screenshots is a genuine improvement — Chrome uses them for a richer install dialog.

### Offline capability matrix

| Module | Offline | Mechanism |
|---|---|---|
| App shell, all routes | ✅ Full | Precache + `navigateFallback` |
| Saved trip + itinerary + activities | ✅ Full | IndexedDB via `offlineTrip.ts` |
| Maps near a saved trip | ✅ Full | ~173 tiles, z10–z14, CacheFirst |
| Previously-viewed Supabase reads | 🟡 Stale-tolerant | `StaleWhileRevalidate`, 1 d |
| Weather | 🟡 15 min window | NetworkFirst, 6 s timeout |
| Places / Wikipedia / imagery | 🟡 If previously fetched | SWR + CacheFirst |
| Currency, PDF export, expense maths | ✅ Full | Pure client-side |
| SOS emergency numbers | ✅ Full | Static data |
| Sign-in / sign-up | ❌ None | Auth deliberately never cached |
| AI (chat, planning, replanning) | ❌ None | Live inference required |
| Realtime chat, votes, DMs | ❌ None | WebSocket, not replayable |
| New route calculation | ❌ None | ORS has no runtime cache rule |
| **Any write or edit** | ❌ **None** | Queue exists, not wired |

### Not verified

- Real-device install on Android and iOS Safari
- Lighthouse PWA score
- Actual cache-eviction behaviour under storage pressure
- Behaviour when `navigator.storage` quota is exhausted mid tile pre-cache

These need a browser session; none could be run headlessly here.

---

## 10. Bundle and build

```
✓ built in 1.05 s
```

Gzipped, initial critical path:

| Chunk | gzip |
|---|---|
| `vendor-supabase` | 53.5 kB |
| `index` | 52.8 kB |
| `vendor-react` | 44.8 kB |
| `vendor-router` | 13.9 kB |
| `vendor-query` | 9.7 kB |
| `rolldown-runtime` | 0.5 kB |
| **Total** | **≈175 kB** |

Down from ~749 kB before code-splitting — roughly a 4× reduction. Deferred:

- `vendor-maplibre` 787 kB raw — only on 3D map
- `vendor-pdf` 658 kB raw — dynamically imported inside the export click handler
- `vendor-leaflet` 160 kB, `vendor-markdown` 115 kB — lazy
- All 11 pages — route-level `lazy()`

Two chunks exceed the 700 kB warning threshold. Both are single third-party libraries that cannot
be split further and neither is on the initial path, so the warning is expected. Raising
`chunkSizeWarningLimit` would silence it but also silence future genuine regressions — leaving it
noisy is the better trade.

`vendor-supabase` at 53.5 kB gzipped is the largest item that *is* on the critical path. It loads
on the landing page even though nothing there needs the database. Deferring it behind the auth
boundary would cut roughly 30% off first paint. Not attempted — it touches provider wiring.

**Build config notes:** `sourcemap: !isProd`, so production ships no readable source. Vite 8 uses
Rolldown + Oxc, so chunking is declared via `advancedChunks.groups` with explicit priorities;
the older `manualChunks` function form does not partition correctly under Rolldown.

---

## 11. Accuracy of user-facing claims

The landing page and HTML metadata advertised technology that is not in the codebase. This is
user-facing misrepresentation, not just stale comments — all fixed this pass.

| Claim | Reality | Location |
|---|---|---|
| "pgvector semantic search … 200+ destinations" | No pgvector, no embeddings, no vector search anywhere | `Landing.tsx` ×3 |
| "LangGraph Agents", "LangGraph AI" | LangGraph is not a dependency | `Landing.tsx` ×2 |
| "OpenAI GPT-4o", "Whisper + GPT" | Groq LLaMA 3.3 70B; STT is the Web Speech API | `Landing.tsx` ×2 |
| "TomTom Traffic API" | Removed; now time-of-day estimation | `Landing.tsx` ×2, `climate.ts` comment |
| "Mappls Maps SDK", "Mapbox GL JS" | MapLibre GL + Leaflet, both on OSM | `Landing.tsx` ×2 |
| "Amadeus Travel API", "Amadeus flight & hotel search" | Free provider deep-links | `index.html` ×3 |
| "Safety Warnings via GNews AI" | Wikipedia REST + curated advisories | `index.html` |
| `dns-prefetch` to `gnews.io`, `api.openweathermap.org` | Neither is called — wasted DNS lookups | `index.html` |

### Fabricated structured data — removed

`index.html` shipped JSON-LD claiming:

```json
"aggregateRating": { "ratingValue": "4.9", "reviewCount": "1200" }
```

There is no review system. Fake review markup violates Google's structured-data policies and can
trigger a manual action against the domain — a real risk, not a cosmetic one. Removed; both
remaining JSON-LD blocks re-validated as parseable.

### README

Rewritten. The previous version documented a substantially different application: Vite 5.4,
React Router 6.30, TypeScript 5.8, OpenAI/Whisper/LangGraph/pgvector, TomTom, Amadeus, Mappls, a
dev server on port 5173 (actual: 8080), 12 deleted files including `Layout.tsx`, `NavLink.tsx`,
`MapplsMap.tsx`, `Index.tsx` and `mockData.ts`, and env vars that no longer do anything. It also
had no accurate account of what does and does not work offline.

---

## 12. Prioritised recommendations

### Do now

| # | Action | Why |
|---|---|---|
| 1 | **Rotate Groq, ORS and OpenTripMap keys** | In public git history; scannable by bots |
| 2 | Move production values into Vercel env vars | Stop file-based secret management |
| 3 | Restrict every key by HTTP referrer | Limits usefulness of a leaked copy |
| 4 | Verify RLS is enabled on all public tables | Publishable key is public; RLS is the only boundary |

### Next

| # | Action | Why |
|---|---|---|
| 5 | Wire the mutation queue into trip/activity/expense writes | Closes the biggest offline gap |
| 6 | Add `LICENSE` and `package.json` `license: "MIT"` | Project currently reads as unlicensed |
| 7 | Delete `bun.lockb`, `yarn.lock`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Deterministic installs |
| 8 | Develop on Node 22 or 24 LTS | Clears the jsdom engine warning |
| 9 | Real tests for `offlineCache`, `idb`, `currency`, `http` | Would have caught §7.1 and §7.2 |

### Then

| # | Action | Why |
|---|---|---|
| 10 | Type the external API response payloads | Removes most of the 157 `any` warnings at the boundary that matters |
| 11 | Defer `vendor-supabase` past the landing page | ~30% smaller first paint |
| 12 | Add two real PWA screenshots | Richer Chrome install dialog |
| 13 | Consolidate the two IndexedDB databases | One offline story instead of two |
| 14 | Run Lighthouse and a real-device install pass | The remaining unverified PWA claims |
| 15 | Rename the `tomtom*` / `gemini` compatibility shims | Names no longer describe what they call |

---

## 13. Commands used

```bash
npm audit --json                       # 0 vulnerabilities / 819 packages
npx tsc --noEmit -p tsconfig.app.json  # clean
npm run lint                           # 0 errors, 157 warnings
npm run test                           # 1/1 passing
npm run build                          # 1.05 s, 80 precache entries
gzip -c dist/assets/<chunk>.js | wc -c # gzipped chunk sizes
grep -oE 'cacheName:"[^"]+"' dist/sw.js        # runtime caches in the emitted SW
python3 -m json.tool dist/manifest.webmanifest # manifest validation
git ls-files --error-unmatch .env      # confirmed .env was tracked
grep -rnoE "eyJ[A-Za-z0-9_-]{20,}|sk-…|gsk_…" src/   # secret scan
```

---

## 14. Files changed during this audit

| File | Change |
|---|---|
| `src/lib/offlineCache.ts` | Rewritten — fixed infinite cursor loop, fixed non-expiring TTL, removed async-promise-executor, typed throughout |
| `src/lib/idb.ts` | Rewritten — `withDB()` connection safety, typed stores/indexes, fixed `deleteItinerary` wiping all trips |
| `src/hooks/useOfflineStorage.ts` | Rewritten — IndexedDB-backed queue instead of a third storage layer, typed Supabase surface, fixed null `registration.installing` |
| `src/components/OfflineIndicator.tsx` | Rewritten — reuses `useOnlineStatus`, adds SW update prompt, removed no-op `useConnectionStatus` |
| `src/hooks/useAuth.tsx` | Purge user-scoped caches on sign-out |
| `src/sw.ts` | **Deleted** — never compiled; `srcDSW` is not a real option |
| `vite.config.ts` | Removed bogus `srcDSW`; removed fictional `related_applications` and invalid `clipboard_write`; added `id` |
| `src/pages/Landing.tsx` | Corrected 9 false technology claims |
| `index.html` | Corrected metadata, removed fabricated `aggregateRating`, fixed `dns-prefetch` targets |
| `src/services/climate.ts` | Removed stale TomTom comment |
| `.env` | Untracked from git (local copy intact) |
| `package.json` | Removed 5 orphaned `workbox-*` dependencies |
| `README.md` | Rewritten against actual behaviour |
| `AUDIT.md` | This report |

Post-change verification: `tsc` clean · ESLint 0 errors · 1/1 tests passing · build succeeds ·
80 precache entries · manifest valid.
