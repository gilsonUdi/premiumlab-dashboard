import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');

function atLeast(version, minimum) {
  const left = version.split('.').map(Number);
  const right = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}

test('inventory contains all 36 alerts read in Hostinger', () => {
  const inventory = JSON.parse(read('docs/security/hostinger-alerts-2026-10-21.json'));
  assert.equal(inventory.alerts.length, 36);
  assert.equal(new Set(inventory.alerts.map(alert => alert.id)).size, 36);
  assert.equal(inventory.alerts.filter(alert => alert.withdrawn).length, 1);
});

test('lockfile covers nested affected dependencies, not only direct versions', () => {
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.packages[''].dependencies.next, '15.5.28');
  const floors = { next: '15.5.28', postcss: '8.5.23', 'postcss-selector-parser': '7.1.6',
    '@grpc/grpc-js': '1.14.5', uuid: '11.1.1', eslint: '9.26.0' };
  for (const [name, floor] of Object.entries(floors)) {
    const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith(`node_modules/${name}`));
    assert.ok(copies.length > 0, name);
    for (const [path, entry] of copies) assert.ok(atLeast(entry.version, floor), `${path}: ${entry.version}`);
  }
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path.endsWith('node_modules/minimatch')) {
      const branch = Number(entry.version.split('.')[0]);
      const floor = { 3: '3.1.5', 9: '9.0.7', 10: '10.2.4' }[branch];
      assert.ok(floor && atLeast(entry.version, floor), `${path}: review ${entry.version}`);
    }
    if (path.endsWith('node_modules/glob')) {
      // This advisory affects the v10/v11 CLI, not every older major branch.
      const branch = Number(entry.version.split('.')[0]);
      if (branch === 10) assert.ok(atLeast(entry.version, '10.5.0'), path);
      if (branch === 11) assert.ok(atLeast(entry.version, '11.1.0'), path);
    }
  }
});

test('Next and its ESLint configuration use the same patched release', () => {
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.dependencies.next, '15.5.28');
  assert.equal(manifest.devDependencies['eslint-config-next'], manifest.dependencies.next);
});

test('Power BI browser-only SDK is not evaluated during server rendering', () => {
  const source = read('components/company/CompanyDashboardPage.jsx');
  assert.match(source, /dynamic\(\(\) => import\('@\/components\/company\/PowerBiEmbeddedView'\), \{\s*ssr: false/);
  assert.doesNotMatch(source, /import PowerBiEmbeddedView from/);
});

test('all dynamic portal pages unwrap asynchronous params before reading fields', () => {
  for (const file of [
    'app/empresa/[slug]/page.js',
    'app/empresa/[slug]/dashboard/page.js',
    'app/empresa/[slug]/externo/page.js',
    'app/empresa/[slug]/externo/[dashboardKey]/page.js',
    'app/empresa/[slug]/pps/page.js',
    'app/empresa/[slug]/power-bi/page.js',
    'app/empresa/[slug]/power-bi/[reportKey]/page.js',
    'app/contato/[id]/page.js',
    'app/api/public/contact-cards/[id]/vcard/route.js',
  ]) {
    const source = read(file);
    assert.match(source, /export (?:default )?async function/, file);
    assert.match(source, /await params/, file);
    assert.doesNotMatch(source, /params\.(?:slug|id|reportKey|dashboardKey)/, file);
  }
});
