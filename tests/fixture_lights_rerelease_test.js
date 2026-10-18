// The exit corridor's six ceiling fixtures (r_fixturelights.js) on the 2021 re-release's E1M1, which the re-release
// recompiled: the same six tlight01 panels and helper lights, matched by the same geometry checks
// (docs/stock-progs-2026-10-14.md). Until 14 October 2026 only the 1.06 shareware E1M1's bytes were admitted, so in the
// app, which plays the owner's re-release Quake, the corridor kept its plain lights.
import { memberSearch, readMember, isolatedPack } from '../tools/pak_members.mjs';
import { readdirSync, existsSync, readFileSync } from './helpers/resource_fs.mjs';
import { COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { VID_SetPalette, vid } from '../src/engine/render/vid.js';
import { GL_BuildLightmaps } from '../src/engine/render/gl_rsurf.js';
import { cl } from '../src/engine/client/client.js';
import * as post from '../src/newer/render/gl_post.js';
import { R_KnownFixtureSource } from '../src/newer/render/r_fixturelights.js';

const check = ( v, m ) => { if ( ! v ) throw Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
// the 1.06 helpers (tests/fixture_lights_test.js FIXTURES): the re-release keeps them where they were
const HELPERS = [ [ 1312, 1648, - 392 ], [ 1312, 1520, - 392 ], [ 1312, 1392, - 352 ], [ 1312, 1264, - 288 ], [ 1312, 1136, - 232 ], [ 1312, 960, - 208 ] ];

Deno.test( 'the re-release E1M1 is a known fixture source and its six corridor fixtures become cone lights on the same helpers', async () => {

	// the owner's games (QUAKED_GAME_ROOT; missing there is a failure), else resources/id1 (the runner skips it when absent)
	const root = process.env.QUAKED_GAME_ROOT;
	const folder = root && existsSync( root ) ? readdirSync( root ).find( n => n.toLowerCase() === 'quake' ) ?? 'Quake' : 'Quake';
	const pak = root ? `${root}/${folder}/pak0.pak` : new URL( '../resources/id1/pak0.pak', import.meta.url ).pathname;
	readFileSync( pak, { flag: 'r' } ).subarray( 0, 0 ); // (ENOENT names the missing pak)
	const entries = await memberSearch( [ pak ] ), bytes = await readMember( entries.get( 'maps/e1m1.bsp' ) );
	same( bytes.length, 1664336, 'the re-release E1M1' );
	COM_AddPack( isolatedPack( 'gfx/palette.lmp', await readMember( entries.get( 'gfx/palette.lmp' ) ) ) ); COM_AddPack( isolatedPack( 'maps/e1m1.bsp', bytes ) );
	VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); vid.fullbright = 224; Mod_Init();
	const model = Mod_ForName( 'maps/e1m1.bsp', true ); cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = null; GL_BuildLightmaps();
	same( R_KnownFixtureSource( model ), true, 'admitted' );
	const fixtures = post.R_BuildWorldLights( model ).filter( l => l.fixture );
	same( fixtures.length, 6, 'six fixture cones' );
	for ( const helper of HELPERS ) check( fixtures.some( l => l.fixture.authoredPosition.join() === helper.join() ), 'a cone from the helper at ' + helper );
	for ( const l of fixtures ) same( l.direction.join(), '0,0,-1', 'facing down' );
	const changed = model.bspSourceBytes.slice(); changed[ changed.length - 1 ] ^= 1;
	same( R_KnownFixtureSource( { ...model, bspSourceBytes: changed } ), false, 'a byte changed: not admitted' );

} );
