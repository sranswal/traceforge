/**
 * FailureChain Phase 5 & 5.1: Incident Investigation API Router
 * Endpoints:
 * - GET  /api/incident/seed         - Read-only inspection of the synthetic incident scenario (no state mutation)
 * - POST /api/incident/seed         - State-changing idempotent seeding of the scenario into the active graph
 * - POST /api/incident/investigate  - Executes graph-native multi-hop investigation vs keyword baseline
 * - POST /api/incident/simulate     - Safely simulates recovery without modifying the filesystem, git, or production
 * - POST /api/incident/record       - Persists confirmed resolution to canonical graph memory
 */

import express from 'express';
import {
  SYNTHETIC_INCIDENT_FIXTURE,
  runIncidentInvestigation,
  simulateIncidentRecovery,
  recordInvestigationOutcome
} from '../ai/investigation.js';
import {
  ingestRepositoryToGraph,
  recordMemoryEntry,
  retrieveGraphContext
} from '../memory/graphProvider.js';
import { runQuery as runFalkorDBQuery, sanitizeErrorMessage as sanitizeFalkorDBError } from '../db/falkordb.js';

export const incidentRouter = express.Router();

function sanitizeAnyError(msg) {
  return sanitizeFalkorDBError(msg);
}

/**
 * GET /api/incident/seed
 * Strictly read-only: returns the synthetic incident scenario fixture without mutating the database.
 */
incidentRouter.get('/seed', (req, res) => {
  const fixture = SYNTHETIC_INCIDENT_FIXTURE;
  return res.json({
    success: true,
    seeded: false,
    incident: fixture.incidentReport,
    repository: fixture.repository,
    misleadingSurfaceSuspect: fixture.incidentReport.suspectedComponent,
    fixture
  });
});

/**
 * POST /api/incident/seed
 * State-changing seeding endpoint: Idempotently ingests the synthetic repository and seeds the prior bug.
 * Strictly repository-scoped to prevent accidental mutation of unrelated repositories.
 */
incidentRouter.post('/seed', async (req, res) => {
  try {
    const fixture = SYNTHETIC_INCIDENT_FIXTURE;
    const repoTarget = fixture.repository.fullName; // 'acme/payment-gateway'

    // Clean up stale self-recorded incident bugs or orphaned empty commits for this fixture
    try {
      const queryRunner = runFalkorDBQuery;

      const priorBugTitle = fixture.priorBug.bugTitle;
      // Clean up any stale incident resolution bugs or old contradictory Bug nodes for this repo
      await queryRunner(
        `MATCH (b:Bug { repoFullName: $repoTarget })
         WHERE b.title <> $priorBugTitle OR b.id CONTAINS 'resolution-'
         OPTIONAL MATCH (fx:Fix)-[:FIX_RESOLVES_BUG]->(b)
         DETACH DELETE fx, b`,
        { repoTarget, priorBugTitle }
      );
      // Clean up any contradictory fix-commit links where 8f2a1b9 was falsely linked as a fix commit
      await queryRunner(
        `MATCH (fx:Fix { repoFullName: $repoTarget })-[r:FIX_APPLIED_IN_COMMIT]->(cm:Commit)
         WHERE cm.sha STARTS WITH '8f2a1b9' OR cm.shortSha = '8f2a1b9'
         DELETE r`,
        { repoTarget }
      );
      // Clean up prior instance of canonical priorBug to ensure clean idempotent single node
      await queryRunner(
        `MATCH (b:Bug { repoFullName: $repoTarget, title: $priorBugTitle })
         OPTIONAL MATCH (fx:Fix)-[:FIX_RESOLVES_BUG]->(b)
         DETACH DELETE fx, b`,
        { repoTarget, priorBugTitle }
      );
      // Clean up orphaned empty commits
      await queryRunner(
        `MATCH (cm:Commit { repoFullName: $repoTarget })
         WHERE (cm.sha = '8f2a1b9' OR cm.shortSha = '8f2a1b9')
           AND NOT (cm)-[:COMMIT_CHANGED_FILE]->()
         DETACH DELETE cm`,
        { repoTarget }
      );
    } catch {
      // Best-effort cleanup
    }

    // 1. Idempotently ingest repository analysis into active graph
    await ingestRepositoryToGraph(
      {
        repository: fixture.repository,
        projectType: fixture.projectType,
        architecture: fixture.architecture,
        structure: fixture.structure,
        aiContextReady: fixture.aiContextReady
      },
      {
        sourceContents: fixture.sourceContents,
        commits: fixture.commits
      }
    );

    // 2. Idempotently seed prior historical bug & fix in graph
    await recordMemoryEntry({
      ...fixture.priorBug,
      repoFullName: repoTarget
    });

    return res.json({
      success: true,
      seeded: true,
      repository: fixture.repository,
      incident: fixture.incidentReport,
      misleadingSurfaceSuspect: fixture.incidentReport.suspectedComponent,
      fixture
    });
  } catch (err) {
    return res.status(500).json({ error: sanitizeAnyError(err.message) });
  }
});

/**
 * POST /api/incident/investigate
 * Runs connected graph multi-hop investigation comparing against keyword search baseline.
 */
incidentRouter.post('/investigate', async (req, res) => {
  try {
    const { report, analysis } = req.body || {};
    if (!report || typeof report !== 'object') {
      return res.status(400).json({ error: 'Incident report payload object is required.' });
    }
    if (!report.title || !String(report.title).trim()) {
      return res.status(400).json({ error: 'Incident report "title" is required.' });
    }

    const repoFullName = report.repoFullName || analysis?.repository?.fullName || '';
    if (!repoFullName || !repoFullName.includes('/')) {
      return res.status(400).json({ error: 'Valid repository fullName (e.g. "owner/repo") is required.' });
    }

    const effectiveAnalysis = (analysis?.aiContextReady?.filePaths?.length)
      ? analysis
      : (repoFullName === SYNTHETIC_INCIDENT_FIXTURE.repository.fullName
          ? SYNTHETIC_INCIDENT_FIXTURE
          : analysis);

    const investigation = await runIncidentInvestigation(report, effectiveAnalysis);
    return res.json(investigation);
  } catch (err) {
    return res.status(500).json({ error: sanitizeAnyError(err.message) });
  }
});

/**
 * POST /api/incident/simulate
 * Simulates recovery action proposal without modifying real code or production systems.
 */
incidentRouter.post('/simulate', async (req, res) => {
  try {
    const { investigation, action } = req.body || {};
    if (!investigation || typeof investigation !== 'object') {
      return res.status(400).json({ error: 'Investigation outcome object is required to simulate recovery.' });
    }
    if (!investigation.repoFullName || !investigation.repoFullName.includes('/')) {
      return res.status(400).json({ error: 'Investigation object must contain a valid repoFullName.' });
    }

    const simulation = simulateIncidentRecovery(investigation, action || 'revert_commit');
    if (!simulation.simulated) {
      return res.status(400).json({
        error: simulation.error || 'Cannot simulate recovery: investigation outcome lacks a verified root-cause target.',
        simulation
      });
    }
    return res.json(simulation);
  } catch (err) {
    return res.status(500).json({ error: sanitizeAnyError(err.message) });
  }
});

/**
 * POST /api/incident/record
 * Persists the confirmed incident resolution to graph memory for future recall.
 */
incidentRouter.post('/record', async (req, res) => {
  try {
    const { investigation } = req.body || {};
    if (!investigation || typeof investigation !== 'object') {
      return res.status(400).json({ error: 'Valid investigation outcome object is required.' });
    }
    if (!investigation.repoFullName || !investigation.repoFullName.includes('/')) {
      return res.status(400).json({ error: 'Valid investigation outcome with repoFullName (owner/repo) is required.' });
    }
    const rootCause = investigation.recoveryRecommendation?.targetFile || investigation.diagnosis?.rootCauseFile;
    if (!rootCause || rootCause === 'unknown') {
      return res.status(400).json({
        error: 'Cannot record resolution: investigation outcome does not contain a verified root-cause target file (INSUFFICIENT_EVIDENCE).'
      });
    }

    const recorded = await recordInvestigationOutcome(investigation);
    return res.status(201).json({
      ...recorded,
      evidenceType: 'historical_resolution_proposal',
      implementationStatus: 'unverified_in_current_runtime',
      verificationStatus: 'Recorded investigation resolution; live runtime execution unverified.'
    });
  } catch (err) {
    return res.status(500).json({ error: sanitizeAnyError(err.message) });
  }
});

/**
 * GET /api/incident/recall
 * Explicit incident memory recall endpoint: retrieves recorded incident resolutions and prior bug/fix
 * evidence from canonical graph memory strictly scoped to the repository.
 */
incidentRouter.get('/recall', async (req, res) => {
  try {
    const repo = String(req.query.repo || SYNTHETIC_INCIDENT_FIXTURE.repository.fullName).trim();
    if (!repo || !repo.includes('/')) {
      return res.status(400).json({ error: 'Valid repository fullName (e.g. "owner/repo") is required.' });
    }
    const question = String(req.query.q || 'lock starvation timeout token bucket').trim();
    const context = await retrieveGraphContext(repo, question);

    const recalledBugs = context.bugsAndFixes || [];
    const precedent = recalledBugs.find(b =>
      !b.isResolution &&
      ((b.filePath && b.filePath.includes('tokenBucket')) ||
      (b.fixSummary && b.fixSummary.includes('circuit breaker')) ||
      (b.title && b.title.includes('Lock Starvation')))
    ) || recalledBugs.find(b =>
      (b.filePath && b.filePath.includes('tokenBucket')) ||
      (b.fixSummary && b.fixSummary.includes('circuit breaker')) ||
      (b.title && b.title.includes('Lock Starvation')) ||
      (b.title && b.title.includes('504'))
    ) || recalledBugs[0] || null;

    return res.json({
      success: true,
      repoFullName: repo,
      available: Boolean(context.available),
      hasEvidence: Boolean(context.hasEvidence),
      bugsAndFixes: recalledBugs,
      recalledFix: precedent ? {
        bugId: precedent.bugId,
        title: precedent.title,
        severity: precedent.severity,
        status: precedent.status,
        filePath: precedent.filePath,
        fixSummary: precedent.fixSummary,
        fixDescription: precedent.fixDescription,
        commitSha: precedent.commitSha,
        commitShortSha: precedent.commitShortSha || (precedent.commitSha ? precedent.commitSha.slice(0, 7) : null),
        commitRole: precedent.commitRole || (precedent.commitSha ? 'historical_fix' : null),
        introducedInCommit: precedent.introducedInCommit || null,
        provenance: 'FalkorDB Canonical Graph Memory (FIX_RESOLVES_BUG)',
        evidenceType: 'historical_fix_precedent',
        remediationCategory: 'Recorded Historical Remediation',
        implementationStatus: 'unverified_in_current_runtime',
        verificationStatus: 'Historical fix precedent recorded; current implementation not yet verified in live runtime.',
        verificationNote: 'This record is a historical fix precedent retrieved from graph memory. While the remediation pattern resolved a prior incident, the current repository implementation has not yet been verified or executed in a live runtime.'
      } : null
    });
  } catch (err) {
    return res.status(500).json({ error: sanitizeAnyError(err.message) });
  }
});

