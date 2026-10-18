/** Package inventory boundary and complete prepared-normal transport tests.
 * Reads existing manifests/PAK directories, never builds or regenerates artwork.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetPath, collectAssets, validateArtifactInventory } from '../tools/distribution/manifest.mjs';
import { pakDirectory, readMember, sha256 } from '../tools/pak_members.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));

test('artifact inventories enforce the original-game data boundary', () => {
  for (const profile of ['web', 'desktop']) {
    assert.doesNotThrow(() => validateArtifactInventory(['newer/maps.pak', 'newer/startup.pak', 'LICENSE'], profile));
    for (const path of ['resources/id1/pak0.pak', 'games/Quake/pak0.pak', 'games/Quake/pak1.pak',
      'games/Scourge of Armagon/pak0.pak', 'pak0.pak', 'nested/pak1.pak', '../private.pak', '/private.pak', 'a\\pak0.pak']) {
      assert.throws(() => validateArtifactInventory([path], profile), `${profile} must reject ${path}`);
    }
  }
  assert.doesNotThrow(() => validateArtifactInventory(['games/shareware/pak0.pak'], 'web'));
  assert.throws(() => validateArtifactInventory(['games/shareware/pak0.pak'], 'desktop'));
  assert.throws(() => validateArtifactInventory([], 'unknown'));
});

test('web closure retains every Episode 1/hub normal and eligible custom enemy sample', async () => {
  const assets = await collectAssets({ profile: 'web', root }), included = new Set(assets);
  assert.deepEqual(assets, [...included].sort(), 'inventory is sorted with no duplicate paths');
  assert(included.has('games/shareware/pak0.pak'));
  assert(included.has('newer/maps.pak'));
  assert(included.has('music/ambient.mp3'));
  assert(included.has('assets/sounds/quake1newereGame_firstLevelEasyMidHard.mp3'));
  assert(included.has('assets/sounds/lowHealt.mp3'));
  for (const name of ['fire-Environmental', 'firstSee_Shub'])
    assert(included.has('assets/sounds/' + name + '.mp3'), 'packaged environment cue: ' + name);
  for (const name of ['end_of_quake1', 'newerGame_die_reset', 'on-quad-pickup', 'on-ring-pickup', 'on-pentagram-pickup', 'two-active-powerups', 'third-powerup-pickup'])
    assert(included.has('assets/sounds/' + name + '.mp3'), 'packaged player event cue: ' + name);
  for (const name of ['player-bubbles', 'underwater', 'enter-underwater', 'walking-in-water'])
    assert(included.has('assets/sounds/' + name + '.mp3'), 'packaged water cue: ' + name);

  const normals = await json('newer/normals/manifest.json');
  const required = new Set();
  for (const [name, row] of Object.entries(normals.levels)) {
    if (/^(shareware|newer):/.test(name)) for (const key of row.keys) required.add(key);
  }
  const entries = await pakDirectory(assetPath(root, 'games/shareware/pak0.pak'));
  const skins = await json('newer/enemies/index.json');
  for (const [model, variants] of Object.entries(skins.models)) {
    const native = entries.get(`progs/${model}.mdl`);
    if (!native) continue;
    let hash;
    for (const variant of variants) {
      if (variant.nativeModelSha256) {
        hash ??= sha256(await readMember(native));
        if (hash !== variant.nativeModelSha256) continue;
      }
      // Pickup art intentionally has no custom normal bake; present canonical samples
      // for reachable enemy variants must always travel with their diffuse/height art.
      for (const key of normals.levels['custom:' + variant.dir]?.keys ?? []) required.add(key);
    }
  }
  assert(required.size > 0, 'fixture manifests expose prepared normals');
  for (const key of required) {
    assert(normals.samples[key], `normal key ${key} resolves through the canonical manifest`);
    assert(included.has(normals.samples[key].file), `web closure missing required normal ${key}`);
  }
  for (const kind of ['displacement', 'rockfield']) {
    const manifest = await json(`newer/${kind}/manifest.json`);
    for (const value of Object.values(manifest.levels)) for (const row of Array.isArray(value) ? value : [value]) {
      if (!['shareware', 'newer'].includes(row.namespace)) continue;
      for (const part of row.parts ?? [row]) assert(included.has(part.file), `web closure missing ${part.file}`);
    }
  }
  assert(!assets.some(path => /^newer\/(displacement|rockfield)\/(hipnotic|rogue|mg1|dopa)\//.test(path)),
    'web subset does not carry expansion-only prepared map payloads');
});

test('desktop inventory includes all prepared map transports and no bundled original game', async () => {
  const assets = await collectAssets({ profile: 'desktop', root }), included = new Set(assets);
  assert.deepEqual(assets, [...included].sort());
  assert(!assets.some(path => /^(games|resources)\//.test(path)));
  for (const name of ['fire-Environmental', 'firstSee_Shub'])
    assert(included.has('assets/sounds/' + name + '.mp3'), 'packaged environment cue: ' + name);
  for (const name of ['end_of_quake1', 'newerGame_die_reset', 'on-quad-pickup', 'on-ring-pickup', 'on-pentagram-pickup', 'two-active-powerups', 'third-powerup-pickup'])
    assert(included.has('assets/sounds/' + name + '.mp3'), 'packaged player event cue: ' + name);
  for (const name of ['player-bubbles', 'underwater', 'enter-underwater', 'walking-in-water'])
    assert(included.has('assets/sounds/' + name + '.mp3'), 'packaged water cue: ' + name);
  for (const kind of ['displacement', 'rockfield']) {
    const manifest = await json(`newer/${kind}/manifest.json`);
    for (const value of Object.values(manifest.levels)) for (const row of Array.isArray(value) ? value : [value]) {
      for (const part of row.parts ?? [row]) assert(included.has(part.file), `desktop closure missing ${part.file}`);
    }
  }
  assert(assets.some(path => path.startsWith('assets/boxes/')), 'predefined shelf art is bundled');
});
