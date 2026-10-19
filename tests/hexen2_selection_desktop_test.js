// The native desktop shelf can choose a Hexen II catalogue entry the catalogue proved playable; the web/source base
// refuses it with a clear reason. Quake's own choices keep their behaviour.
import { GameSelection_Startable } from '../src/engine/common/game_selection.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'Hexen II is startable in the desktop app only', () => {

	const game = { id: 'hexen2', kind: 'hexen2', present: true, validated: true, playable: true };
	const previous = globalThis.__QUAKED_DISTRIBUTION__;
	try {

		globalThis.__QUAKED_DISTRIBUTION__ = { profile: 'desktop' };
		const desktop = GameSelection_Startable( game, { strict: true } );
		check( desktop.ok, 'desktop accepted the playable Hexen entry: ' + desktop.refusal );
		const missing = GameSelection_Startable( { ...game, validated: false }, { strict: true } );
		check( missing.ok === false, 'a not-validated Hexen entry is refused' );

		globalThis.__QUAKED_DISTRIBUTION__ = { profile: 'web' };
		const web = GameSelection_Startable( game, { strict: true } );
		same( web.ok, false, 'the web product refuses Hexen' );
		same( web.refusal, 'needs the native desktop app', 'the refusal names the native app' );
		const shareware = GameSelection_Startable( { id: 'shareware', present: true }, {} );
		same( shareware.ok, true, 'the shareware still starts in the web product' );

	} finally { globalThis.__QUAKED_DISTRIBUTION__ = previous; }

} );
