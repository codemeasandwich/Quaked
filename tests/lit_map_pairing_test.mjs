// Standalone public-parser regression; no renderer or optional game files needed.
// Run: node --test tests/lit_map_pairing_test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Lit_Parse, LIT_MAGIC } from '../src/engine/render/lit.js';

function lighting(samples) {
	const file = new Uint8Array(8 + samples * 3);
	const header = new DataView(file.buffer);
	header.setUint32(0, LIT_MAGIC, true);
	header.setInt32(4, 1, true);
	for (let i = 8; i < file.length; i++) file[i] = i % 251;
	return file;
}

test('coloured lighting must fit the selected BSP, not merely its filename', () => {
	// Actual sample counts in bundled E1M3 and optional full-game E1M3.
	const replacement = lighting(184973);
	assert.equal(Lit_Parse(replacement, 171171), null);
	assert.deepEqual(Lit_Parse(replacement, 184973), replacement.slice(8));
});

test('matching E2 lighting remains intact and input views respect their bounds', () => {
	const source = lighting(192654);
	const container = new Uint8Array(source.length + 20);
	container.set(source, 10);
	assert.deepEqual(Lit_Parse(container.subarray(10, -10), 192654), source.slice(8));
});

test('short, trailing-byte, malformed and empty lighting use native fallback', () => {
	const file = lighting(5);
	assert.equal(Lit_Parse(file, 6), null);
	assert.equal(Lit_Parse(file, 4), null);
	assert.equal(Lit_Parse(new Uint8Array([...file, 0]), 5), null);
	assert.equal(Lit_Parse(file.subarray(0, 7), 5), null);
	file[4] = 2;
	assert.equal(Lit_Parse(file, 5), null);
	assert.equal(Lit_Parse(null, 5), null);
	assert.equal(Lit_Parse(lighting(0), 0), null);
});

test('local campaign BSPs only accept matching-size coloured lighting', {
	skip: !existsSync('resources/id1/pak0.pak') || !existsSync('pak0.pak') || !existsSync('newer/maps.pak')
}, () => {
	function pack(path) {
		const data = readFileSync(path), files = new Map();
		assert.equal(data.toString('ascii', 0, 4), 'PACK');
		const end = data.readInt32LE(4) + data.readInt32LE(8);
		for (let i = data.readInt32LE(4); i < end; i += 64) {
			const name = data.toString('ascii', i, i + 56).split('\0')[0];
			const start = data.readInt32LE(i + 56), size = data.readInt32LE(i + 60);
			files.set(name, data.subarray(start, start + size));
		}
		return files;
	}
	const owned = pack('resources/id1/pak0.pak');
	let accepted = 0, rejected = 0;
	for (const files of [owned, pack('pak0.pak'), pack('newer/maps.pak')]) {
		for (const [name, bsp] of files) {
			if (!/^maps\/(?:e[1-4]m\d+|start|end)\.bsp$/.test(name)) continue;
			const source = owned.get(name.replace(/\.bsp$/, '.lit'));
			if (!source) continue;
			assert.equal(bsp.readInt32LE(0), 29);
			const mono = bsp.readInt32LE(4 + 8 * 8 + 4);
			const result = Lit_Parse(source, mono);
			if (source.length === 8 + mono * 3) {
				assert.deepEqual(result, source.slice(8), name);
				accepted++;
			} else {
				assert.equal(result, null, name);
				rejected++;
			}
		}
	}
	assert.ok(accepted > 0 && rejected > 0, 'corpus exercises both paths');
	console.log(`Real map pairings: ${accepted} preserved, ${rejected} rejected`);
});
