// Enhanced brightens the scrolling sky so its openings bloom (gl_rsurf_liquids.js); the amount is the game's: Quake's
// dark skies keep 1.9, Hexen II's grey storm clouds keep their own brightness (owner, 20 October 2026: "check the sky box
// as I don't think it's correct but its colours"; at 1.9 the clouds blew out to white over black gaps).
import { GameProfile_Set, GameProfile_Get } from '../src/engine/common/game_profile.js';

const same = ( a, b, m ) => { if ( a !== b ) throw new Error( `${m}: ${a} != ${b}` ); };

Deno.test( 'the sky glow is per game: Quake 1.9, every Hexen II edition 1', () => {

	try {

		same( GameProfile_Set( 'quake' ).skyGlow, 1.9, 'Quake keeps its bloom' );
		for ( const id of [ 'hexen2', 'hexen2-demo', 'hexen2-portals' ] ) same( GameProfile_Set( id ).skyGlow, 1, id + ' keeps its native sky brightness' );

	} finally { GameProfile_Set( 'quake' ); }
	same( GameProfile_Get().skyGlow, 1.9, 'restored' );

} );
