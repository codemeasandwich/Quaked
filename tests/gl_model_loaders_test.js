// The three model loaders on their own (card [44k]): E1M1 through the BSP loader (its lumps, hulls and inline models;
// a wrong version refused), the player through the alias loader and an explosion through the sprite loader. Through
// the public interfaces of gl_model_bsp.js, gl_model_alias.js and gl_model_sprite.js, on the shareware pak's files.
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t, mod_brush, mod_alias, mod_sprite } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { Mod_LoadAliasModel, pheader } from '../src/engine/render/gl_model_alias.js';
import { Mod_LoadSpriteModel } from '../src/engine/render/gl_model_sprite.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
const file = name => { const d = pak.COM_FindFile( name ).data; return d.buffer.slice( d.byteOffset, d.byteOffset + d.byteLength ); };
const fresh = name => { const m = new model_t(); m.name = name; set_loadmodel( m ); return m; };

Deno.test( 'the BSP loader: E1M1\'s lumps, hulls and inline models; a wrong version is refused', () => {
	const m = fresh( 'maps/e1m1.bsp' );
	Mod_LoadBrushModel( m, file( 'maps/e1m1.bsp' ) );
	check( m.type === mod_brush && m.bspVersion === 29, 'a version 29 brush model' );
	check( m.numleafs > 100 && m.numsurfaces > 1000 && m.numnodes > 100 && m.numplanes > 100, 'its lumps (' + [ m.numleafs, m.numsurfaces, m.numnodes, m.numplanes ] + ')' );
	check( m.hulls[ 1 ].clipnodes && m.hulls[ 1 ].firstclipnode >= 0 && m.hulls[ 2 ].clipnodes, 'the player and large hulls' );
	check( m.numsubmodels > 1 && Mod_FindName( '*1' ).nummodelsurfaces > 0, 'its inline models, *1 among them (' + m.numsubmodels + ')' );
	check( m.entities.includes( 'info_player_start' ), 'the entity text' );
	const bad = new Uint8Array( file( 'maps/e1m1.bsp' ).slice( 0 ) ); bad[ 0 ] = 30;
	let threw = false; try { Mod_LoadBrushModel( fresh( 'maps/bad.bsp' ), bad.buffer ); } catch ( e ) { threw = /wrong version/.test( e.message ); }
	check( threw, 'version 30 is refused' );
} );

Deno.test( 'the alias loader: the player\'s frames and skin; the sprite loader: an explosion\'s frames', () => {
	const player = fresh( 'progs/player.mdl' );
	Mod_LoadAliasModel( player, file( 'progs/player.mdl' ) );
	check( player.type === mod_alias && player.numframes > 100, 'the player, ' + player.numframes + ' frames' );
	check( pheader && pheader.numskins >= 1 && pheader.skinwidth > 0 && pheader.numverts > 0 && pheader.numtris > 0, 'its header: skin, vertices, triangles' );
	const boom = fresh( 'progs/s_explod.spr' );
	Mod_LoadSpriteModel( boom, file( 'progs/s_explod.spr' ) );
	check( boom.type === mod_sprite && boom.numframes === 6 && boom.cache.data.numframes === 6 && boom.cache.data.frames.length === 6, 'the explosion\'s six frames' );
} );
