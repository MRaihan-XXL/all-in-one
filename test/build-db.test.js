// build-db.test.js — fixture self-check for src/catalog.js (no network, no DB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReposTable, categorize, groupOf, GROUPS, LABELS } from '../src/catalog.js';

const FIXTURE = [
  'intro text',
  '## REPOS (3)',
  '',
  '| # | Repository | URL | Local path |',
  '|---|---|---|---|',
  '| 1 | Stirling-PDF | https://github.com/Stirling-Tools/Stirling-PDF | `C:/x/Stirling-PDF` |',
  '| 2 | local-only-thing | — (local only) | `C:/x/local-only-thing` |',
  '| 3 | mcp-demo | https://github.com/acme/mcp-demo | `C:/x/mcp-demo` |',
  '',
  '## TOOLS (0)',
].join('\n');

test('parseReposTable: rows, owner/repo split, local-only url empty', () => {
  const rows = parseReposTable(FIXTURE);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].folder, 'Stirling-PDF');
  assert.equal(rows[0].owner, 'Stirling-Tools');
  assert.equal(rows[0].repo, 'Stirling-PDF');
  assert.equal(rows[1].url, '');
  assert.equal(rows[2].url, 'https://github.com/acme/mcp-demo');
});

test('parseReposTable: missing section → empty list (no throw)', () => {
  assert.deepEqual(parseReposTable('# nothing here'), []);
});

test('categorize: known inputs land in the right fine label', () => {
  assert.equal(categorize('Stirling-PDF', 'HTML/CSS/JS to PDF converter'), 'Document / Conversion');
  assert.equal(categorize('mcp-demo', ''), 'MCP / Server');
  assert.equal(categorize('react-datepicker', ''), 'React / UI Library');
  assert.equal(categorize('awesome-selfhosted', ''), 'Learning / Docs');
  assert.equal(categorize('my-scraper', 'adaptive web scraping framework'), 'Web Scraping / Crawler');
  assert.equal(categorize('beszel', 'Lightweight server monitoring'), 'Monitoring / Observability');
  assert.equal(categorize('random-thing', 'nothing matches at all'), 'Aplikasi / Lainnya');
});

test('groupOf: every label maps into the original6 groups', () => {
  for (const l of LABELS) assert.ok(GROUPS.includes(groupOf(l)), `${l} → ${groupOf(l)}`);
  assert.equal(GROUPS.length, 6);
  assert.equal(new Set(LABELS).size, LABELS.length, 'labels unique');
});
