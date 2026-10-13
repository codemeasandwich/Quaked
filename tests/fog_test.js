// Fog as Quakespasm has it (src/engine/render/r_fog.js; docs/fog-2026-10-13.md, card dadcb966): a map's worldspawn
// "fog" key starts it, the `fog` console command changes it (as QuakeC's stuffcmd sends it), fading when given a time,
// a map without the key is clear; the scene is fogged while it is drawn, each surface at its own distance, and the sky
// takes the fog's colour by its map/console share.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { R_FogSet, R_FogNewMap, R_FogParams, R_FogInit, R_FogApply, R_FogSkyMaterial, R_FogSkyShare, FOG_SKY, r_skyfog } from '../src/engine/render/r_fog.js';
import { Cvar_Set } from '../src/engine/common/cvar.js';
import { Cbuf_Init, Cmd_Init, Cbuf_AddText, Cbuf_Execute } from '../src/engine/common/cmd.js';
const check = ( v, m ) => { if ( ! v ) throw Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const now = () => { const f = R_FogParams(); return [ f.density, f.r, f.g, f.b ].map( v => Math.round( v * 1000 ) / 1000 ).join( ' ' ); };
const world = keys => `{\n"classname" "worldspawn"\n${keys}\n}\n{\n"classname" "info_player_start"\n}`;

Deno.test( 'a map\'s worldspawn fog starts it, as Quakespasm reads it; a map without one is clear', () => {

	R_FogNewMap( world( '"wad" "gfx/base.wad"\n"fog" "0.05 0.3 0.25 0.2"' ) );
	same( now(), '0.05 0.3 0.25 0.2', 'density and colour from worldspawn' );
	R_FogNewMap( world( '' ) + '\n{\n"classname" "light"\n"fog" "1 1 1 1"\n}' );
	same( now(), '0 0.3 0.3 0.3', 'the next map without its own fog is clear (another entity\'s key does not count)' );
	R_FogNewMap( world( '"fog_info_entity" "fog"\n"sounds" "3"' ) );
	same( R_FogParams().density, 0, 'the word fog as another key\'s value is not the key (Dimension of the Past)' );
	R_FogNewMap( world( '"_fog" "0.02 1 0 0"' ) ); same( now(), '0.02 1 0 0', 'a leading _ on the key' );
	R_FogNewMap( world( '"fog" "0.01 0 1 0"\n"fog" "0.03 0 0 1"' ) ); same( now(), '0.03 0 0 1', 'the last key wins' );
	R_FogNewMap( world( '"fog" "0.05 0.4"' ) ); same( now(), '0.05 0.4 0.3 0.3', 'missing values keep their defaults, in order' );
	R_FogNewMap( world( '"message" "A } in a name"\n"fog" "0.04 0.1 0.1 0.1"' ) ); same( R_FogParams().density, 0.04, 'a } inside a value does not end the entity' );
	R_FogNewMap( null ); same( R_FogParams().density, 0, 'no entities: none' );

} );

Deno.test( 'the fog command takes Quakespasm\'s forms; text counts as 0; too many values change nothing', () => {

	Cbuf_Init(); Cmd_Init(); R_FogInit(); R_FogNewMap( '' );
	const run = text => { Cbuf_AddText( text + '\n' ); Cbuf_Execute(); };
	run( 'fog 0.1' ); same( now(), '0.1 0.3 0.3 0.3', 'one value: density' );
	run( 'fog 1 0 0' ); same( now(), '0.1 1 0 0', 'three: colour' );
	run( 'fog 0.02 0 0.5 2' ); same( now(), '0.02 0 0.5 1', 'four: density and colour, colour clamped to 0..1' );
	run( 'fog 0.03 0.1 0.2 0.3 0 0' ); same( now(), '0.02 0 0.5 1', 'six: usage, unchanged' );
	run( 'fog off' ); same( R_FogParams().density, 0, 'text is 0, as atof: fog off' );
	run( 'fog -1' ); same( R_FogParams().density, 0, 'a negative density is none' );
	run( 'fog 0.5 1000' ); check( R_FogParams().density < 0.01, 'two values: density and a fade time, fading from now' );
	run( 'fog 0.03 0.1 0.2 0.3' ); same( now(), '0.03 0.1 0.2 0.3', 'a change without a time is at once, ending a fade' );
	check( R_FogSet( [ '0.5' ] ) && R_FogParams().density === 0.5, 'R_FogSet directly' );
	R_FogNewMap( '' );

} );

Deno.test( 'a fade passes through the values between', async () => {

	R_FogNewMap( '' ); R_FogSet( [ '0', '0', '0', '0' ] ); R_FogSet( [ '0.064', '1', '1', '1', '0.2' ] );
	await new Promise( r => setTimeout( r, 100 ) );
	const mid = R_FogParams().density;
	check( mid > 0.005 && mid < 0.06, 'part-way through the fade: ' + mid );
	await new Promise( r => setTimeout( r, 160 ) );
	same( R_FogParams().density, 0.064, 'and at its end' );
	R_FogNewMap( '' );

} );

Deno.test( 'the scene is fogged while drawn: as given in the classic picture, linear and over the exposure in Newer Game', () => {

	const scene = { fog: 'unset' };
	R_FogNewMap( '' );
	same( R_FogApply( scene ), false, 'no fog' ); same( scene.fog, null, 'none on the scene' );
	R_FogSet( [ '0.064', '0.5', '0.25', '1' ] );
	check( R_FogApply( scene ) && scene.fog instanceof THREE.FogExp2, 'Three.js exponential-squared fog' );
	same( Math.round( scene.fog.density * 1e6 ), 1000, 'density / 64' );
	const lin = c => c <= 0.04045 ? c / 12.92 : ( ( c + 0.055 ) / 1.055 ) ** 2.4;
	check( Math.abs( scene.fog.color.r - lin( 0.5 ) ) < 1e-4, 'classic: the sRGB colour as given (linear inside Three.js): ' + scene.fog.color.r );
	R_FogApply( scene, 2 );
	check( Math.abs( scene.fog.color.r - 0.5 ** 2.2 / 2 ) < 1e-4 && Math.abs( scene.fog.color.b - 0.5 ) < 1e-4, 'Newer Game: linear, divided by the exposure: ' + scene.fog.color.r );
	R_FogNewMap( '' );

} );

Deno.test( 'the sky takes the fog\'s colour by its share, not by its distance; the renderer is wired', () => {

	const material = R_FogSkyMaterial( new THREE.MeshBasicMaterial() ), shader = { uniforms: {}, fragmentShader: 'void main() {\n#include <fog_fragment>\n}' };
	material.onBeforeCompile( shader, null );
	check( shader.fragmentShader.includes( 'mix( gl_FragColor.rgb, fogColor, uQuakedSkyFog )' ) && ! shader.fragmentShader.includes( '#include <fog_fragment>' ), 'the sky\'s share replaces the distance fog' );
	// the share: the map's skyfog, else r_skyfog; a change of r_skyfog in play takes over
	R_FogNewMap( '' ); same( shader.uniforms.uQuakedSkyFog.value, FOG_SKY, 'r_skyfog\'s default' );
	R_FogNewMap( '{\n"classname" "worldspawn"\n"_skyfog" "0.85"\n}' ); same( shader.uniforms.uQuakedSkyFog.value, 0.85, 'the map\'s _skyfog (Quake\'s re-release e1m7)' );
	Cvar_Set( 'r_skyfog', '0.2' ); same( R_FogSkyShare(), 0.2, 'r_skyfog set in play (Arcane Dimensions\' QuakeC) takes over' );
	R_FogNewMap( '' ); same( R_FogSkyShare(), 0.2, 'and stays the default for the next map' );
	Cvar_Set( 'r_skyfog', String( FOG_SKY ) ); R_FogNewMap( '' ); same( R_FogSkyShare(), FOG_SKY, 'back to the default' );
	check( material.customProgramCacheKey().endsWith( '|quaked-sky-fog' ), 'its own program' );
	same( FOG_SKY, 0.5, 'Quakespasm\'s r_skyfog default' );
	// the renderer's calls (gl_rmain.js, gl_rsurf_liquids.js): the per-map start, the command, both pictures' draws, the sky
	const rmain = readFileSync( new URL( '../src/engine/render/gl_rmain.js', import.meta.url ), 'utf8' );
	check( /export function R_NewMap\(\) \{[\s\S]{0,200}R_FogNewMap\( cl\?\.worldmodel\?\.entities \)/.test( rmain ), 'R_NewMap starts the map\'s fog' );
	check( /R_FogInit\(\);/.test( rmain ), 'R_Init registers the command' );
	check( /R_FogApply\( scene, R_PostLastExposure\(\) \);[^\n]*\n\t*try \{ renderer\.render\( scene, camera \); \} finally \{[^}]*scene\.fog = null;/.test( rmain ), 'the Newer Game scene pass is fogged, and the fog taken off after' );
	check( /R_FogApply\( scene \);[^\n]*\n\t*try \{ renderer\.render\( scene, camera \); \} finally \{ scene\.fog = null; \}/.test( rmain ), 'the classic draw is fogged, and the fog taken off after' );
	same( ( readFileSync( new URL( '../src/engine/render/gl_rsurf_liquids.js', import.meta.url ), 'utf8' ).match( /R_FogSkyMaterial\( new THREE\.MeshBasicMaterial/g ) ?? [] ).length, 3, 'all three sky materials' );

} );


Deno.test( 'sky fog observes every changed console string, even between draws', () => {
 const run = text => { Cbuf_AddText( text + '\n' ); Cbuf_Execute(); };
 for ( const command of [ 'r_skyfog 0.500000', 'r_skyfog 0\nr_skyfog 0.5' ] ) {
  Cvar_Set( 'r_skyfog', '0.5' ); R_FogNewMap( world( '"skyfog" "0.85"' ) );
  run( command ); same( R_FogSkyShare(), 0.5, command + ' overrides the map' );
 }
 Cvar_Set( 'r_skyfog', '0.5' ); R_FogNewMap( world( '"skyfog" "0.85"' ) );
 run( 'r_skyfog 0.5' ); same( R_FogSkyShare(), 0.85, 'identical string is not a change, as Quakespasm' );
 Cvar_Set( 'r_skyfog', '0.25' ); same( R_FogSkyShare(), 0.25, 'the QuakeC public setter also takes over' );
 R_FogNewMap( world( '"_skyfog" "0.9"' ) ); same( R_FogSkyShare(), 0.9, 'next map reads its own key again' );
 R_FogNewMap( '' ); same( R_FogSkyShare(), 0.25, 'map without a key uses the console default' );
 Cvar_Set( 'r_skyfog', String( FOG_SKY ) ); R_FogNewMap( '' );
} );

Deno.test( 'sky fog clamps keys and commands, updating every compiled material without recompilation', () => {
 const materials = [ R_FogSkyMaterial( new THREE.MeshBasicMaterial() ), R_FogSkyMaterial( new THREE.MeshBasicMaterial() ) ];
 const shaders = materials.map( material => { const shader = { uniforms: {}, fragmentShader: '#include <fog_fragment>' }; material.onBeforeCompile( shader, null ); return shader; } );
 same( shaders[ 0 ].uniforms.uQuakedSkyFog, shaders[ 1 ].uniforms.uQuakedSkyFog, 'shared uniform identity' );
 for ( const [ value, expected ] of [ [ '-2', 0 ], [ '4', 1 ], [ '0', 0 ], [ '0.75', 0.75 ] ] ) {
  R_FogNewMap( world( '"skyfog" "' + value + '"' ) ); same( R_FogSkyShare(), expected, 'map clamp ' + value );
  Cvar_Set( 'r_skyfog', value ); R_FogApply( { fog: null } );
  same( shaders[ 1 ].uniforms.uQuakedSkyFog.value, expected, 'updated even without distance fog' );
 }
 Cvar_Set( 'r_skyfog', String( FOG_SKY ) ); R_FogNewMap( '' );
 for ( const material of materials ) material.dispose();
} );
