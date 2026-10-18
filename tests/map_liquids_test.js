// A map's own see-through liquids (src/newer/render/r_mapliquids.js and R_LiquidAlpha in gl_rsurf_liquids.js; card
// T-3faa98e3 item 13, docs/small-touches-2026-10-14.md): worldspawn wateralpha / slimealpha / lavaalpha / telealpha (a
// leading _ allowed, as Quakespasm reads them). In Newer Game the existing treatments win (Newer liquids' looks for
// water and slime, solid lava, camera portals for teleporters), so a map's value is used only where that treatment is
// switched off; New Game is always r_wateralpha. Every liquid draw path asks the one function.
import { readFileSync } from './helpers/resource_fs.mjs';
await import( '../src/newer/install.js' );
const { cl } = await import( '../src/engine/client/client.js' );
const cvar = await import( '../src/engine/common/cvar.js' );
const mode = await import( '../src/newer/mode.js' );
const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
const { R_LiquidAlpha, R_LiquidAlphaAny } = await import( '../src/engine/render/gl_rsurf_liquids.js' );
const { r_mapliquids, R_LiquidKindOf } = await import( '../src/newer/render/r_mapliquids.js' );
const { r_wateralpha } = await import( '../src/engine/render/gl_rmain.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
for ( const v of [ r_hdr, r_mapliquids, mode.r_newer_water, mode.r_newer_portals, r_wateralpha ] ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
// the re-release's own values (60 of its maps), as a world model's entity text
const reRelease = { entities: '{\n"classname" "worldspawn"\n"_wateralpha" ".666"\n"_slimealpha" ".75"\n"_lavaalpha" ".85"\n"_telealpha" ".666"\n}\n{\n"classname" "light"\n"lavaalpha" "0.1"\n}' };
const tex = name => ( { name } );
function set( { newer = '1', water = '1', portals = '1', on = '1', world = reRelease } = {} ) {

	cvar.Cvar_Set( 'r_hdr', newer ); cvar.Cvar_Set( 'r_newer_water', water ); cvar.Cvar_Set( 'r_newer_portals', portals ); cvar.Cvar_Set( 'r_mapliquids', on ); cvar.Cvar_Set( 'r_wateralpha', '1' );
	mode.R_AnimSetClassicPass( false ); cl.worldmodel = { ...world };

}
const all = () => [ '*04water1', '*slime0', '*lava1', '*teleport' ].map( n => R_LiquidAlpha( tex( n ) ) ).join( ' ' );

Deno.test( 'Newer Game with its liquids and portals on: their treatments win, every liquid as r_wateralpha', () => {

	set(); same( all(), '1 1 1 1', 'water, slime, lava, teleporter' ); same( R_LiquidAlphaAny(), false, 'no translucent pass' );

} );

Deno.test( 'with a treatment switched off, that liquid takes the map\'s own value; another entity\'s key does not count', () => {

	set( { water: '0' } ); same( all(), '0.666 0.75 0.85 1', 'Newer liquids off: water, slime and lava take the map\'s; teleporters stay portals' );
	check( R_LiquidAlphaAny(), 'so the translucent pass runs' );
	set( { portals: '0' } ); same( all(), '1 1 1 0.666', 'camera portals off: the teleporter takes the map\'s' );
	set( { water: '0', world: { entities: '{\n"classname" "worldspawn"\n"wateralpha" "2"\n}' } } ); same( all(), '1 1 1 1', 'no leading _, clamped to 1; liquids without a key: r_wateralpha' );

} );

Deno.test( 'New Game, the classic half and the switch off are r_wateralpha for every liquid, as always', () => {

	for ( const [ name, opts, classic ] of [ [ 'New Game', { newer: '0', water: '0', portals: '0' } ], [ 'r_mapliquids 0', { water: '0', portals: '0', on: '0' } ], [ 'the classic half', { water: '0', portals: '0' }, true ] ] ) {

		set( opts ); if ( classic ) mode.R_AnimSetClassicPass( true );
		same( all(), '1 1 1 1', name ); same( R_LiquidAlphaAny(), false, name + ': no translucent pass' );
		cvar.Cvar_Set( 'r_wateralpha', '0.5' ); same( all(), '0.5 0.5 0.5 0.5', name + ': r_wateralpha as always' ); check( R_LiquidAlphaAny(), name + ': the pass runs for r_wateralpha' );
		mode.R_AnimSetClassicPass( false );

	}

} );

Deno.test( 'every liquid draw path asks R_LiquidAlpha; the classic comparison pass keeps r_wateralpha', () => {

	const world = readFileSync( new URL( '../src/engine/render/gl_rsurf_world.js', import.meta.url ), 'utf8' ), brush = readFileSync( new URL( '../src/engine/render/gl_rsurf_brush.js', import.meta.url ), 'utf8' ), liquids = readFileSync( new URL( '../src/engine/render/gl_rsurf_liquids.js', import.meta.url ), 'utf8' );
	same( ( world.match( /_getWaterMaterial\( [^,]+, R_LiquidAlpha\(/g ) ?? [] ).length, 4, 'the world\'s four liquid draws' );
	check( ! /_getWaterMaterial\( [^)]*r_wateralpha\.value/.test( world + brush ), 'none left on r_wateralpha directly' );
	check( /SURF_DRAWTURB \) && R_LiquidAlpha\( t \) !== 1\.0/.test( world ) && /! R_LiquidAlphaAny\(\) && gl_texsort\.value/.test( world ), 'the translucent pass is chosen the same way' );
	check( /R_LiquidAlpha\( s\.texinfo\.texture \)/.test( brush ), 'brush models\' liquids' );
	check( /return _getWaterMaterial\( mesh\.userData\.quakeLiquid, r_wateralpha\.value \);/.test( liquids ), 'the classic comparison pass is the original' );
	same( [ '*lava1', '*slime0', '*teleport', '*04water1', '*water2' ].map( R_LiquidKindOf ).join(), 'lava,slime,tele,water,water', 'liquid kinds by name' );

} );
