const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
const app = manifest.applications.zotero;

test('Zotero installer-required manifest fields are present', () => {
  // Required by Zotero app/scripts/fetch_xulrunner's Extension.sys.mjs patch.
  for (const key of ['id', 'update_url', 'strict_max_version']) {
    assert.equal(typeof app[key], 'string'); assert.ok(app[key].length);
  }
  assert.equal(new URL(app.update_url).protocol, 'https:');
  assert.equal(manifest.manifest_version, 2);
  assert.ok(fs.existsSync('src/bootstrap.js'));
});
test('declared compatibility includes the reported Zotero 10.0.6', () => {
  assert.equal(app.strict_max_version, '10.0.*');
  assert.ok(Number(app.strict_min_version.split('.')[0]) <= 10);
});
test('package and lock versions agree with install manifest', () => {
  for (const name of ['package.json', 'package-lock.json']) {
    assert.equal(JSON.parse(fs.readFileSync(name, 'utf8')).version, manifest.version);
  }
});
