# Radiator Routes — Invention Disclosure and Patent-Preparation Brief

**Status:** Technical disclosure draft; not a patent application  
**Version:** 0.1  
**Date:** 24 October 2026  
**Inventor candidate:** Harsh Tambade  
**Repository:** <https://github.com/HarshTambade/Radiator-Routes>

> **Confidentiality and legal notice:** This document is not legal advice, a patentability
> opinion, a freedom-to-operate opinion, or a filing-ready specification. The repository
> is public, so this document must not be treated as confidential once committed. A
> registered patent agent or attorney must determine inventorship, claim scope, filing
> sequence, jurisdictions, ownership, and disclosure consequences.

## 1. Purpose

This brief records technical subject matter that may be useful for a professional patent
assessment. It is intentionally narrower than marketing documentation. It identifies:

- the concrete problem addressed;
- the implemented system and method;
- alternative embodiments;
- technical effects that can be tested;
- known prior-art pressure;
- subject matter that should not be claimed without further work.

The current strongest candidate is a **connectivity-resilient planning composition**:
persisted trip context, trip-scoped geospatial cache, optional browser-local inference,
deterministic itinerary verification, and durable recovery of selected edits. Each
ingredient may be known independently. Patentability, if any, would depend on the
specific combination, implementation, technical effect, and claim construction.

## 2. Problem addressed

Conventional conversational itinerary systems commonly depend on a remote model and
render its response directly. This creates four technical failures:

1. a syntactically valid itinerary can violate time, distance, budget, or opening-hour
   constraints;
2. a user cannot inspect how conflicting group preferences affected the selected plan;
3. a saved plan may be inaccessible when connectivity is lost;
4. an offline edit may be discarded or overwrite a newer server edit when connectivity
   returns.

The disclosed system addresses these failures in a browser-deployed environment with
limited local compute, intermittent connectivity, and optional remote services.

## 3. Implemented system

### 3.1 Components

1. **Input and preference module**  
   Receives natural-language, voice, or form-based trip requirements and stores
   member-specific preferences.

2. **Capability-gated inference dispatcher**  
   Selects a hosted provider through an authenticated proxy or a locally cached,
   WebGPU-capable model through a worker. Both providers implement a common planning
   contract.

3. **Structured itinerary generator**  
   Requests a typed itinerary with activities, timestamps, coordinates, costs, and
   opening-hour evidence.

4. **Deterministic verification module**  
   Computes independent checks over the generated object, returning machine-readable
   violation codes and severity.

5. **Bounded repair module**  
   Converts violations into a targeted repair instruction, requests one replacement,
   compares verification results, and retains the original if the replacement is not
   better.

6. **Group aggregation module**  
   Computes member utilities and selects a candidate using the maximum member regret
   (Least Misery), exposing per-member trade-offs.

7. **Offline persistence module**  
   Stores trip state in IndexedDB, caches relevant application resources and map tiles,
   and optionally stores local model assets in browser-managed caches.

8. **Mutation recovery module**  
   Queues selected offline edits with monotonic sequence numbers and expected server
   version timestamps. On reconnect it replays in order and reports a conflict when
   the expected version no longer matches.

### 3.2 Implemented source locations

| Technical element | Implementation |
|---|---|
| Provider capability and dispatch | `src/lib/aiProvider.ts`, `src/services/gemini.ts` |
| Local model lifecycle | `src/services/webllm.ts`, `src/services/webllmWorker.ts` |
| Verification | `src/lib/itineraryVerifier.ts` |
| Repair | `src/lib/planRepair.ts` |
| Group utility | `src/lib/groupRegret.ts`, `src/lib/travelPreferences.ts` |
| Offline trip state | `src/services/offlineTrip.ts`, `src/lib/offlineCache.ts` |
| Mutation queue | `src/lib/offlineMutation.ts`, `src/hooks/useOfflineSync.ts` |
| Server persistence and access control | `supabase/` |

## 4. Method of operation

### 4.1 Online preparation

1. Receive a destination, date range, budget, party, and preferences.
2. Resolve a destination anchor and identify the trip's relevant map region.
3. Persist trip and itinerary state locally.
4. Pre-cache a bounded set of map tiles and application resources.
5. Optionally download a user-selected local model.

### 4.2 Plan generation

1. Select a provider based on user choice and device capability.
2. Generate a structured candidate itinerary.
3. Parse the candidate into the application contract.
4. Run deterministic checks independently of the model's self-assessment.
5. If hard violations exist, create one targeted repair request.
6. Generate and verify a replacement.
7. Accept the replacement only when it meets the configured improvement rule;
   otherwise retain the original and disclose the violations.
8. For multiple candidates, compute utilities for each group member and select the
   candidate minimising the maximum member regret.

### 4.3 Offline operation and recovery

1. Serve the application shell from the service worker.
2. Read the persisted itinerary from IndexedDB.
3. Render only map tiles and external data already cached.
4. Use local inference if the model and browser capability are available.
5. Queue supported edits with a sequence number and expected `updated_at`.
6. On reconnect, replay edits in sequence order.
7. If the server version differs from the expected version, reject the stale mutation,
   preserve the local record for inspection, and notify the user.

## 5. Potential technical effects

The following are testable effects, not established results:

- fewer hard constraint violations reaching the user-visible itinerary;
- fewer silent losses of offline edits;
- deterministic detection of concurrent write conflicts;
- reduced prompt egress in local mode;
- continued access to saved trip context during network loss;
- lower maximum member regret relative to arbitrary candidate selection;
- reduced UI blocking through worker-based local inference.

An eventual application should support each effect with an experiment and comparative
baseline. Do not claim a technical effect solely because the corresponding code exists.

## 6. Candidate claim concepts for counsel

These are discussion prompts, not claims to file.

### Concept A — connectivity-resilient planning system

A computer-implemented system comprising:

- a trip-state store that persists itinerary context and geospatial resources locally;
- a dispatcher selecting between remote and local language-model execution according to
  device capability and connectivity;
- a structured itinerary verifier that evaluates generated activities against temporal,
  spatial, cost, and provenance-aware availability constraints; and
- a recovery controller that requests a bounded repair and commits a candidate only when
  the verification result satisfies an improvement condition.

**Pressure points:** offline map caching, local inference, itinerary generation, and
external verification each have substantial prior-art exposure. Counsel must determine
whether the claimed arrangement has a non-obvious technical interaction and whether the
specification enables more than this implementation.

### Concept B — conflict-aware offline mutation recovery

A method that assigns a persistent sequence to offline mutations, records the server
version expected by each mutation, replays mutations in sequence after reconnection, and
turns a version mismatch into an explicit user-visible conflict rather than silently
overwriting the newer server state.

**Pressure points:** offline queues, optimistic concurrency, and conflict detection are
well-known. The travel-specific composition is likely weak by itself. It may be useful
as a dependent embodiment only if a concrete technical interaction is demonstrated.

### Concept C — provenance-aware itinerary verification

A method that assigns different enforcement severity to an availability constraint based
on the provenance and confidence of the opening-hours record, allowing authoritative
records to block a plan while model-supplied records produce warnings pending
confirmation.

**Pressure points:** provenance-aware validation may be useful, but counsel must compare
it with data-quality and rule-engine prior art. The claim should identify a technical
decision procedure, not merely “show a warning.”

### Concept D — preference-computed group selection

A method that computes member utility from stored preference vectors, derives each
member's regret against the best candidate in a generated candidate set, and selects the
candidate minimising the maximum regret while exposing the per-member contribution.

**Pressure points:** Least Misery and group recommendation are established concepts.
The application alone is unlikely to establish broad novelty. Treat this primarily as a
research contribution unless counsel identifies a narrower technical implementation.

### 7.1 Non-filing claim skeletons for counsel

The following language is intentionally incomplete and should be treated only as a
conversation aid. It is not a claim set and must not be copied into a filing without
claim construction, prior-art analysis, and an enablement review.

**System skeleton:** A computer-implemented planning system comprising a local trip
state store, a remote-or-local inference dispatcher, a structured itinerary verifier,
and a recovery controller configured to compare verification results before committing
an itinerary candidate.

**Method skeleton:** A method comprising persisting trip context and geospatial
resources, generating a structured itinerary using a selected inference provider,
computing independent temporal, spatial, cost, and availability predicates, generating
one bounded repair request when a predicate fails, and committing a replacement only
when the replacement satisfies an improvement condition.

**Conflict-recovery skeleton:** A method comprising assigning ordered identifiers to
offline mutations, storing an expected server revision, replaying mutations after
reconnection in identifier order, and converting a revision mismatch into an explicit
conflict state without overwriting the newer server record.

Counsel should decide whether these concepts belong in one application, separate
applications, dependent claims, or nowhere after reviewing the prior art.

## 8. Alternative embodiments to document

Before counsel evaluates claim scope, record variations that are actually implemented or
could be enabled without changing the inventive concept:

- a native mobile client instead of a PWA;
- a local model supplied by a platform model runtime rather than WebLLM;
- vector tiles, raster tiles, or a compact route graph;
- a constraint solver replacing heuristic distance checks;
- a multi-pass repair budget with an explicit termination policy;
- signed or versioned opening-hour records;
- a CRDT or server-issued revision token replacing `updated_at`;
- weather, accessibility, or safety constraints treated as typed predicates;
- a federated or privacy-preserving preference aggregation path;
- a local-only deployment with no remote inference at all.

An alternative should be included in a future specification only if the inventors can
explain how to implement it and why it preserves the technical effect.

## 8. Known prior-art and subject-matter risks

The repository's [`RESEARCH.md`](./RESEARCH.md) identifies public references in:

- personalised itinerary generation;
- group travel recommendation;
- tourist trip design and time-window optimisation;
- offline map and tile caching;
- on-device machine learning;
- LLM planning and external verification;
- group recommendation and regret aggregation.

The following should not be presented as new without a professional search:

- “an AI travel planner”;
- “generating an itinerary from preferences”;
- “caching maps for offline use”;
- “using a language model on a device”;
- “checking budget and time constraints”;
- “minimising group regret”;
- “using a queue to sync offline edits.”

Potential patentable subject matter, if any, is more likely to reside in a narrowly
specified interaction among these components and a demonstrated technical result.

## 9. Disclosure and filing checklist

Before any new public release, paper, presentation, video, demo, or thesis submission:

- identify every contributor to conception and implementation;
- preserve commit SHAs and dated design records;
- list what was publicly disclosed and when;
- separate pre-existing open-source components from new work;
- collect experiments supporting each alleged technical effect;
- remove API keys, personal data, and private deployment identifiers;
- ask patent counsel whether a priority filing should precede publication;
- confirm ownership, employer/university obligations, and inventor declarations;
- obtain a professional novelty and freedom-to-operate search.

Public repository history is evidence of disclosure. Do not assume that changing or
deleting a file removes its effect.

## 10. Patent-safe research writing

Until counsel advises otherwise:

- describe the work as an implemented research artifact, not a granted invention;
- use “we implement” for code-backed facts;
- use “we hypothesise” for unmeasured effects;
- cite prior art for standard components;
- avoid “first,” “novel,” “patentable,” and “unique” unless supported by counsel and a
  documented search;
- do not add confidential embodiments to this public repository;
- publish the evaluation only after confirming its impact on filing strategy.

## 11. Records to maintain

Create and retain, outside the public repository where appropriate:

| Record | Why it matters |
|---|---|
| dated invention notebook | conception and reduction-to-practice chronology |
| architecture diagrams | enablement and embodiment support |
| source commit hashes | implementation provenance |
| experiment logs | technical-effect evidence |
| contributor statements | inventorship analysis |
| prior-art search log | claim drafting and counsel review |
| disclosure register | novelty and filing deadlines |
| deployment/configuration manifests | reproducibility |

## 12. Bottom line

Radiator Routes contains a defensible engineering story and several research questions.
It does not, by itself, establish patentability. The most responsible next action is
to freeze a reproducible implementation, run the evaluation in
[`RESEARCH_PAPER.md`](./RESEARCH_PAPER.md), and take the resulting technical record to a
qualified patent professional before making further public disclosures.
