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

## 2. Technical Architecture & FalkorDB Graph Engine

TraceForge uses **FalkorDB** as its graph database engine, executing low-latency openCypher traversals with Redis-protocol compatibility.

```
                    ┌────────────────────────────────────────────────────────┐
                    │               Client (React 19 + Vite)                 │
                    │   Flagship Incident Investigation & Graph Explorer     │
                    └───────────────────────────┬────────────────────────────┘
                                                │ REST API
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │              Express 5 Application Server              │
                    │       server/index.js & server/routes/incident.js      │
                    └───────────┬────────────────────────────────┬───────────┘
                                │                                │
                Cypher Retrieval│                                │ Grounded Prompts
                                ▼                                ▼
    ┌──────────────────────┐                       ┌───────────────────────────┐
    │ FalkorDB Engine      │                       │ Google Gemini Failover    │
    │ Client: falkordb     │                       │ (gemini-3.8-flash ->      │
    │ openCypher Traversals│                       │  gemini-3.6-flash ->      │
    │ Redis Protocol       │                       │  gemini-3.5-flash-lite)   │
    └──────────────────────┘                       └───────────────────────────┘
```

### Graph Schema

```
(:Repository)
   │
   ├──[:REPOSITORY_HAS_COMPONENT]────► (:Component)
   │                                        │
   │                                  [:COMPONENT_CONTAINS_FILE]
   │                                        │
   │                                        ▼
   ├──[:REPOSITORY_CONTAINS_FILE]────► (:File)
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

## 3. Flagship Workflow

TraceForge's flagship workflow demonstrates graph superiority in 8 distinct steps:

1. **Deterministic Scenario Seeding**: Seeds an isolated synthetic repository scenario (`acme/payment-gateway`) in FalkorDB with call graphs, recent commits, and a historical mutex regression (`Worker Thread Lock Starvation under High Concurrency`).
2. **Regression Investigation**: Accepts an incident report with observable symptoms (`504 Gateway Timeout Cascade`).
3. **Keyword vs. Graph Comparison**:
   - **Naive Keyword Baseline**: Wrongly flags decoy `services/rateLimiter.js` (`checkRateLimit`, 0 hops).
   - **Graph-Native Traversal**: Correctly identifies `services/tokenBucket.js:acquireTokenLock` (2 hops away).
4. **Connected Evidence Chain**: Inspects the multi-hop path: `server/routes/pay.js` (`handlePaymentRequest`) $\to$ `services/auth.js` (`verifyToken`) $\to$ `services/tokenBucket.js` (`acquireTokenLock`), correlated with commit `8f2a1b9` and historical bug `"Worker Thread Lock Starvation under High Concurrency"`.
5. **Non-Destructive Recovery Simulation**: Reviews a safe circuit-breaker rollback proposal with blast-radius estimation (1 file affected).
6. **Confirmed Outcome Recording**: Persists the confirmed fix to FalkorDB as `:Fix` $\to$ `[:FIX_RESOLVES_BUG]` $\to$ `:Bug`.
7. **Fresh-Request Memory Recall**: Queries the codebase in **Ask Codebase** and verifies that the new resolution is instantly recalled.
8. **2-Hop Graph Ablation Proof**: Demonstrates that severing Hop 1 or Hop 2 in the graph materially alters evidence reachability and drops confidence from `HIGH` to `INSUFFICIENT_EVIDENCE`.

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

Follow this script to deliver an impactful, competition-grade presentation to hackathon judges:

### Scene 1: The Incident & The Naive Trap (1:00)
1. Open `http://localhost:3000`. The browser displays **TraceForge** with the **Incident Investigation** flagship tab open by default.
2. Click **"Seed Synthetic Scenario"**. Notice FalkorDB is idempotently seeded with `acme/payment-gateway`, AST call hierarchies, recent commit `8f2a1b9`, and historical bug memory.
3. Show the incident symptoms: *"HTTP 504 Gateway Timeout cascade on /api/pay immediately following deployment of commit 8f2a1b9"*.
4. Point out the surface suspect decoy: `services/rateLimiter.js`.

### Scene 2: The Graph Traversal Breakthrough (1:15)
1. Click **"Investigate Failure Chain"**.
2. Compare the side-by-side results:
   - **Left Panel (Keyword Search)**: Shows how standard grep fails. It flags `services/rateLimiter.js` simply because rate limiters deal with "timeouts".
   - **Right Panel (Graph-Native Traversal)**: FalkorDB identifies the **true root cause**: `services/tokenBucket.js:acquireTokenLock`.
3. Explain why: The API entrypoint `server/routes/pay.js` (`handlePaymentRequest`) calls `services/auth.js` (`verifyToken`), which in turn calls `services/tokenBucket.js` (`acquireTokenLock`). Commit `8f2a1b9` modified `tokenBucket.js`, introducing an unbounded synchronous blocking wait.

### Scene 3: Connected Evidence & Historical Memory (1:00)
1. Scroll down to the **Connected Graph Evidence Chain**.
2. Walk through the verified provenance nodes:
   - **Step 1**: Entrypoint `server/routes/pay.js:handlePaymentRequest`.
   - **Step 2**: Call hop 1 `services/auth.js:verifyToken`.
   - **Step 3**: Call hop 2 `services/tokenBucket.js:acquireTokenLock` (lines 2–6).
   - **Step 4**: Commit provenance `8f2a1b9` modifying `services/tokenBucket.js`.
   - **Step 5**: Historical incident match: `"Worker Thread Lock Starvation under High Concurrency"` (`acme/payment-gateway::bug::lock-starvation-01`), including its verified fix (*"Enforce non-blocking tryAcquire with circuit breaker timeout"*).

### Scene 4: Safe Recovery & Memory Persistence (0:45)
1. Click **"Simulate Recovery"**. Review the non-destructive patch proposal and blast radius (1 file affected).
2. Click **"Record to Graph"**. Show that the verified fix is stored in FalkorDB with a `FIX_RESOLVES_BUG` relationship.
3. Switch to the **Ask Codebase** tab. Ask: *"What caused the timeout in payment gateway?"*
4. Show that Gemini retrieves the newly persisted FalkorDB memory record as confirmed historical precedent.

### Scene 5: The Technical Proof - Graph Ablation (1:00)
1. Open the terminal or explain the automated regression test `test 20` (`tests/incident.investigation.test.js`):
   - Sever **Hop 1** (`server/routes/pay.js` $\to$ `services/auth.js`): FalkorDB traversal cannot reach the token bucket. Result: Confidence drops to `INSUFFICIENT_EVIDENCE`.
   - Sever **Hop 2** (`services/auth.js` $\to$ `services/tokenBucket.js`): Traversal reaches auth service but stops short of the modified commit. Result: Confidence drops to `INSUFFICIENT_EVIDENCE`.
   - Restore the edges: High-confidence root-cause discovery is immediately restored.
2. **Closing Punchline**: *"TraceForge proves that graph connectivity isn't just a database choice—it is the difference between a misleading surface decoy and the true root cause."*

---

## 6. Test Suite & Verification

TraceForge includes 96 comprehensive automated tests spanning unit logic, FalkorDB schema & retrieval, provider failover, and graph ablation.

```bash
# Run the complete test suite
npm test

# Run unit and mock graph tests
npm run test:unit

# Run FalkorDB-specific tests
npm run test:falkordb

# Verify frontend production build
npm run build
```

### Test Coverage Highlights
- **Determinism & Idempotence**: Verifies repeated seeding leaves exactly 1 incident bug and preserves canonical precedent.
- **Self-Referential Bug Prevention**: Verifies current incident reports cannot match themselves as historical bugs.
- **Provider Consistency**: Verifies pure FalkorDB graph engine provider operation without hardcoded credential leaks.
- **2-Hop Ablation Experiment**: Verifies that severing call relationships dynamically degrades diagnosis confidence from `HIGH` to `INSUFFICIENT_EVIDENCE`.
- **Gemini Failover**: 12-case test suite verifying multi-model (`gemini-3.8-flash` $\to$ `gemini-3.6-flash` $\to$ `gemini-3.5-flash-lite`) and multi-key failover with credential redaction.

---

## 7. License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.