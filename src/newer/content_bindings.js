/**
 * @module newer/content_bindings
 *
 * The game content Newer Game's features are drawn on: model names, effect models, map names, liquid and rock textures,
 * and the game's own sound names. One table per family (docs/hexen2/unified-host.md §2 rule 7, §3 "Enhanced bindings"):
 * Quake's table is exactly the literals the features used before this seam, so Quake behaviour is unchanged; Hexen II's
 * names come from the owned data1/pak0.pak, pak1.pak and portals/pak3.pak archives. A feature that has no counterpart in
 * a family reads an empty list or null there and keeps the native picture instead of borrowing the other game's art.
 *
 * Types: plain frozen objects and arrays; no exported classes.
 *
 * State: no mutable exports. The active table is read from the game profile on every call, never cached, because the
 * profile is chosen by the host at mount while the Newer modules are imported before that choice.
 *
 * Errors: none raised here.
 */
import { GameProfile_Get } from '../engine/common/game_profile.js';

const frozen = value => Object.freeze( value );
const frozenArray = list => Object.freeze( list.slice() );
const frozenMap = map => Object.freeze( { ...map } );

// Quake's names, byte for byte the literals the features carried before the bindings existed.
const QUAKE = frozen( {
	family: 'quake',
	modelDir: 'progs/',
	modelExtension: '.mdl',
	torch: frozen( {
		models: frozenArray( [ 'progs/flame.mdl', 'progs/flame2.mdl' ] ),
		handleModel: 'progs/flame.mdl',
		stockTriangles: frozenMap( { 'progs/flame.mdl': 122, 'progs/flame2.mdl': 86 } )
	} ),
	powerups: frozenMap( { 'progs/quaddama.mdl': 'quad', 'progs/invulner.mdl': 'pentagram', 'progs/invisibl.mdl': 'ring' } ),
	projectiles: frozen( {
		fireball: frozenArray( [ 'progs/k_spike.mdl' ] ),
		fireballKnight: 'progs/k_spike.mdl',
		lavaBall: frozenArray( [ 'progs/lavaball.mdl' ] ),
		quench: frozenArray( [ 'progs/lavaball.mdl', 'progs/k_spike.mdl' ] ),
		acid: frozenArray( [] ), // Quake has no distinct acid projectile model
		ice: frozenArray( [] ), // nor ice
		stasis: frozenArray( [ 'progs/laser.mdl' ] ),
		venom: frozenArray( [ 'progs/w_spike.mdl' ] ),
		venomScrag: 'progs/wizard.mdl',
		nails: frozenArray( [ 'progs/spike.mdl', 'progs/s_spike.mdl', 'progs/laser.mdl' ] ),
		explosionSprites: frozenArray( [ 'progs/s_explod.spr' ] )
	} ),
	maps: frozen( {
		start: 'maps/start.bsp',
		fixtures: frozenArray( [ 'maps/e1m1.bsp' ] ),
		fixturesExit: 'e1m2',
		exitMachine: 'maps/e1m1.bsp'
	} ),
	liquids: frozen( {
		requirePrefix: '*',
		waterPattern: /water|mwat/i,
		slimePattern: /slime/i,
		lavaPattern: /lava/i,
		teleportPattern: /teleport/i,
		defaultKind: - 1, // anything else starting '*' is a teleporter or solid, not see-through water
		mapLooks: frozenMap( { 'maps/e1m2.bsp': frozenMap( { '*04water1': 1 } ) } )
	} ),
	rocks: frozen( {
		materials: frozenMap( {
			wgrnd1_5: 'ground', wgrnd1_6: 'ground', uwall1_2: 'wall',
			bricka2_2: 'wall', ground1_2: 'ground', ground1_6: 'ground',
			wswamp1_2: 'ground', wizmet1_7: 'ground', wall16_7: 'ground'
		} ),
		patterns: frozenArray( [ [ /^rock\d+_\d+$/, 'wall' ] ] )
	} ),
	sounds: frozen( {
		lava: 'ambience/lava1.wav',
		missileWater: 'misc/h2ohit1.wav',
		gib: 'zombie/z_fall.wav',
		welcomeJingle: true,
		exitMachine: 'ambience/drone6.wav',
		environmentFire: frozenArray( [ 'ambience/fire1.wav' ] ),
		fireModels: frozenArray( [ 'progs/flame.mdl', 'progs/flame2.mdl' ] ),
		impacts: frozenMap( {
			'weapons/tink1.wav': frozenMap( { kind: 'nail', volume: 0.45 } ),
			'weapons/ric1.wav': frozenMap( { kind: 'nail', volume: 0.45 } ),
			'weapons/ric2.wav': frozenMap( { kind: 'nail', volume: 0.45 } ),
			'weapons/ric3.wav': frozenMap( { kind: 'nail', volume: 0.45 } ),
			'player/axhit2.wav': frozenMap( { kind: 'axe', volume: 0.6 } ),
			'player/land.wav': frozenMap( { kind: 'land', volume: 0.35 } ),
			'player/land2.wav': frozenMap( { kind: 'land', volume: 0.55 } )
		} ),
		playerWater: frozenMap( {
			'ambience/water1.wav': 'underwater', 'player/inh2o.wav': 'enter',
			'misc/water1.wav': 'walking', 'misc/water2.wav': 'walking'
		} ),
		playerEvents: frozenMap( {
			'items/damage.wav': 'quad', 'items/inv1.wav': 'ring', 'items/protect.wav': 'pentagram'
		} ),
		playerDeathPattern: /^player\/(?:u?death[1-5]?|h2odeath)\.wav$/,
		electric: frozenMap( {
			'weapons/lstart.wav': frozenArray( [ 'firing' ] ),
			'weapons/lhit.wav': frozenArray( [ 'firing', 'hit', 'miss', 'water' ] ),
			'shambler/sattck1.wav': frozenArray( [ 'charge' ] ),
			'shambler/sboom.wav': frozenArray( [ 'hit', 'miss', 'water', 'shamblerStop' ] )
		} )
	} )
} );

// Hexen II's counterparts, from the owned archives: models/ instead of progs/, Raven's own torch, spell, liquid, map
// and sound names. The Quake-only effects (Lava Man, the eel, the demon relief, the zombie, E1M1's fixtures and exit
// machine) are deliberately absent: their arrays are empty or their model is null.
const HEXEN2 = frozen( {
	family: 'hexen2',
	modelDir: 'models/',
	modelExtension: '.mdl',
	torch: frozen( {
		// Native flame animations. Complete torch props (cflmtrch, eflmtrch, ...) keep their own hardware: they are not
		// bound because the supplied flame card would replace the whole prop, not only the fire.
		models: frozenArray( [ 'models/flame.mdl', 'models/flame1.mdl', 'models/flame2.mdl', 'models/flaming.mdl' ] ),
		handleModel: null,
		stockTriangles: frozenMap( {} )
	} ),
	powerups: frozenMap( { 'models/a_invinc.mdl': 'pentagram', 'models/a_invis.mdl': 'ring' } ),
	projectiles: frozen( {
		// Fire and magic missiles: the native models callers and Raven's own spell code use for a flying attack.
		fireball: frozenArray( [
			'models/fireball.mdl', 'models/dthball.mdl', 'models/drgnball.mdl', 'models/eidoball.mdl',
			'models/pestshot.mdl', 'models/mumshot.mdl', 'models/balbolt.mdl', 'models/meteor.mdl',
			'models/glowball.mdl', 'models/soulball.mdl'
		] ),
		fireballKnight: 'models/fireball.mdl',
		lavaBall: frozenArray( [ 'models/lavaball.mdl' ] ),
		quench: frozenArray( [
			'models/fireball.mdl', 'models/dthball.mdl', 'models/drgnball.mdl', 'models/eidoball.mdl',
			'models/pestshot.mdl', 'models/mumshot.mdl', 'models/balbolt.mdl', 'models/meteor.mdl',
			'models/glowball.mdl', 'models/soulball.mdl', 'models/lavaball.mdl'
		] ),
		// Raven's separate acid and ice spell shots, kept apart from fire for effects that must not quench or burn.
		acid: frozenArray( [ 'models/spit.mdl', 'models/goop.mdl', 'models/skulshot.mdl' ] ),
		ice: frozenArray( [ 'models/iceshot1.mdl', 'models/iceshot2.mdl', 'models/shardice.mdl', 'models/stice.mdl' ] ),
		// A laser and the Scrag's wizspike are Quake's: no Hexen model is drawn as either.
		stasis: frozenArray( [] ),
		venom: frozenArray( [] ),
		venomScrag: null,
		// Arrow, spike and snake-arrow shots: the physical projectiles that make an impact ring.
		nails: frozenArray( [
			'models/arrow.mdl', 'models/nfarrow.mdl', 'models/spike.mdl', 'models/twspike.mdl',
			'models/snakearr.mdl', 'models/skulshot.mdl'
		] ),
		explosionSprites: frozenArray( [ 'models/s_explod.spr' ] )
	} ),
	maps: frozen( {
		// The native first map: demo1 in the base game and demo, keep1 in Portal of Praevus (support plan E19).
		start: 'maps/demo1.bsp',
		fixtures: frozenArray( [] ), // E1M1's fixtures are Quake geometry
		fixturesExit: null,
		exitMachine: null
	} ),
	liquids: frozen( {
		requirePrefix: '*',
		// Raven marks every animated liquid with '*' and describes it by contents, not by name: any '*' that is not
		// lava, slime or a teleporter is water (the native contents still decide movement and damage).
		waterPattern: null,
		slimePattern: /slime/i,
		lavaPattern: /lava/i,
		teleportPattern: /teleport/i,
		defaultKind: 0,
		mapLooks: frozenMap( {} )
	} ),
	rocks: frozen( {
		// No Hexen II surface takes the procedural rock relief yet: its material choices need the owner's texture review
		// (skills/quaked-texture-authoring), so the rock field has no charts and its warm-up has nothing to wait for
		materials: frozenMap( {} ),
		patterns: frozenArray( [] )
	} ),
	sounds: frozen( {
		lava: 'ambience/lava.wav',
		missileWater: 'misc/drip.wav',
		gib: 'player/gib1.wav',
		welcomeJingle: false, // the supplied jingle is Quake's first-level recording, not a Hexen cue
		exitMachine: null,
		environmentFire: frozenArray( [ 'raven/fire1.wav' ] ),
		fireModels: frozenArray( [ 'models/flame.mdl', 'models/flame1.mdl', 'models/flame2.mdl', 'models/flaming.mdl' ] ),
		impacts: frozenMap( {
			'weapons/tink1.wav': frozenMap( { kind: 'nail', volume: 0.45 } ),
			'weapons/ric1.wav': frozenMap( { kind: 'nail', volume: 0.45 } ),
			'weapons/ric2.wav': frozenMap( { kind: 'nail', volume: 0.45 } ),
			'weapons/ric3.wav': frozenMap( { kind: 'nail', volume: 0.45 } ),
			'weapons/spike2.wav': frozenMap( { kind: 'nail', volume: 0.45 } ),
			'weapons/gauntht1.wav': frozenMap( { kind: 'axe', volume: 0.6 } ),
			'weapons/gauntht2.wav': frozenMap( { kind: 'axe', volume: 0.6 } ),
			'weapons/slash.wav': frozenMap( { kind: 'axe', volume: 0.6 } ),
			'player/land.wav': frozenMap( { kind: 'land', volume: 0.35 } ),
			'player/pallnd.wav': frozenMap( { kind: 'land', volume: 0.55 } ),
			'player/asslnd.wav': frozenMap( { kind: 'land', volume: 0.55 } )
		} ),
		playerWater: frozenMap( { 'ambience/water.wav': 'underwater', 'raven/inh2o.wav': 'enter' } ),
		// Hexen's artifact pickups do not map one-to-one onto Quake's Quad/Ring/Pentagram cues: keep them native.
		playerEvents: frozenMap( {} ),
		playerDeathPattern: /^player\/(?:u?death[1-5]?|h2odeath|[a-z]+dieh?\d*)\.wav$/,
		electric: frozenMap( {} )
	} )
} );

/** Quake's table; exported for the binding tests and for tools that need the old literals. */
export const NEWER_QUAKE_BINDINGS = QUAKE;
/** Hexen II's table; exported for the binding tests. */
export const NEWER_HEXEN2_BINDINGS = HEXEN2;

/**
 * The content table for a game profile: Quake's for every Quake-family game (base, mission packs, mods), Hexen II's for
 * any Hexen II edition. Resolved on every call, since Newer's modules are imported before the host chooses the profile.
 *
 * @param {?object} [profile=GameProfile_Get()] the active profile
 * @returns {object} the frozen binding table
 */
export function NewerBindings( profile = GameProfile_Get() ) {

	return profile?.family === 'hexen2' ? HEXEN2 : QUAKE;

}

/**
 * A model path in the active game's model directory (`progs/<name>.mdl` or `models/<name>.mdl`).
 *
 * @param {string} name the base name, without directory or extension
 * @param {?object} [profile=GameProfile_Get()] the active profile
 * @returns {string} the precache path
 */
export function NewerModelPath( name, profile = GameProfile_Get() ) {

	const bindings = NewerBindings( profile );
	return bindings.modelDir + name + bindings.modelExtension;

}

/**
 * The first map of a Newer Game run for the active edition, e.g. `maps/start.bsp` or `maps/demo1.bsp`.
 *
 * @param {?object} [profile=GameProfile_Get()] the active profile
 * @returns {string} the world model's name
 */
export function NewerStartMap( profile = GameProfile_Get() ) {

	// Portal of Praevus ships no demo1; its first hub level is keep1 (support plan E19).
	return profile?.id === 'hexen2-portals' ? 'maps/keep1.bsp' : NewerBindings( profile ).maps.start;

}
