// Read-only installed/shareware fixtures through the same pack and BSP loaders as the game.
import { readFileSync, existsSync } from './resource_fs.mjs';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../../src/engine/common/pak.js';
import { VID_SetPalette } from '../../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName, Mod_ClearAll } from '../../src/engine/render/gl_model.js';

let initialised = false;

export function mountSlipgatePack( path ) {

	if ( ! existsSync( path ) ) return false;
	const bytes = readFileSync( path );
	COM_AddPack( COM_LoadPackFile( String( path ), bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) ) );
	VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data );
	if ( ! initialised ) { Mod_Init(); initialised = true; }
	Mod_ClearAll();
	return true;

}

export function loadSlipgateMap( name ) {

	return Mod_ForName( 'maps/' + name + '.bsp', true );

}
