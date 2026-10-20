// Measures the serialised public save slot after visiting the installed hub's live changelevel graph.
import { Host_Hexen2SaveGame, Host_Hexen2ReadSlot, Host_Hexen2HubReset, Host_Hexen2ChangeLevel2 } from '../../src/engine/server/host_cmd.js';
import { PR_GetString } from '../../src/engine/progs/progs.js';
import { edictFieldString, createHexen2Session } from './hexen2_live.mjs';

/** Captures every reachable accepted map once; prints UTF-8 slot and per-level JSON sizes. */
export async function measureHub( gameId, start, accept = () => true ) {

	const originalRandom = Math.random;
	let seed = 12345;
	Math.random = () => ( seed = ( Math.imul( seed, 1664525 ) + 1013904223 ) >>> 0 ) / 4294967296;
	try {

		const values = new Map();
		globalThis.localStorage = { getItem: k => values.get( k ) ?? null, setItem: ( k, v ) => values.set( k, v ) };
		Host_Hexen2HubReset();
		const session = createHexen2Session( start, gameId === 'hexen2-portals' ? 5 : 1, { gameId } );
		const queue = [ start ], seen = new Set(), edges = {};
		let single = null;
		while ( queue.length ) {

			const map = queue.shift();
			if ( seen.has( map ) ) continue;
			if ( session.sv.name !== map ) {

				const changed = Host_Hexen2ChangeLevel2( map );
				if ( ! changed.ok ) throw new Error( changed.reason );

			}
			seen.add( map );
			edges[ map ] = session.sv.edicts.filter( e => e && ! e.free && PR_GetString( e.v.classname ) === 'trigger_changelevel' )
				.map( e => edictFieldString( e, 'map' ) ).filter( Boolean );
			queue.push( ...edges[ map ].filter( accept ) );
			const saved = await Host_Hexen2SaveGame( 'size-measure' );
			if ( ! saved.ok ) throw new Error( saved.reason );
			const slot = await Host_Hexen2ReadSlot( 'size-measure' );
			if ( single === null ) single = Buffer.byteLength( slot.text );

		}
		const slot = await Host_Hexen2ReadSlot( 'size-measure' );
		const perLevel = Object.fromEntries( Object.entries( slot.hub.levels ).map( ( [ name, level ] ) => [ name, Buffer.byteLength( JSON.stringify( level ) ) ] ) );
		const result = { gameId, start, single, bytes: Buffer.byteLength( slot.text ), perLevel, edges };
		console.log( 'HUB_SIZE ' + JSON.stringify( result ) );
		return result;

	} finally { Math.random = originalRandom; }

}
