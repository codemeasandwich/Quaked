// Actual mounted archive precedence and native BSP loader, without a GPU.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/pak.js';
import { Mod_Init, Mod_ForName } from '../src/gl_model.js';
import { VID_SetPalette } from '../src/vid.js';

Deno.test('native loader falls back for E1M3 but preserves matching E2M1 RGB', () => {
	for (const path of ['resources/id1/pak0.pak', 'pak0.pak']) {
		const bytes = readFileSync(path);
		COM_AddPack(COM_LoadPackFile(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)));
	}
	VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);
	Mod_Init();
	for (const [name, coloured] of [['e1m3', false], ['e2m1', true]]) {
		const path = `maps/${name}.bsp`, source = COM_FindFile(path).data;
		const header = new DataView(source.buffer, source.byteOffset, source.byteLength);
		const offset = header.getInt32(4 + 8 * 8, true), length = header.getInt32(8 + 8 * 8, true);
		const model = Mod_ForName(path, true);
		assert.deepEqual(model.lightdata, source.slice(offset, offset + length));
		assert.equal(model.litdata !== null, coloured);
		if (coloured) assert.deepEqual(model.litdata, COM_FindFile(`maps/${name}.lit`).data.slice(8));
		const faces = header.getInt32(4 + 7 * 8, true);
		for (let i = 0; i < model.surfaces.length; i++) {
			const expected = header.getInt32(faces + i * 20 + 16, true), surface = model.surfaces[i];
			if (expected === -1) assert.equal(surface.samples, null);
			else {
				assert.equal(surface.sampleOffset, expected);
				assert.equal(surface.samples, model.lightdata);
				assert.equal(surface.litsamples !== null, coloured);
			}
		}
	}
});
