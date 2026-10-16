<p align="center">
  <img src="assets/icon.png" alt="TraceForge Logo" width="96" />
</p>

# TraceForge

> **TraceForge connects code paths, commits, and historical failures to help developers find the real cause of regressions.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![FalkorDB](https://img.shields.io/badge/Graph_Database-FalkorDB-red.svg)](https://www.falkordb.com/)
[![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-orange.svg)](https://ai.google.dev/)

---

## 1. Product Decision & Core Thesis

When production regressions occur following a deployment, software engineers face a critical challenge: **error messages and logs point to surface symptoms, not the actual root cause.**

### Why Naive Keyword Search Fails
Standard lexical search (Grep, GitHub code search, Elasticsearch) matches tokens superficially. In an incident like an `HTTP 504 Gateway Timeout` on `/api/pay`:
- Keyword search inspects the incident report for words like *"timeout"* or *"rate limit"*, immediately flagging a surface decoy (`services/rateLimiter.js`).
- But `services/rateLimiter.js` is merely where callers wait; the true bottleneck is hidden **2 call hops deeper** in `services/tokenBucket.js:acquireTokenLock` (called via `services/auth.js:verifyToken`), where commit `8f2a1b9` introduced a synchronous blocking wait without a timeout.
- **Result:** Developers waste hours investigating healthy components while customer-facing downtime continues.

### The TraceForge Solution
TraceForge transforms repository analysis into a **connected knowledge graph**:
1. **Traces Call Graphs**: Traverses AST call relationships (`:SYMBOL_CALLS_SYMBOL`) starting from the API entrypoint (`server/routes/pay.js`).
2. **Correlates Commit Provenance**: Traverses `:COMMIT_CHANGED_FILE` and `:COMMIT_CHANGED_SYMBOL` to isolate exact symbols modified in recent commits.
3. **Recalls Historical Incident Memory**: Queries `:Bug` and `:Fix` nodes connected via `:FIX_RESOLVES_BUG` to surface identical past regressions and their verified remediations.
4. **Calculates Blast-Radius & Recovery**: Formulates non-destructive recovery proposals with blast-radius estimation.
5. **Persists Incident Outcomes**: Stores confirmed remediations back to FalkorDB for instantaneous recall in subsequent developer queries.

---

## 2. Technical Architecture & Hybrid Engine

TraceForge pairs a high-performance **FalkorDB** graph engine with **Repository Provider Adapters** and **Google Gemini** multi-tier failover reasoning to deliver enterprise repository intelligence.

```
                    ┌────────────────────────────────────────────────────────┐
                    │               Client (React 19 + Vite)                 │
                    │   Overview | Graph Memory | Incident Hub | Ask Drawer  │
                    └───────────────────────────┬────────────────────────────┘
                                                │ REST API
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │              Express 5 Application Server              │
                    │   server/routes: repository, incident, memory, ai      │
                    └───────────┬───────────────────┬────────────────┬───────┘
                                │                   │                │
                Cypher Retrieval│    Git Provider   │                │ Grounded Prompts
                                ▼    API (Octokit)  ▼                ▼
     ┌────────────────────────────┐ ┌──────────────────────┐ ┌───────────────────────────┐
     │ FalkorDB Graph Engine      │ │ Provider Adapters    │ │ Google Gemini Failover    │
     │ Client: falkordb           │ │ - GitHubAdapter      │ │ (gemini-3.8-flash ->      │
     │ openCypher Traversals      │ │ - MockAdapter        │ │  gemini-3.6-flash ->      │
     │ Call graphs & memories     │ │ Branches, PRs, Diffs │ │  gemini-3.5-flash-lite)   │
     └────────────────────────────┘ └──────────────────────┘ └───────────────────────────┘
```

### Connected Graph Schema

```
(:Repository)
   │
   ├──[:REPOSITORY_HAS_BRANCH]──────► (:Branch)
   ├──[:REPOSITORY_HAS_PR]──────────► (:PullRequest)
   ├──[:REPOSITORY_HAS_ISSUE]───────► (:Issue)
   ├──[:REPOSITORY_HAS_COMPONENT]───► (:Component)
   │                                        │
   │                                  [:COMPONENT_CONTAINS_FILE]
   │                                        │
   │                                        ▼
   ├──[:REPOSITORY_CONTAINS_FILE]───► (:File)
                                            │
                                      [:FILE_DEFINES_SYMBOL]
                                            │
                                            ▼
                                       (:Symbol) ◄──────[:SYMBOL_CALLS_SYMBOL]──────┐
                                            │                                      │
                                      [:COMMIT_CHANGED_SYMBOL]                     │
                                            ▲                                      │
                                            │                                      │
(:Commit) ────[:COMMIT_CHANGED_FILE]────────┤                                      │
   │                                                                               │
   │                                                                               │
(:Bug) ◄──────[:FIX_RESOLVES_BUG]──────── (:Fix)                                   │
   │                                                                               │
   └──────────[:BUG_AFFECTS_FILE]──────────► (:File) ──────────────────────────────┘
```

---

## 3. Flagship Workflows & Core Capabilities

TraceForge provides three target-aware investigation modes, backed by strict **Epistemic Truth Boundaries**:

### A. Target-Aware Pull Request Review
- **Unified Diff Parsing**: Ingests multi-file git diffs, hunk line additions/deletions, and branch metadata.
- **AST Symbol Mapping**: Projects touched line intervals directly onto AST symbols (`:Symbol`).
- **Upstream Regression Callers**: Traces inbound `:SYMBOL_CALLS_SYMBOL` edges across external files to isolate un-modified code paths susceptible to regressions.
- **Missing Test Coverage Audit**: Differentiates symbols with verified test callers from untested modifications.
- **Epistemic Truth Boundaries**: Enforces strict separation between:
  - `Observed Facts`: Scanned AST diff lines, mapped symbols, and static call sites.
  - `Inferred Hypotheses`: Potential regression callers and missing test alerts.
  - `Explicit Uncertainties`: Dynamically disclaims unexecuted test runners and unverified concurrency behavior.

### B. Issue Diagnosis Grounded in Institutional Memory
- **Contextual Token & Symbol Correlation**: Matches issue descriptions and stack traces with repository components and symbols.
- **Historical Remediation Recall**: Cypher queries against FalkorDB identify prior similar bugs and verified patches.
- **Root-Cause Hypothesis Ranking**: Recommends the highest-confidence component with candidate matrix transparency.

### C. Incident Causal Traversal & Controlled Edge Ablation
- **Multi-Hop Traversal**: From API entrypoint (`server/routes/pay.js`) $\to$ auth (`services/auth.js`) $\to$ token bucket lock (`services/tokenBucket.js:acquireTokenLock`).
- **Decoy Rejection**: Refutes surface decoys (`services/rateLimiter.js`) with deterministic mathematical scoring.
- **Non-Destructive Simulation**: Proposes rollback patches with blast-radius analysis before mutating code.
- **Controlled Read-Only Ablation**: Dynamically removes decisive graph edges to demonstrate that graph connectivity is causally necessary for diagnosis.

### D. Global Context-Aware Ask Drawer
- Mounts persistently across every tab in the application.
- Synchronizes with active repository context (active PR, active Issue, or active incident).
- Offers one-click quick prompt chips ("Audit regression risks in this PR", "Check missing tests", "Find historical fix precedents").

---

## 4. Quickstart

### Prerequisites
- **Node.js**: 18.0.0 or later
- **npm**: 9.0.0 or later
- **Docker**: For running the local FalkorDB instance
- **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/)

### 1. Launch FalkorDB via Docker
```bash
docker run -p 6379:6379 -d --name falkordb falkordb/falkordb:latest
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set the following variables in `.env`:
```env
# FalkorDB Configuration (Primary Graph Backend)
GRAPH_PROVIDER=falkordb
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_GRAPH=traceforge

# Gemini AI Key (for architectural reasoning)
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Run Development Server
```bash
npm run dev
```
- API Server: `http://localhost:5000`
- Web Client: `http://localhost:3000`

---

## 5. Five-Minute Hackathon Demo Script

Follow this script to deliver an impactful presentation to hackathon judges:

### Scene 1: Real-World Repository Overview (1:00)
1. Open `http://localhost:3000`. The browser displays **TraceForge** on the **Repository Overview** tab.
2. Note the repository switcher and identity card displaying live repository branches, open issues, and pull requests.
3. Locate **PR #12: "Implement non-blocking acquireTokenLock with timeout"** in the Active Pull Requests section.
4. Click **"Investigate"** on the PR card. Notice TraceForge transitions seamlessly to the **Incident Investigation** tab in **PR Review** mode.

### Scene 2: PR Review, Regression Callers & Test Coverage (1:15)
1. In PR Review mode, inspect the pre-flight analysis cards:
   - **Unified Git Diff**: Shows changes in `services/tokenBucket.js`.
   - **Regression Callers**: Flags external callers (`verifyToken` in `services/auth.js`) that invoke the modified symbol.
   - **Missing Test Coverage**: Flags whether tests cover modified symbols.
2. Point out the **Epistemic Truth Boundaries**:
   - `Observed Facts`: Static lines changed, mapped AST symbols, static callers discovered.
   - `Inferred Hypotheses`: Potential regression callers and test gaps.
   - `Explicit Uncertainties`: Honest declaration that Jest/Vitest test suites were not dynamically executed.

### Scene 3: Issue Diagnosis Grounded in Graph Memory (1:00)
1. Switch to **"Issue Diagnosis"** mode in the 3-mode segmented switcher.
2. Select **Issue #101: "Worker thread starvation under burst payment volume"**.
3. Observe how TraceForge correlates the issue text with repository symbols and recalls prior bug fixes from FalkorDB institutional memory.

### Scene 4: Incident Causal Graph & 2-Hop Ablation (1:00)
1. Switch to **"Bug / Anomaly"** mode.
2. Run the investigation on the Payment Gateway 504 Timeout cascade.
3. Show the **Candidate Matrix**:
   - Decoy `services/rateLimiter.js` is rejected (0-hop surface token match).
   - `services/tokenBucket.js:acquireTokenLock` is identified as the leading hypothesis 2 hops away.
4. Run the **Controlled Graph Ablation**: severing Hop 1 or Hop 2 drops confidence to `INSUFFICIENT_EVIDENCE`, proving that graph traversal is causally essential.

### Scene 5: Global Context-Aware Ask Drawer (0:45)
1. Click **"Ask TraceForge"** in the top navigation header.
2. The slide-over drawer opens with the active investigation context badge and quick prompt chips.
3. Ask a codebase question; Gemini synthesizes graph evidence, historical precedents, and code structure into an actionable answer.

---

## 6. Test Suite & Verification

TraceForge includes **137 comprehensive automated tests across 19 suites** with a 100% pass rate.

```bash
# Run the complete test suite (137 tests across 19 suites)
npm test

# Run unit and mock graph tests
npm run test:unit

# Run FalkorDB-specific tests
npm run test:falkordb

# Verify frontend production build
npm run build
```

### Test Coverage Highlights
- **Repository Isolation Suite**: Strictly guarantees zero state or fixture leakage between repositories (`acme/payment-gateway`, `ecommerce/order-service`, GitHub repos).
- **Target-Aware Investigation Suite**: Validates diff parsing, PR regression caller tracking, missing test discovery, and issue diagnosis across multiple repositories.
- **Epistemic Truth Safeguards**: Prevents unsupported claims (e.g. banning "True Root Cause" in favor of "Leading Root-Cause Hypothesis" and ensuring dynamic test execution is never fabricated).
- **Client Component Integrity**: Scans all client JSX files to verify that all icons and elements are declared, imported, and error-boundary protected.
- **Deterministic 2-Hop Ablation**: Proves that edge severing degrades confidence predictably.
- **Gemini Failover**: 12-case test suite verifying multi-model (`gemini-3.8-flash` $\to$ `gemini-3.6-flash` $\to$ `gemini-3.5-flash-lite`) and multi-key failover with credential redaction.

---

## 7. License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.