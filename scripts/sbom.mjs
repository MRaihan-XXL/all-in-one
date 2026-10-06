// sbom.mjs — generate sbom.cdx.json (CycloneDX 1.5) from package.json.
// Deterministic on purpose: no timestamp, stable key order, so CI can regenerate
// and `git diff --exit-code` it (freshness gate in verify-scorecard).
// aio ships ZERO runtime dependencies (dependencies field absent) — the SBOM
// states that explicitly instead of pretending to enumerate a dependency tree.
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ref = `pkg:npm/${pkg.name}@${pkg.version}`;

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    tools: [{ vendor: 'MRaihan-XXL', name: 'aio scripts/sbom.mjs', version: pkg.version }],
    component: {
      'bom-ref': ref,
      type: 'application',
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      purl: ref,
      licenses: [{ license: { id: pkg.license } }],
    },
  },
  components: [],
  dependencies: [{ ref, dependsOn: [] }],
};

const out = new URL('../sbom.cdx.json', import.meta.url);
fs.writeFileSync(out, JSON.stringify(bom, null, 2) + '\n');
console.log(`sbom.cdx.json written — ${pkg.name}@${pkg.version}, 0 components (zero dependencies)`);
