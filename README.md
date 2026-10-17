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
     ┌────────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
     │ FalkorDB Graph Engine      │ │ Provider Adapters         │ │ Google Gemini Failover    │
     │ Client: falkordb           │ │ - GitHubAdapter           │ │ (gemini-3.8-flash ->      │
     │ openCypher Traversals      │ │ - GitLabAdapter           │ │  gemini-3.6-flash ->      │
     │ Call graphs & memories     │ │ - BitbucketAdapter        │ │  gemini-3.5-flash-lite)   │
     └────────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘
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

### 2.1 Production FalkorDB Cypher Queries

TraceForge relies exclusively on parameterized, bounded openCypher templates with strict `LIMIT` clauses. It never executes unvetted model-generated Cypher.

#### A. Schema Indexing & Uniqueness Constraints (`server/memory/falkordbSchema.js`)
```cypher
// Exact-match primary identifier indexes and uniqueness constraints (9 entity types)
CREATE INDEX FOR (n:Repository) ON (n.id);
CREATE INDEX FOR (n:File) ON (n.id);
CREATE INDEX FOR (n:Component) ON (n.id);
CREATE INDEX FOR (n:Symbol) ON (n.id);
CREATE INDEX FOR (n:Commit) ON (n.id);
CREATE INDEX FOR (n:Bug) ON (n.id);
CREATE INDEX FOR (n:Fix) ON (n.id);
CREATE INDEX FOR (n:TechnicalDecision) ON (n.id);
CREATE INDEX FOR (n:Test) ON (n.id);

// Bounded repository-scoped secondary indexes for multi-tenant isolation
CREATE INDEX FOR (n:File) ON (n.repoFullName);
CREATE INDEX FOR (n:Component) ON (n.repoFullName);
CREATE INDEX FOR (n:Symbol) ON (n.repoFullName);
CREATE INDEX FOR (n:Commit) ON (n.repoFullName);
CREATE INDEX FOR (n:Bug) ON (n.repoFullName);
CREATE INDEX FOR (n:Fix) ON (n.repoFullName);
```

#### B. Multi-Hop Symbol & Call Graph Traversal (`server/memory/falkordbRetrieval.js`)
```cypher
MATCH (s:Symbol { repoFullName: $repoFullName })
WITH s,
     size([kw IN $keywords WHERE
       toLower(s.name) CONTAINS kw OR
       toLower(s.filePath) CONTAINS kw
     ]) AS score
OPTIONAL MATCH (s)-[:SYMBOL_CALLS_SYMBOL]->(callee:Symbol)
OPTIONAL MATCH (caller:Symbol)-[:SYMBOL_CALLS_SYMBOL]->(s)
OPTIONAL MATCH (t:Test)-[:TEST_COVERS_SYMBOL]->(s)
OPTIONAL MATCH (cm:Commit)-[:COMMIT_CHANGED_SYMBOL]->(s)
RETURN s.id AS id,
       s.name AS name,
       s.kind AS kind,
       s.filePath AS filePath,
       s.startLine AS startLine,
       s.endLine AS endLine,
       s.parserPrecision AS parserPrecision,
       collect(DISTINCT callee.name)[0..6] AS callsSymbols,
       collect(DISTINCT caller.name)[0..6] AS calledBySymbols,
       collect(DISTINCT t.name)[0..5] AS coveredByTests,
       collect(DISTINCT cm.shortSha)[0..5] AS changedInCommits,
       score
ORDER BY score DESC, s.filePath ASC, s.startLine ASC
LIMIT $limit;
```

#### C. Historical Defect & Verified Fix Retrieval (`server/memory/falkordbRetrieval.js`)
```cypher
MATCH (b:Bug { repoFullName: $repoFullName })
OPTIONAL MATCH (b)-[:BUG_AFFECTS_COMPONENT]->(c:Component)
OPTIONAL MATCH (b)-[:BUG_AFFECTS_FILE]->(f:File)
OPTIONAL MATCH (fx:Fix)-[:FIX_RESOLVES_BUG]->(b)
OPTIONAL MATCH (fx)-[:FIX_APPLIED_IN_COMMIT]->(cm:Commit)
WITH b, c, f, fx, cm,
     size([kw IN $keywords WHERE
       toLower(coalesce(b.title, '')) CONTAINS kw OR
       toLower(coalesce(b.description, '')) CONTAINS kw OR
       toLower(coalesce(b.symptoms, '')) CONTAINS kw OR
       toLower(coalesce(b.filePath, '')) CONTAINS kw OR
       toLower(coalesce(c.path, '')) CONTAINS kw OR
       toLower(coalesce(fx.summary, '')) CONTAINS kw OR
       toLower(coalesce(fx.description, '')) CONTAINS kw
     ]) AS relevanceScore
RETURN b.id AS bugId,
       b.title AS title,
       b.description AS description,
       b.severity AS severity,
       b.status AS status,
       b.symptoms AS symptoms,
       coalesce(f.path, b.filePath) AS filePath,
       coalesce(c.path, b.componentPath) AS componentPath,
       fx.id AS fixId,
       fx.summary AS fixSummary,
       fx.description AS fixDescription,
       coalesce(cm.sha, fx.commitSha) AS commitSha,
       cm.shortSha AS commitShortSha,
       cm.role AS commitRole,
       cm.message AS commitMessage,
       b.introducedInCommit AS introducedInCommit,
       b.isResolution AS isResolution,
       b.incidentId AS incidentId,
       relevanceScore
ORDER BY relevanceScore DESC, b.createdAt DESC
LIMIT $limit;
```

#### D. Idempotent Bug & Remediation Ingestion (`server/memory/falkordbRetrieval.js`)
```cypher
MATCH (r:Repository { id: $repoId })
MERGE (b:Bug { id: $bug.id })
ON CREATE SET b.repoFullName = $repoFullName,
              b.title = $bug.title,
              b.description = $bug.description,
              b.severity = $bug.severity,
              b.status = $bug.status,
              b.symptoms = $bug.symptoms,
              b.filePath = $bug.filePath,
              b.componentPath = $bug.componentPath,
              b.createdAt = $now
MERGE (r)-[:REPOSITORY_HAS_BUG]->(b)
FOREACH (_ IN CASE WHEN $fix.id IS NOT NULL THEN [1] ELSE [] END |
  MERGE (fx:Fix { id: $fix.id })
  ON CREATE SET fx.repoFullName = $repoFullName,
                fx.summary = $fix.summary,
                fx.description = $fix.description,
                fx.commitSha = $fix.commitSha,
                fx.createdAt = $now
  MERGE (fx)-[:FIX_RESOLVES_BUG]->(b)
);
```

### 2.2 Core Graph Algorithms & Causal Reasoning

1. **Multi-Hop AST Breadth-First Call Traversal ($H \le 2$)**:
   Beginning at the incident entrypoint (`server/routes/pay.js`), TraceForge traverses forward along `:SYMBOL_CALLS_SYMBOL` edges. For each reachable node $v$, it records the distance hop, caller symbol, line range, and static parser precision.

2. **Mathematical Candidate Scoring Formula**:
   Candidates in the reachable execution subgraph are ranked objectively:
   $$\text{Score}(v) = 4 \cdot \mathbb{I}_{\text{commitTouched}}(v) + 3 \cdot \mathbb{I}_{\text{historicalDefect}}(v) + 2 \cdot \mathbb{I}_{\text{downstreamCallee}}(v)$$
   - $\mathbb{I}_{\text{commitTouched}}$: Symbol's containing file was modified by the suspected regression commit.
   - $\mathbb{I}_{\text{historicalDefect}}$: Symbol or component correlates with a previously resolved `:Bug` node in FalkorDB.
   - $\mathbb{I}_{\text{downstreamCallee}}$: Node is a transitive callee rather than the outer HTTP handler.

3. **Decoy Refutation Algorithm**:
   Lexical keyword search selects candidates based on superficial word frequency (matching *"rate limit"*, *"504"*, *"timeout"* to `services/rateLimiter.js`). TraceForge's graph algorithm verifies whether that candidate is a dead-end or merely where callers wait, identifying the true blocking condition 2 hops away in `services/tokenBucket.js:acquireTokenLock`.

4. **Controlled Read-Only Causal Edge Ablation**:
   To prove that graph connectivity is causally necessary, TraceForge includes an ablation harness. Severing the causal call edge (`verifyToken` $\to$ `acquireTokenLock`) drops candidate confidence from `HIGH` to `INSUFFICIENT_EVIDENCE`, demonstrating that graph connectivity—not hardcoded heuristics—drives the diagnosis.

5. **Non-Destructive Blast-Radius Recovery Simulation**:
   Before proposing a rollback or patch, TraceForge traverses upstream `:SYMBOL_CALLS_SYMBOL` and `:COMPONENT_DEPENDS_ON_COMPONENT` edges to compute affected dependents and recommend safe remediation with zero disk mutation.

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

### 1. Launch FalkorDB (Local Docker or FalkorDB Cloud)

#### Option A: Local Instance via Docker
```bash
docker run -p 6379:6379 -d --name falkordb falkordb/falkordb:latest
```

#### Option B: FalkorDB Cloud
Sign up at [FalkorDB Cloud](https://app.falkordb.cloud/), create a database instance, and copy your connection URL (e.g., `falkors://default:password@your-instance.falkordb.cloud:6379`).

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
# For Local Docker:
GRAPH_DATABASE_PROVIDER=falkordb
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_GRAPH=traceforge

# OR for FalkorDB Cloud / Vercel:
# FALKORDB_URL=falkors://default:your_password@your-instance.falkordb.cloud:6379

# Google Gemini API Key (for architectural reasoning & failover)
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Secondary keys for multi-key failover
# GEMINI_API_KEY_2=your_secondary_key_here
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
2. Note the repository switcher and identity card displaying live repository branches, open issues, and pull requests across GitHub, GitLab, and Bitbucket.
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

TraceForge includes **176 comprehensive automated tests across 26 suites** with a 100% pass rate.

```bash
# Run the complete test suite (176 tests across 26 suites)
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