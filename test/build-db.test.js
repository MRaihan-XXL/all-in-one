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

const RICH = [
  '## REPOS (2)',
  '',
  '| # | Repository | URL | Function (description) | Category | Stars | Local path |',
  '|---|---|---|---|---|---|---|',
  '| 1 | zeta-etl | https://github.com/demo/zeta-etl | ETL csv ke chart | Data / ETL | \u2605999 | \u2014 (not cloned \u2014 `aio borrow --get`) |',
  '| 2 | already-here | https://github.com/x/y | thing | Dev | \u2014 | `D:/repos/already-here` |',
  '',
  '## TOOLS (0)',
].join('\n');

test('parseReposTable: rich 7-column layout parses; path cell optional', () => {
  const rows = parseReposTable(RICH);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].folder, 'zeta-etl');
  assert.equal(rows[0].owner, 'demo');
  assert.equal(rows[0].repo, 'zeta-etl');
  assert.equal(rows[0].dirPath, '', 'not-cloned row carries no local path');
  assert.equal(rows[1].dirPath, 'D:/repos/already-here', 'cloned row keeps its path');
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
