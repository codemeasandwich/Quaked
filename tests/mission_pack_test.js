// The two mission packs (card [34c]): the -hipnotic/-rogue switches set the engine's mission-pack flags as WinQuake's
// COM_InitArgv does; each pack's status bar (WinQuake sbar.c) draws its own weapons, items, keys, armour and ammunition
// from its own pictures; and Level Select offers the pack's own episodes and maps. The status bar's pictures are
// recorded by name (their pixels are the pack's own, in its gfx.wad); the browser trial plays the real packs
// (docs/mission-packs-2026-10-10.md).
import '../src/newer/install.js';
const common = await import( '../src/engine/common/common.js' );
const Q = await import( '../src/engine/common/quakedef.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'the switches: -hipnotic or -rogue, after the program name, as WinQuake reads them', () => {
	common.COM_InitArgv( [ 'quaked', '-hipnotic' ] );
	check( common.hipnotic && ! common.rogue && ! common.standard_quake, 'Scourge of Armagon' );
	common.COM_InitArgv( [ 'quaked', '-rogue' ] );
	check( common.rogue && ! common.hipnotic && ! common.standard_quake, 'Dissolution of Eternity' );
	common.COM_InitArgv( [ '-hipnotic' ] );
	check( common.standard_quake && ! common.hipnotic, 'argv[0] is the program name, never a switch' );
	common.COM_InitArgv( [] );
	check( common.standard_quake && ! common.hipnotic && ! common.rogue, 'none: standard Quake' );
} );

// a status bar of its own (a separate module instance), its pictures recorded by name and place
async function statusBar( flags, tag ) {
	const sbar = await import( '../src/engine/client/sbar.js?' + tag );
	const drawn = [];
	const cl = { items: 0, stats: new Array( 32 ).fill( 0 ), item_gettime: new Array( 32 ).fill( 0 ), time: 100, maxclients: 1, gametype: 0, scores: [], viewentity: 1, faceanimtime: 0 };
	sbar.Sbar_SetExternals( { cl, vid: { width: 320, height: 200 }, Draw_PicFromWad: name => ( { name, width: 24, height: 16 } ),
		Draw_Pic: ( x, y, pic ) => drawn.push( { name: pic.name, x, y } ), Draw_TransPic: () => {}, Draw_Character: () => {}, Draw_String: () => {}, Draw_Fill: () => {}, ...flags } );
	sbar.Sbar_Init();
	sbar.set_sb_lines( 48 );
	// the draw path asks the page's size (the virtual screen): a 320x200 one
	const draw = () => { const had = 'window' in globalThis; if ( ! had ) globalThis.window = { devicePixelRatio: 1, innerWidth: 320, innerHeight: 200 };
		// each picture's place relative to the bar's own (the bar is drawn at 0,0)
		try { drawn.length = 0; sbar.Sbar_Draw(); const top = drawn.find( p => p.name === 'sbar' )?.y ?? 0; return drawn.map( p => `${p.name}@${p.x},${p.y - top}` ); } finally { if ( ! had ) delete globalThis.window; } };
	return { cl, draw };
}

Deno.test( 'Scourge of Armagon\'s status bar: Laser Cannon, Mjolnir, Proximity Gun, its items and its keys on the bar', async () => {
	const { cl, draw } = await statusBar( { hipnotic: true, rogue: false }, 'hipnotic' );
	// the wetsuit is item bit 24 to WinQuake's status bar (it draws bits 24 and 25 as the wetsuit and the shields)
	cl.items = Q.HIT_LASER_CANNON | Q.HIT_MJOLNIR | Q.HIT_PROXIMITY_GUN | Q.IT_GRENADE_LAUNCHER | ( 1 << 24 ) | Q.IT_KEY1 | Q.IT_SHELLS;
	cl.stats[ Q.STAT_ACTIVEWEAPON ] = Q.HIT_LASER_CANNON; cl.stats[ Q.STAT_HEALTH ] = 100;
	const d = draw();
	check( d.includes( 'inv2_laser@176,-16' ), 'the Laser Cannon, active, in its slot: ' + d.join( ' ' ) );
	check( d.includes( 'inv_mjolnir@200,-16' ), 'Mjolnir, owned' );
	check( d.includes( 'inv_prox_gren@96,-16' ), 'the grenade slot shows the launcher and the Proximity Gun together' );
	check( d.includes( 'sb_wsuit@288,-16' ), 'the wetsuit' );
	check( d.includes( 'sb_key1@209,3' ) && ! d.includes( 'sb_key1@192,-16' ), 'the silver key on the bar, not in the inventory row' );
	cl.items = Q.HIT_PROXIMITY_GUN; cl.stats[ Q.STAT_ACTIVEWEAPON ] = Q.HIT_PROXIMITY_GUN;
	check( draw().includes( 'inv2_prox@96,-16' ), 'the Proximity Gun alone, active' );
} );

Deno.test( 'Dissolution of Eternity\'s status bar: its weapons, armour, ammunition and items', async () => {
	const { cl, draw } = await statusBar( { hipnotic: false, rogue: true }, 'rogue' );
	cl.items = Q.IT_NAILGUN | Q.RIT_LAVA_NAILGUN | Q.RIT_ARMOR2 | Q.RIT_LAVA_NAILS | Q.RIT_SHIELD;
	cl.stats[ Q.STAT_ACTIVEWEAPON ] = Q.RIT_LAVA_NAILGUN; cl.stats[ Q.STAT_HEALTH ] = 100;
	const d = draw();
	check( d.includes( 'r_invbar1@0,-24' ), 'its own inventory bar, the powered-up one: ' + d.join( ' ' ) );
	check( d.includes( 'r_lava@48,-16' ), 'the Lava Nailgun over the nailgun' );
	check( d.includes( 'sb_armor2@0,0' ), 'its own armour bit (yellow)' );
	check( d.includes( 'r_ammolava@224,0' ), 'lava nails' );
	check( d.includes( 'r_shield1@288,-16' ), 'the shield' );
	check( ! d.some( p => p.startsWith( 'sb_sigil' ) ), 'no sigils' );
	cl.stats[ Q.STAT_ACTIVEWEAPON ] = Q.IT_NAILGUN;
	check( draw().includes( 'r_invbar2@0,-24' ), 'the ordinary inventory bar with an ordinary weapon' );
} );

Deno.test( 'Dissolution of Eternity in CTF teamplay: the team colour takes the face\'s place', async () => {
	const vars = await import( '../src/engine/common/cvar.js' );
	if ( ! vars.Cvar_FindVar( 'teamplay' ) ) vars.Cvar_RegisterVariable( new vars.cvar_t( 'teamplay', '0' ) );
	const { cl, draw } = await statusBar( { hipnotic: false, rogue: true }, 'rogue-team' );
	cl.maxclients = 2; cl.scores = [ { colors: 0x4d, frags: 3, name: 'player' } ]; cl.stats[ Q.STAT_HEALTH ] = 100;
	vars.Cvar_Set( 'teamplay', '4' );
	try {
		const d = draw();
		check( d.includes( 'r_teambord@112,0' ) && ! d.some( p => /^face/.test( p ) ), 'the team border where the face would be: ' + d.join( ' ' ) );
		vars.Cvar_Set( 'teamplay', '1' );
		check( draw().some( p => /^face1@112,0/.test( p ) ), 'outside CTF, the face' );
	} finally { vars.Cvar_Set( 'teamplay', '0' ); }
} );

Deno.test( 'Level Select: a mission pack\'s own episodes and maps, though Quake is mounted under it', async () => {
	const pak = await import( '../src/engine/common/pak.js' ), cmd = await import( '../src/engine/common/cmd.js' ), keys = await import( '../src/engine/client/keys.js' );
	const menu = await import( '../src/engine/client/menu.js' );
	cmd.Cbuf_Init(); cmd.Cmd_Init(); keys.Key_Init(); menu.M_Init();
	// a pack of empty files with the maps of both Quake's first episode and Scourge of Armagon
	const names = [ 'maps/start.bsp', 'maps/e1m1.bsp', 'maps/hip1m1.bsp', 'maps/hip1m2.bsp', 'maps/hip2m1.bsp', 'maps/hipdm1.bsp' ];
	const dir = new Uint8Array( 64 * names.length ), view = new DataView( dir.buffer );
	names.forEach( ( n, i ) => { for ( let c = 0; c < n.length; c ++ ) dir[ i * 64 + c ] = n.charCodeAt( c ); view.setInt32( i * 64 + 56, 12, true ); view.setInt32( i * 64 + 60, 0, true ); } );
	const head = new Uint8Array( 12 ), hv = new DataView( head.buffer ); 'PACK'.split( '' ).forEach( ( c, i ) => { head[ i ] = c.charCodeAt( 0 ); } );
	hv.setInt32( 4, 12, true ); hv.setInt32( 8, dir.length, true );
	const bytes = new Uint8Array( 12 + dir.length ); bytes.set( head ); bytes.set( dir, 12 );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'mission-test.pak', bytes.buffer ) );
	try {
		common.COM_InitArgv( [ 'quaked', '-hipnotic' ] );
		const offer = menu.M_LevelSelectOffer();
		same( offer.episodes.join(), '0,1,2,5', 'Scourge\'s episodes this copy has maps of (hub, two episodes, deathmatch)' );
		same( offer.levels.join(), 'hip1m1,hip1m2', 'its first episode\'s maps, not Quake\'s e1m1' );
		common.COM_InitArgv( [ 'quaked' ] );
		check( menu.M_LevelSelectOffer().levels.includes( 'e1m1' ), 'standard Quake offers its own maps again' );
	} finally {
		common.COM_InitArgv( [] );
	}
} );
