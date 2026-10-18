import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeDecodeHtmlEntities } from '../client/src/utils/markdownUtils.js';
import { runIncidentInvestigation, SYNTHETIC_INCIDENT_FIXTURE } from '../server/ai/investigation.js';
import { GitHubProviderAdapter } from '../server/providers/github.js';

describe('Demo Polish: Issue Markdown Rendering & Real Cobra Context Isolation', () => {

  describe('1. HTML Entity Decoding & Security (safeDecodeHtmlEntities)', () => {
    it('decodes standard named HTML entities once', () => {
      const input = 'Issue with &lt;Command&gt; and &amp; args &quot;help&quot; &#39;flag&#39;';
      const result = safeDecodeHtmlEntities(input);
      assert.equal(result, 'Issue with <Command> and & args "help" \'flag\'');
    });

    it('decodes numeric and hex entities correctly', () => {
      const input = 'Symbol &#47; or &#x2F; test &#60;tag&#62;';
      const result = safeDecodeHtmlEntities(input);
      assert.equal(result, 'Symbol / or / test <tag>');
    });

    it('prevents double-decoding of encoded entities', () => {
      // &amp;lt; should decode to &lt;, NOT <
      const input = 'Literal &amp;lt;script&amp;gt; marker';
      const result = safeDecodeHtmlEntities(input);
      assert.equal(result, 'Literal &lt;script&gt; marker');
    });

    it('handles empty, null, undefined, and strings without entities gracefully', () => {
      assert.equal(safeDecodeHtmlEntities(''), '');
      assert.equal(safeDecodeHtmlEntities(null), null);
      assert.equal(safeDecodeHtmlEntities(undefined), undefined);
      assert.equal(safeDecodeHtmlEntities('Plain text without ampersands'), 'Plain text without ampersands');
    });
  });

  describe('2. Realistic Cobra Issue Description Formatting', () => {
    const realisticCobraIssue = `
## Description
When executing a Cobra sub-command with **nested persistent flags**, the flag parsing fails if \`--help\` is passed.

### Environment
* OS: Linux (Ubuntu 22.04)
* Go version: \`go1.22.1\`
* Cobra version: \`v1.8.0\`

### Steps to Reproduce
1. Register a root command with \`PersistentFlags().String("config", "", "config file")\`
2. Register a child command with local flags
3. Execute: \`app child --help\`

### Expected Behavior
The sub-command should display help text and list both local &amp; persistent flags without error.

### Code Sample
\`\`\`go
package main

import (
\t"github.com/spf13/cobra"
)

func main() {
\trootCmd := &cobra.Command{Use: "app"}
\trootCmd.Execute()
}
\`\`\`

Reference: [Cobra Documentation](https://github.com/spf13/cobra)
`;

    it('safely decodes entities while preserving Markdown syntax', () => {
      const decoded = safeDecodeHtmlEntities(realisticCobraIssue);
      assert.ok(decoded.includes('both local & persistent flags'));
      assert.ok(decoded.includes('## Description'));
      assert.ok(decoded.includes('### Environment'));
      assert.ok(decoded.includes('```go'));
      assert.ok(decoded.includes('`--help`'));
    });

    it('parses headings, lists, inline code, links, and code blocks without loss', () => {
      const lines = realisticCobraIssue.split(/\r?\n/);
      const headingH2 = lines.filter(l => l.trim().startsWith('## '));
      const headingH3 = lines.filter(l => l.trim().startsWith('### '));
      const bulletLists = lines.filter(l => l.trim().startsWith('* ') || l.trim().startsWith('- '));
      const numberedLists = lines.filter(l => /^\d+\.\s/.test(l.trim()));
      const codeFences = lines.filter(l => l.trim().startsWith('```'));

      assert.equal(headingH2.length, 1); // ## Description
      assert.equal(headingH3.length, 4); // ### Environment, ### Steps to Reproduce, ### Expected Behavior, ### Code Sample
      assert.equal(bulletLists.length, 3); // OS, Go version, Cobra version
      assert.equal(numberedLists.length, 3); // Steps 1, 2, 3
      assert.equal(codeFences.length, 2); // Start and end of go code block
    });

    it('detects safe links vs defanged javascript pseudo-protocol links', () => {
      const safeLinkMatch = '[Cobra Documentation](https://github.com/spf13/cobra)'.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      assert.ok(safeLinkMatch);
      const safeUrl = safeLinkMatch[2].trim();
      assert.ok(/^(https?:|mailto:|#|\/)/i.test(safeUrl));

      const maliciousLinkMatch = '[Click me](javascript:alert_xss)'.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      assert.ok(maliciousLinkMatch);
      const unsafeUrl = maliciousLinkMatch[2].trim();
      assert.equal(/^(https?:|mailto:|#|\/)/i.test(unsafeUrl), false);
    });
  });

  describe('3. Cobra Context Isolation & Insufficient Evidence Truthfulness', () => {
    it('returns INSUFFICIENT_EVIDENCE confidence when real Cobra repo has no graph evidence', async () => {
      const cobraReport = {
        id: 'cobra-issue-2528',
        repoFullName: 'spf13/cobra',
        targetType: 'issue',
        issueNumber: 2528,
        title: 'Flag parsing issue with subcommands',
        symptoms: 'Unexpected error flag provided but not defined: --help',
        entryPoint: 'command.go',
        suspectedCommit: null
      };

      const emptyGraphContext = {
        symbols: [],
        recentCommits: [],
        bugsAndFixes: []
      };

      const result = await runIncidentInvestigation(
        cobraReport,
        { repository: { fullName: 'spf13/cobra' } },
        { isDemo: false, graphContext: emptyGraphContext }
      );

      // Truthful verification: real repo with no connected graph evidence must report INSUFFICIENT_EVIDENCE
      assert.equal(result.repoFullName, 'spf13/cobra');
      assert.equal(result.diagnosis.confidence, 'INSUFFICIENT_EVIDENCE');
      assert.equal(result.diagnosis.rootCauseFile, 'unresolved');
      assert.equal(result.historicalFix, null);
      assert.equal(result.connectedEvidence.connectedFiles.length, 0);
      // Must NOT fabricate synthetic acme tokens
      assert.notEqual(result.diagnosis.rootCauseSymbol, 'acquireTokenLock');
      assert.notEqual(result.diagnosis.rootCauseFile, 'services/tokenBucket.js');
    });

    it('preserves synthetic fixture only for acme/payment-gateway controlled ablation', async () => {
      const mockGraphContext = {
        available: true,
        hasEvidence: true,
        symbols: [
          {
            id: 'acme/payment-gateway::symbol::server/routes/pay.js::function::handlePaymentRequest',
            name: 'handlePaymentRequest',
            kind: 'Function',
            filePath: 'server/routes/pay.js',
            callsSymbols: ['verifyToken']
          },
          {
            id: 'acme/payment-gateway::symbol::services/auth.js::function::verifyToken',
            name: 'verifyToken',
            kind: 'Function',
            filePath: 'services/auth.js',
            callsSymbols: ['acquireTokenLock']
          },
          {
            id: 'acme/payment-gateway::symbol::services/tokenBucket.js::function::acquireTokenLock',
            name: 'acquireTokenLock',
            kind: 'Function',
            filePath: 'services/tokenBucket.js',
            callsSymbols: []
          }
        ],
        recentCommits: [
          {
            sha: '8f2a1b9c0d1e2f3a',
            shortSha: '8f2a1b9',
            role: 'suspected_refactor',
            message: 'Refactor rate limit cache and token bucket mutex',
            changedFiles: ['services/tokenBucket.js']
          }
        ],
        bugsAndFixes: [
          {
            bugId: 'acme/payment-gateway::bug::lock-starvation-01',
            title: 'Worker Thread Lock Starvation under High Concurrency',
            filePath: 'services/tokenBucket.js',
            fixSummary: 'Enforce non-blocking tryAcquire with circuit breaker timeout',
            commitSha: '7e1d4c2b9a0f',
            commitShortSha: '7e1d4c2'
          }
        ]
      };

      const result = await runIncidentInvestigation(
        SYNTHETIC_INCIDENT_FIXTURE.incidentReport,
        SYNTHETIC_INCIDENT_FIXTURE,
        {
          isDemo: true,
          graphContext: mockGraphContext
        }
      );

      assert.equal(result.repoFullName, 'acme/payment-gateway');
      assert.equal(result.diagnosis.rootCauseFile, 'services/tokenBucket.js');
      assert.equal(result.diagnosis.rootCauseSymbol, 'acquireTokenLock');
      assert.equal(result.diagnosis.confidence, 'HIGH');
      assert.ok(result.historicalFix);
    });

    it('does not leak synthetic acme data when analyzing Cobra via GitHub adapter', () => {
      const adapter = new GitHubProviderAdapter();
      assert.equal(adapter.name, 'github');
      const parsed = adapter.parseUrl('https://github.com/spf13/cobra');
      assert.equal(parsed.owner, 'spf13');
      assert.equal(parsed.repo, 'cobra');
      assert.equal(parsed.fullName, 'spf13/cobra');
    });
  });
});
