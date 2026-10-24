# Radiator Routes Documentation

This directory contains the technical, research, operational, and intellectual-property
documentation for **Radiator Routes** (also referred to as **Atlas AI** in earlier
documents and interface copy).

The documents deliberately separate:

- **What the software implements** — supported by source code, schema, or tests.
- **What has been measured** — supported by a reproducible command or experiment.
- **What is proposed** — a research hypothesis, future implementation, or patent
  embodiment that must not be described as an existing product capability.

## Document map

| Document | Purpose | Audience |
|---|---|---|
| [`../README.md`](../README.md) | Installation, operation, architecture, feature reference, and deployment | Developers and users |
| [`REPORT.md`](./REPORT.md) | Full engineering project report and reflective evaluation | Supervisors and reviewers |
| [`RESEARCH.md`](./RESEARCH.md) | Prior-art map, novelty audit, literature review, and research plan | Researchers and patent counsel |
| [`RESEARCH_PAPER.md`](./RESEARCH_PAPER.md) | Structured manuscript draft suitable for refinement into a conference, journal, or capstone paper | Researchers and academic reviewers |
| [`PATENT_DISCLOSURE.md`](./PATENT_DISCLOSURE.md) | Confidentiality-conscious invention disclosure and claim-development brief | Inventors and patent counsel |
| [`PLATFORM_API.md`](./PLATFORM_API.md) | REST API, MCP endpoint, authentication, deployment, and operations | Integrators and operators |
| [`BACKLOG.md`](./BACKLOG.md) | Verified fixes, known limitations, and evidence gaps | Maintainers and evaluators |
| [`../AUDIT.md`](../AUDIT.md) | Security, dependency, build, PWA, and implementation audit | Maintainers and reviewers |
| [`../LICENSE`](../LICENSE) | Source-code license and third-party notices | Users and distributors |

## Suggested reading paths

### To run the system

1. Read [`../README.md`](../README.md) § Getting Started.
2. Configure the environment described in [`../README.md`](../README.md) § Environment Variables.
3. Apply the Supabase schema and migrations.
4. Run `npm run verify`.
5. Use [`PLATFORM_API.md`](./PLATFORM_API.md) only if external API or MCP access is required.

### To write a research paper

1. Start with [`RESEARCH_PAPER.md`](./RESEARCH_PAPER.md).
2. Check every result against its evidence status.
3. Use [`REPORT.md`](./REPORT.md) for implementation details and engineering reflection.
4. Use [`RESEARCH.md`](./RESEARCH.md) for prior art and references.
5. Add an actual evaluation dataset, baselines, statistical analysis, and ethics review
   before claiming empirical improvement.

### To explore patent protection

1. Read [`PATENT_DISCLOSURE.md`](./PATENT_DISCLOSURE.md).
2. Do not publicly disclose new embodiments, drawings, claim language, or experimental
   results before speaking with patent counsel.
3. Treat [`RESEARCH.md`](./RESEARCH.md) as a technical prior-art map, not a legal opinion.
4. Record conception dates, contributors, source commits, experiments, and public disclosures.
5. Have a registered patent agent or attorney perform a professional search and determine
   filing strategy and inventorship.

## Evidence policy

Documentation in this repository follows an evidence hierarchy:

1. **Runtime evidence** — observed on a supported device or deployment.
2. **Automated test evidence** — a passing test that exercises the stated behavior.
3. **Build and static evidence** — type checking, linting, bundle inspection, or schema review.
4. **Design intent** — an architecture or implementation description not yet verified at runtime.
5. **Hypothesis** — a proposed mechanism or expected research outcome.

Only levels 1–3 should be written as verified results. Levels 4–5 must be labelled
accordingly in papers, demonstrations, grant applications, and patent discussions.

## Naming and versioning

The repository name and current product name are **Radiator Routes**. Some historical
documents use **Atlas AI** because that was an earlier product name. Unless a document
explicitly describes historical work, “Radiator Routes” is the preferred name.

Each publication draft should record:

- repository URL and commit SHA;
- document version and date;
- runtime and dependency versions;
- dataset and prompt versions;
- evaluation protocol;
- known deviations from the deployed implementation.

This prevents a future paper from accidentally describing a different revision of the
software.
