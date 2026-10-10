await import( '../src/gl_rsurf.js' );
const game = await import( '../src/s_ambientgame.js' ), music = await import( '../src/s_ambientmusic.js' );
const { MediaDouble, ContextDouble } = await import( './ambient_music_test.js' );
const { cl, cls, cl_entities, SIGNONS, ca_connected } = await import( '../src/engine/client/client.js' );
const { sv, FL_MONSTER } = await import( '../src/engine/server/server.js' );
const { edict_t } = await import( '../src/engine/progs/progs.js' );
const anim = await import( '../src/r_anim.js' ), post = await import( '../src/gl_post.js' );
const cvar = await import( '../src/engine/common/cvar.js' ), keys = await import( '../src/engine/client/keys.js' ), input = await import( '../src/engine/client/cl_input.js' );
const sound = await import( '../src/engine/sound/sound.js' ), dma = await import( '../src/engine/sound/snd_dma.js' );
const { STAT_HEALTH, STAT_ARMOR } = await import( '../src/engine/common/quakedef.js' );
function equal( a, b, label ) { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); }
async function withGame( run ) {

	if ( ! cvar.Cvar_FindVar( 'r_hdr' ) ) cvar.Cvar_RegisterVariable( post.r_hdr );
	const oldHdr = post.r_hdr.string, oldDest = keys.key_dest, oldWorld = cl.worldmodel, oldStats = Array.from( cl.stats );
	const saved = { cl: {}, cls: {}, sv: {}, music: sound.bgmvolume.value, volume: sound.volume.value, attack: input.in_attack.state, velocity: Array.from( cl.velocity ), damage: cl.cshifts[ 1 ].percent };
	for ( const k of [ 'viewentity', 'num_entities', 'gametype', 'maxclients', 'paused', 'intermission' ] ) saved.cl[ k ] = cl[ k ];
	for ( const k of [ 'state', 'signon', 'demoplayback' ] ) saved.cls[ k ] = cls[ k ];
	for ( const k of [ 'active', 'paused', 'edicts', 'num_edicts' ] ) saved.sv[ k ] = sv[ k ];
	const player = new edict_t( 1, 128 ), monster = new edict_t( 2, 128 );
	player.v.health = 100; monster.v.health = 100; monster.v.flags = FL_MONSTER; monster.v.origin.set( [ 1000, 0, 0 ] );
	try {

		cvar.Cvar_SetValue( 'r_hdr', 1 ); keys.set_key_dest( keys.key_game ); anim.R_AnimSetClassicPass( false );
		cl.worldmodel = {}; cl.viewentity = 1; cl.stats[ STAT_HEALTH ] = 100; cl.stats[ STAT_ARMOR ] = 50;
		cl.paused = false; cl.intermission = 0; cl.num_entities = 1; cl.gametype = 0; cl.maxclients = 1;
		cls.state = ca_connected; cls.signon = SIGNONS; cls.demoplayback = false;
		sv.active = true; sv.paused = false; sv.edicts = [ null, player, monster ]; sv.num_edicts = 3;
		sound.bgmvolume.value = sound.volume.value = 1; input.in_attack.state = 0; cl.cshifts[ 1 ].percent = 0; cl.velocity.fill( 0 );
		await run( { player, monster } );

	} finally {

		music.S_AmbientMusicShutdown(); cvar.Cvar_Set( 'r_hdr', oldHdr ); keys.set_key_dest( oldDest ); cl.worldmodel = oldWorld; cl.stats.set( oldStats );
		Object.assign( cl, saved.cl ); Object.assign( cls, saved.cls ); Object.assign( sv, saved.sv );
		sound.bgmvolume.value = saved.music; sound.volume.value = saved.volume; input.in_attack.state = saved.attack; cl.velocity.set( saved.velocity ); cl.cshifts[ 1 ].percent = saved.damage;

	}

}

Deno.test( 'public gameplay policy excludes classic, title demos, menus, death, intermission, pause, mute and hidden tabs', () => withGame( async () => {

	equal( game.S_AmbientMusicPolicy( 0, false ).active, true, 'Newer game eligible' );
	const cases = [
		[ () => cvar.Cvar_SetValue( 'r_hdr', 0 ), () => cvar.Cvar_SetValue( 'r_hdr', 1 ), 'classic' ],
		[ () => { cls.demoplayback = true; }, () => { cls.demoplayback = false; }, 'demo with hdr on' ],
		[ () => keys.set_key_dest( keys.key_menu ), () => keys.set_key_dest( keys.key_game ), 'menu' ],
		[ () => keys.set_key_dest( keys.key_console ), () => keys.set_key_dest( keys.key_game ), 'console' ],
		[ () => { cl.stats[ STAT_HEALTH ] = 0; }, () => { cl.stats[ STAT_HEALTH ] = 100; }, 'death' ],
		[ () => { cl.intermission = 1; }, () => { cl.intermission = 0; }, 'intermission' ],
		[ () => { cl.paused = true; }, () => { cl.paused = false; }, 'client pause' ],
		[ () => { sv.paused = true; }, () => { sv.paused = false; }, 'server pause' ],
		[ () => { cls.signon = 0; }, () => { cls.signon = SIGNONS; }, 'loading' ],
		[ () => { sound.bgmvolume.value = 0; }, () => { sound.bgmvolume.value = 1; }, 'music mute' ]
	];
	for ( const [ set, restore, name ] of cases ) { set(); equal( game.S_AmbientMusicPolicy( 0, false ).active, false, name ); restore(); }
	sound.volume.value = 0; equal( game.S_AmbientMusicPolicy( 0, false ).active, true, 'sound mute preserves music eligibility' ); sound.volume.value = 1;
	equal( game.S_AmbientMusicPolicy( 0, true ).active, false, 'hidden' );
	anim.R_AnimSetClassicPass( true ); equal( game.S_AmbientMusicPolicy( 0, false ).active, false, 'classic scope' ); anim.R_AnimSetClassicPass( false );

} ) );

Deno.test( 'authoritative living enemy proximity includes unseen monsters while ignoring corpses and free edicts', () => withGame( async ( { player, monster } ) => {

	player.v.velocity.set( [ 120, 0, 0 ] ); monster.v.origin.set( [ 511, 0, 0 ] );
	let state = game.S_AmbientMusicPolicy( 0, false ); equal( state.moving, true, 'actual velocity' ); equal( state.enemiesNearby, true, 'unseen enemy in server' ); equal( state.safe, false, 'swells suppressed' ); equal( state.active, true, 'quiet baseline retained' );
	monster.v.health = 0; equal( game.S_AmbientMusicPolicy( 0, false ).safe, true, 'corpse ignored' );
	monster.v.health = 100; monster.free = true; equal( game.S_AmbientMusicPolicy( 0, false ).safe, true, 'free edict ignored' );
	monster.free = false; monster.v.deadflag = 2; equal( game.S_AmbientMusicPolicy( 0, false ).safe, true, 'deadflag ignored' );
	monster.v.deadflag = 0; monster.v.origin.set( [ 513, 0, 0 ] ); equal( game.S_AmbientMusicPolicy( 0, false ).safe, true, 'outside nearby radius' );

} ) );

Deno.test( 'monster engagement, attacks and damage suppress swells until a ten-second combat cooldown ends', () => withGame( async ( { player, monster } ) => {

	monster.v.enemy = player.index; equal( game.S_AmbientMusicPolicy( 1, false ).combat, true, 'engaged enemy within combat reach' );
	monster.v.health = 0; equal( game.S_AmbientMusicPolicy( 10, false ).safe, false, 'combat cooldown' ); equal( game.S_AmbientMusicPolicy( 11.01, false ).safe, true, 'cooldown expires' );
	player.v.button0 = 1; equal( game.S_AmbientMusicPolicy( 20, false ).combat, true, 'authoritative attack' ); player.v.button0 = 0;
	game.S_AmbientMusicPolicy( 31, false ); cl.stats[ STAT_ARMOR ] -= 10; equal( game.S_AmbientMusicPolicy( 32, false ).combat, true, 'armour damage' );
	game.S_AmbientMusicPolicy( 43, false ); cl.stats[ STAT_HEALTH ] -= 10; equal( game.S_AmbientMusicPolicy( 44, false ).combat, true, 'health damage' );
	game.S_AmbientMusicPolicy( 55, false ); input.in_attack.state = 1; equal( game.S_AmbientMusicPolicy( 56, false ).combat, true, 'client attack fallback' );

} ) );

Deno.test( 'map change resets old damage history and remote fallback recognizes native live/death poses', () => withGame( async () => {

	game.S_AmbientMusicPolicy( 1, false ); cl.stats[ STAT_HEALTH ] = 90; game.S_AmbientMusicPolicy( 2, false );
	cl.worldmodel = {}; equal( game.S_AmbientMusicPolicy( 3, false ).safe, true, 'new level does not inherit old damage' );
	const before = [ cl_entities[ 1 ], cl_entities[ 2 ] ];
	try {

		sv.active = false; cl_entities[ 1 ] = { origin: [ 0, 0, 0 ] }; cl_entities[ 2 ] = { origin: [ 100, 0, 0 ], frame: 0, model: { name: 'progs/ogre.mdl', cache: { data: { frames: [ { name: 'run1' } ] } } } }; cl.num_entities = 3;
		equal( game.S_AmbientMusicPolicy( 4, false ).enemiesNearby, true, 'remote known enemy' ); cl_entities[ 2 ].model.cache.data.frames[ 0 ].name = 'death1';
		equal( game.S_AmbientMusicPolicy( 4, false ).enemiesNearby, false, 'remote corpse ignored' );

	} finally { [ cl_entities[ 1 ], cl_entities[ 2 ] ] = before; }

} ) );

Deno.test( 'public host audio update lazily creates streams only in Newer Game and respects sound lifecycle', () => withGame( async () => {

	const descriptors = new Map( [ 'window', 'document', 'Audio' ].map( name => [ name, Object.getOwnPropertyDescriptor( globalThis, name ) ] ) ), events = new Map(), media = [];
	try {

		Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: ContextDouble } } );
		Object.defineProperty( globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener: ( n, f ) => events.set( n, f ), removeEventListener: n => events.delete( n ) } } );
		Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends MediaDouble { constructor() { super(); media.push( this ); } } } );
		dma.S_Init(); cls.demoplayback = true; game.S_UpdateAmbientMusic(); equal( media.length, 0, 'no demo network/media load' );
		cls.demoplayback = false; cvar.Cvar_SetValue( 'r_hdr', 0 ); game.S_UpdateAmbientMusic(); equal( media.length, 0, 'no classic network/media load' );
		cvar.Cvar_SetValue( 'r_hdr', 1 ); game.S_UpdateAmbientMusic(); await Promise.resolve(); game.S_UpdateAmbientMusic();
		equal( media.length, 2, 'two streamed elements' ); equal( media[ 0 ].paused, false, 'real host adapter starts stream' );
		equal( music.S_GetAmbientMusicPlayer().bus.target, dma.S_GetAudioContext().destination, 'music routes directly to output independently of sound gain' );
		for ( const level of [ 0, .5, 1 ] ) {
			sound.volume.value = level; game.S_UpdateAmbientMusic(); await Promise.resolve(); equal( media[ 0 ].paused, false, 'sound volume ' + level + ' preserves ambient playback' );
		}
		for ( const level of [ .5, 1, 0 ] ) {
			sound.bgmvolume.value = level; game.S_UpdateAmbientMusic(); await Promise.resolve();
			equal( Math.abs( music.S_GetAmbientMusicPlayer().getStatus().volume - music.AMBIENT_BASE_GAIN * level ) < 1e-6, true, 'ambient music gain ' + level + ' applied once' );
			equal( media.every( m => m.paused ), level === 0, 'ambient music mute is independent of sound' );
		}
		sound.bgmvolume.value = 1; game.S_UpdateAmbientMusic(); await Promise.resolve();
		cvar.Cvar_SetValue( 'nosound', 1 ); game.S_UpdateAmbientMusic(); equal( media.every( m => m.paused ), true, 'nosound mutes ambience' );
		cvar.Cvar_SetValue( 'nosound', 0 ); game.S_UpdateAmbientMusic(); await Promise.resolve();
		globalThis.document.hidden = true; events.get( 'visibilitychange' )(); equal( media.every( m => m.paused ), true, 'visibility immediately pauses without host frames' );
		globalThis.document.hidden = false; game.S_UpdateAmbientMusic(); await Promise.resolve(); dma.S_StopAllSounds( false ); equal( media.every( m => m.paused ), true, 'stopsound stops music' );
		dma.S_Shutdown(); equal( music.S_GetAmbientMusicPlayer(), null, 'shutdown releases controller' ); equal( events.size, 0, 'visibility listener removed' );

	} finally {

		dma.S_Shutdown(); for ( const [ name, descriptor ] of descriptors ) { if ( descriptor ) Object.defineProperty( globalThis, name, descriptor ); else delete globalThis[ name ]; }

	}

} ) );
