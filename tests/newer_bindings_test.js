// Enhanced content bindings (docs/hexen2/unified-host.md §2 rule 7): Quake's table is exactly the literals the
// features carried before the seam; Hexen II's resolves its own models/ paths and leaves Quake-only effects unbound.
import * as bindings from '../src/newer/content_bindings.js';
import * as skins from '../src/newer/render/r_newerskins.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { NEWER_DEFAULT_GAMMA, NEWER_ENABLED_FEATURES, Newer_ApplyGameDefaults } from '../src/newer/ui/newer_defaults.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => { if ( actual !== expected ) throw new Error( `${message}: ${actual} != ${expected}` ); };
const list = ( actual, expected, message ) => same( JSON.stringify( actual ), JSON.stringify( expected ), message );

Deno.test( 'Quake bindings are the old literals, unchanged', () => {

	GameProfile_Set( 'quake' );
	const q = bindings.NewerBindings( { family: 'quake' } );
	same( q.family, 'quake', 'family' );
	same( q.modelDir, 'progs/', 'model directory' );
	list( q.torch.models, [ 'progs/flame.mdl', 'progs/flame2.mdl' ], 'torch models' );
	same( q.torch.handleModel, 'progs/flame.mdl', 'handled torch' );
	same( q.torch.stockTriangles[ 'progs/flame.mdl' ], 122, 'wall torch triangles' );
	same( q.torch.stockTriangles[ 'progs/flame2.mdl' ], 86, 'pit flame triangles' );
	list( Object.entries( q.powerups ), [
		[ 'progs/quaddama.mdl', 'quad' ], [ 'progs/invulner.mdl', 'pentagram' ], [ 'progs/invisibl.mdl', 'ring' ]
	], 'power-up models' );
	list( q.projectiles.fireball, [ 'progs/k_spike.mdl' ], 'fireball' );
	same( q.projectiles.fireballKnight, 'progs/k_spike.mdl', 'knight shot' );
	list( q.projectiles.lavaBall, [ 'progs/lavaball.mdl' ], 'lava ball' );
	list( q.projectiles.quench, [ 'progs/lavaball.mdl', 'progs/k_spike.mdl' ], 'fire quenching' );
	list( q.projectiles.stasis, [ 'progs/laser.mdl' ], 'laser' );
	list( q.projectiles.venom, [ 'progs/w_spike.mdl' ], 'Scrag spit' );
	same( q.projectiles.venomScrag, 'progs/wizard.mdl', 'Scrag' );
	list( q.projectiles.nails, [ 'progs/spike.mdl', 'progs/s_spike.mdl', 'progs/laser.mdl' ], 'nail models' );
	list( q.projectiles.explosionSprites, [ 'progs/s_explod.spr' ], 'explosion sprite' );
	same( q.maps.start, 'maps/start.bsp', 'start map' );
	list( q.maps.fixtures, [ 'maps/e1m1.bsp' ], 'fixture map' );
	same( q.maps.fixturesExit, 'e1m2', 'fixture exit' );
	same( q.maps.exitMachine, 'maps/e1m1.bsp', 'exit machine map' );
	same( q.liquids.requirePrefix, '*', 'liquid prefix' );
	same( q.liquids.defaultKind, - 1, 'unknown liquids stay opaque' );
	same( q.liquids.mapLooks[ 'maps/e1m2.bsp' ][ '*04water1' ], 1, 'E1M2 water look' );
	same( q.rocks.materials.uwall1_2, 'wall', 'bedrock material' );
	same( q.rocks.materials.ground1_2, 'ground', 'ground material' );
	same( q.sounds.lava, 'ambience/lava1.wav', 'lava sound' );
	same( q.sounds.missileWater, 'misc/h2ohit1.wav', 'missile splash' );
	same( q.sounds.gib, 'zombie/z_fall.wav', 'gib sound' );
	same( q.sounds.impacts[ 'weapons/tink1.wav' ].kind, 'nail', 'impact cue' );
	same( q.sounds.impacts[ 'player/land.wav' ].volume, 0.35, 'landing volume' );
	same( q.sounds.playerWater[ 'player/inh2o.wav' ], 'enter', 'water entry' );
	same( q.sounds.playerEvents[ 'items/inv1.wav' ], 'ring', 'ring pickup' );
	list( q.sounds.electric[ 'weapons/lhit.wav' ], [ 'firing', 'hit', 'miss', 'water' ], 'electric cue' );
	same( bindings.NewerStartMap( { family: 'quake' } ), 'maps/start.bsp', 'Quake start map' );

} );

Deno.test( 'Hexen II bindings resolve models/ and native names, and Quake-only effects stay unbound', () => {

	GameProfile_Set( 'hexen2' );
	const h = bindings.NewerBindings();
	// no Hexen surface takes the procedural rock relief until the owner's texture review chooses its materials
	same( Object.keys( h.rocks.materials ).length + h.rocks.patterns.length, 0, 'Hexen II rock relief surfaces' );
	same( h.family, 'hexen2', 'family' );
	same( h.modelDir, 'models/', 'model directory' );
	same( h.modelExtension, '.mdl', 'model extension' );
	check( h.torch.models.length > 0 && h.torch.models.every( name => name.startsWith( 'models/' ) ), 'Hexen torches are models/' );
	same( h.torch.handleModel, null, 'no handled torch art is assumed' );
	same( h.torch.stockTriangles[ 'models/flame.mdl' ], undefined, 'no stock Quake triangle rules' );
	same( h.powerups[ 'models/a_invinc.mdl' ], 'pentagram', 'invincibility artifact' );
	same( h.powerups[ 'models/a_invis.mdl' ], 'ring', 'invisibility artifact' );
	check( h.projectiles.fireball.every( name => name.startsWith( 'models/' ) ), 'Hexen fire/magic missiles are models/' );
	check( h.projectiles.fireball.some( name => name.endsWith( '/fireball.mdl' ) ), 'native fireball is bound' );
	check( h.projectiles.acid.length > 0 && h.projectiles.acid.every( name => name.startsWith( 'models/' ) ), 'Hexen acid projectiles are models/' );
	check( h.projectiles.ice.length > 0 && h.projectiles.ice.every( name => name.startsWith( 'models/' ) ), 'Hexen ice projectiles are models/' );
	list( h.projectiles.stasis, [], 'the Quake laser stays unbound' );
	list( h.projectiles.venom, [], 'the Scrag venom stays unbound' );
	same( h.projectiles.venomScrag, null, 'no Scrag model' );
	same( h.maps.start, 'maps/demo1.bsp', 'base and demo start map' );
	list( h.maps.fixtures, [], 'E1M1 fixtures are unbound' );
	same( h.maps.exitMachine, null, 'the E1M1 exit machine is unbound' );
	same( h.sounds.welcomeJingle, false, 'the Quake jingle is unbound' );
	same( h.sounds.exitMachine, null, 'the E1M1 drone is unbound' );
	list( Object.keys( h.sounds.electric ), [], 'the Quake electric cues are unbound' );
	same( h.liquids.defaultKind, 0, 'all non-lava/slime/teleport * textures are water' );
	same( h.sounds.lava, 'ambience/lava.wav', 'Hexen lava sound' );
	same( h.sounds.missileWater, 'misc/drip.wav', 'Hexen splash' );
	same( h.sounds.gib, 'player/gib1.wav', 'Hexen gib' );
	check( h.sounds.impacts[ 'weapons/gauntht1.wav' ].kind === 'axe', 'Hexen gauntlet impact is an axe cue' );
	same( h.sounds.playerWater[ 'raven/inh2o.wav' ], 'enter', 'Hexen water entry' );
	same( bindings.NewerModelPath( 'mummy', { family: 'hexen2' } ), 'models/mummy.mdl', 'Hexen model path' );
	same( bindings.NewerStartMap( { id: 'hexen2-portals', family: 'hexen2' } ), 'maps/keep1.bsp', 'Portal start map' );
	check( ! JSON.stringify( h ).includes( 'progs/' ), 'no Quake model path leaks into the Hexen table' );
	check( ! JSON.stringify( h ).includes( 'e1m1' ), 'no Quake map name leaks into the Hexen table' );

} );

Deno.test( 'model keys follow the active profile model directory', () => {

	GameProfile_Set( 'quake' );
	same( skins.R_NewerModelKey( 'progs/wizard.mdl' ), 'wizard', 'Quake model key' );
	same( skins.R_NewerModelKey( 'models/mummy.mdl' ), null, 'Quake does not accept Hexen paths' );

	GameProfile_Set( 'hexen2' );
	same( skins.R_NewerModelKey( 'models/mummy.mdl' ), 'mummy', 'Hexen model key' );
	same( skins.R_NewerModelKey( 'models/flame2.mdl' ), 'flame2', 'Hexen flame key' );
	same( skins.R_NewerModelKey( 'progs/wizard.mdl' ), null, 'Hexen does not accept Quake paths' );
	same( skins.R_NewerModelKey( 'models/mummy.bsp' ), null, 'not an alias model' );
	same( skins.R_NewerSkinIndexPath(), 'newer/enemies/hexen2/index.json', 'Hexen skins use their own manifest namespace' );

	GameProfile_Set( 'quake' );

} );


Deno.test( 'the shared enabling function emits the Quake launch defaults for either family and honours an off choice', () => {

	const hexen = { family: 'hexen2', id: 'hexen2' };
	const commands = Newer_ApplyGameDefaults( hexen );
	check( commands.startsWith( 'r_hdr 1\n' ), 'Newer Game sets r_hdr 1' );
	for ( const name of NEWER_ENABLED_FEATURES ) check( commands.includes( name + ' 1\n' ), name + ' is enabled' );
	check( commands.includes( `gamma ${NEWER_DEFAULT_GAMMA}\n` ), 'brightness default' );
	check( commands.includes( 'cl_showfps 1\n' ), 'FPS default' );

	const off = Newer_ApplyGameDefaults( hexen, false );
	same( off, 'r_hdr 0\n', 'the owner\'s off choice only clears the mode and leaves feature cvars alone' );
	const featuresOnly = Newer_ApplyGameDefaults( hexen, true, { hdr: false } );
	check( ! featuresOnly.includes( 'r_hdr' ), 'the menus already emit the header' );
	check( featuresOnly.includes( 'r_newer_lighting 1\n' ), 'feature defaults remain' );

} );
