/** Public catalogue/selection contracts for desktop discovery. No installed game data is read.
 * These tests exercise the production parser through realistic range responses; native path
 * permissions, WKWebView transport and actual game startup need separate packaged-app trials.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameCatalogue_Refresh, GAME_CATALOGUE_LIMITS } from '../src/engine/common/game_catalogue.js';
import { GameSelection_Startable } from '../src/engine/common/game_selection.js';

function pak(names) {
  const header = Buffer.alloc(12), body = Buffer.alloc(names.length, 7), directory = Buffer.alloc(names.length * 64);
  header.write('PACK'); header.writeInt32LE(12 + body.length, 4); header.writeInt32LE(directory.length, 8);
  names.forEach((name, i) => {
    directory.write(name, i * 64, 56, 'latin1');
    directory.writeInt32LE(12 + i, i * 64 + 56); directory.writeInt32LE(1, i * 64 + 60);
  });
  return Buffer.concat([header, body, directory]);
}

const baseNames = ['progs.dat', 'maps/start.bsp', 'maps/e1m1.bsp'];
const registeredNames = ['maps/e2m1.bsp', 'maps/e3m1.bsp', 'maps/e4m1.bsp'];
const descriptors = [
  { id: 'quake', name: 'Quake', kind: 'base', folders: ['chosen/id1'] },
  { id: 'hipnotic', name: 'Scourge of Armagon', kind: 'mission', base: 'quake', folders: ['chosen/hipnotic'] }
];

function transport(files, { ignoreRanges = false } = {}) {
  const requests = [];
  return { requests, fetch: async (url, init = {}) => {
    const path = decodeURIComponent(new URL(url).pathname).slice(1);
    const range = new Headers(init.headers).get('Range');
    requests.push({ path, range });
    const bytes = files.get(path);
    if (!bytes) return new Response(null, { status: 404 });
    if (ignoreRanges) return new Response(bytes, { headers: { 'Content-Length': String(bytes.length) } });
    assert.match(range, /^bytes=\d+-\d+$/, 'catalogue asks for a bounded range');
    const [, low, high] = /^bytes=(\d+)-(\d+)$/.exec(range);
    const start = Number(low), end = Math.min(Number(high), bytes.length - 1);
    if (start >= bytes.length) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
    const body = bytes.subarray(start, end + 1);
    return new Response(body, { status: 206, headers: {
      'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(body.length)
    } });
  } };
}

async function scan(files, options = {}) {
  const source = transport(files, options);
  const result = await GameCatalogue_Refresh({ base: 'https://native-contract.invalid/', games: descriptors,
    allPacks: true, ...options, fetch: source.fetch });
  return { ...result, requests: source.requests };
}

// Catalogue has shared in-flight/cache state, so keep these scenarios in a single sequential test.
test('desktop catalogue validates selected split archives and preserves legacy default mounting policy', async () => {
  const files = new Map([
    ['chosen/id1/pak0.pak', pak(baseNames)],
    ['chosen/id1/pak1.pak', pak(registeredNames)],
    ['chosen/id1/pak3.pak', pak(['must/not/be/read'])],
    ['chosen/hipnotic/pak0.pak', pak(['progs.dat', 'gfx.wad', 'maps/start.bsp'])]
  ]);
  const complete = await scan(files);
  assert.deepEqual(complete.games.map(g => g.id), ['quake', 'hipnotic'], 'only supplied catalogue descriptors are scanned');
  const [quake, expansion] = complete.games;
  assert.equal(quake.playable, true, 'registered episodes may reside in pak1');
  assert.deepEqual(quake.packs.map(p => p.name), ['pak0.pak', 'pak1.pak']);
  assert.equal(expansion.playable, true, 'validated expansion can use the split base');
  assert.equal(GameSelection_Startable(quake, { strict: true }).ok, true);
  assert.equal(GameSelection_Startable(expansion, { strict: true }).ok, true);
  assert(complete.requests.every(r => r.path.startsWith('chosen/')), 'no implicit checkout/resource probing');
  assert(!complete.requests.some(r => r.path.endsWith('pak3.pak')), 'a numbering gap ends probing');
  assert(complete.counters.largestRead <= GAME_CATALOGUE_LIMITS.directoryBytes, 'PAK payloads are not downloaded to discover games');

  const legacy = await scan(files, { allPacks: false });
  assert.equal(legacy.games[0].playable, false, 'existing pak0-only callers do not promise an unmounted pak1');
  assert.equal(legacy.games[1].playable, false, 'expansion inherits unavailable base');

  files.delete('chosen/id1/pak0.pak');
  const orphan = await scan(files);
  assert.equal(orphan.games[0].present, false);
  assert.equal(orphan.games[1].validated, true);
  assert.equal(orphan.games[1].playable, false, 'valid expansion alone is not playable');
  assert.equal(GameSelection_Startable(orphan.games[1], { strict: true }).ok, false);

  const empty = await scan(files, { games: [] });
  assert.deepEqual(empty.games, []);
  assert.deepEqual(empty.requests, [], 'an empty discovered root does not fall back to developer folders');
});

test('native strict selection refuses unread directories, damaged packs and absent shareware', async () => {
  const files = new Map([['chosen/id1/pak0.pak', pak([...baseNames, ...registeredNames])]]);
  const unchecked = await scan(files, { ignoreRanges: true });
  const entry = unchecked.games[0];
  assert.equal(entry.present, true); assert.equal(entry.validated, false);
  assert.equal(GameSelection_Startable(entry).ok, true, 'ordinary static HTTP compatibility remains intact');
  assert.equal(GameSelection_Startable(entry, { strict: true }).ok, false, 'desktop cannot enable an unchecked archive');

  const broken = pak([...baseNames, ...registeredNames]); broken.writeInt32LE(0x7fffffff, 4);
  files.set('chosen/id1/pak0.pak', broken);
  const corrupt = await scan(files);
  assert.equal(corrupt.games[0].validated, false);
  assert.equal(GameSelection_Startable(corrupt.games[0], { strict: true }).ok, false);

  const absentShareware = { id: 'shareware', present: false, validated: false, playable: false, reason: 'not installed', packs: [] };
  assert.equal(GameSelection_Startable(absentShareware).ok, true, 'legacy web shareware assumption remains intact');
  assert.equal(GameSelection_Startable(absentShareware, { strict: true }).ok, false, 'native app never assumes bundled shareware');
  assert.equal(GameSelection_Startable({ ...absentShareware, present: true, validated: true, playable: true }, { strict: true }).ok, true);
  // the catalogue's own rule (maps or QuakeC of its own) decides an add-on's support, not a fixed list
  // (docs/add-ons-2026-10-13.md "Any folder is a game")
  assert.equal(GameSelection_Startable({ id: 'ad', present: true, validated: true, playable: false, reason: 'it has no maps or QuakeC of its own' }, { strict: true }).ok, false,
    'an add-on the catalogue found unplayable is refused');
  assert.equal(GameSelection_Startable({ id: 'ad', present: true, validated: true, playable: true }, { strict: true }).ok, true,
    'an add-on the catalogue checked and found playable starts');
});

test('native catalogue refuses a pack set beyond the existing bounded limit', async () => {
  const files = new Map();
  for (let i = 0; i <= GAME_CATALOGUE_LIMITS.packs; i++) files.set(`chosen/id1/pak${i}.pak`, pak(i ? registeredNames : baseNames));
  const found = await scan(files, { games: descriptors.slice(0, 1) });
  assert.equal(found.games[0].beyondLimit, true);
  assert.equal(found.games[0].playable, false);
  assert.equal(GameSelection_Startable(found.games[0], { strict: true }).ok, false);
  assert(found.requests.every(r => !/pak[6-9]\.pak$/.test(r.path)));
});
