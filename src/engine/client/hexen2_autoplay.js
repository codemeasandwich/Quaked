/**
 * @module engine/client/hexen2_autoplay
 *
 * Trial-only scripted input for a packaged Hexen II run (`HEXEN2_TRIAL_AUTOPLAY=1`). It drives the same DOM events,
 * commands and server entry points a player would, so the packaged public path can be exercised without UI automation.
 * It is loaded only when the caller asks for autoplay; it is not part of the normal product path and must not become
 * gameplay authority.
 *
 * Types: plain values and functions; no exported classes.
 * State: mutates the live trial session (the same way the trial's mouse/keyboard input does).
 * Errors: none are swallowed; a caller error propagates to the page host.
 */

import { SV_LinkEdict } from '../server/world.js';
import { PR_GetString } from '../progs/progs.js';
import { cl, cl_entities, cl_numvisedicts } from './client.js';
import { sv } from '../server/server.js';

/**
 * Runs the scripted trial against an already-started page session.
 *
 * @param {{ session: object, renderer: object, log: function(string): void, tick: function(number): void,
 *   frames: function(): number, audioState?: function(): string }} options the live session, renderer, page logger,
 *   page tick, frame counter and optional audio-state probe
 */
export function Hexen2_RunAutoplay( { session, renderer, log, tick, frames, saveTrial = false, audioState = () => 'none' } ) {

	const dispatch = ( type, init ) => document.dispatchEvent( new ( type === 'mousemove' || type === 'mousedown' || type === 'mouseup' ? MouseEvent : KeyboardEvent )( type, { bubbles: true, ...init } ) );
	let combat = null, item = null;
	for ( let i = 2; i <= 280; i ++ ) {

		if ( i === 20 ) { for ( let n = 0; n < 12; n ++ ) dispatch( 'mousemove', { clientX: 200 + n * 20, clientY: 300 } ); log( 'autoplay mouse yaw=' + Math.round( cl.viewangles[ 1 ] ) ); }
		if ( i === 30 ) dispatch( 'keydown', { code: 'ArrowLeft' } );
		if ( i === 50 ) { dispatch( 'keyup', { code: 'ArrowLeft' } ); log( 'autoplay arrow yaw=' + Math.round( cl.viewangles[ 1 ] ) ); }
		if ( i === 70 ) dispatch( 'keydown', { code: 'ArrowUp' } );
		if ( i === 80 ) dispatch( 'mousedown', { button: 0 } );
		if ( i === 100 ) dispatch( 'mouseup', { button: 0 } );
		if ( i === 110 ) { dispatch( 'keydown', { code: 'Escape' } ); log( 'autoplay menu open=' + ( globalThis.__HEXEN2_MENU__?.isOpen() === true ) ); }
		if ( i === 112 && saveTrial ) { for ( let n = 0; n < 4; n ++ ) dispatch( 'keydown', { code: 'ArrowDown' } ); dispatch( 'keydown', { code: 'Enter' } ); log( 'autoplay menu save' ); }
		if ( i === 125 && saveTrial ) { dispatch( 'keydown', { code: 'ArrowDown' } ); dispatch( 'keydown', { code: 'Enter' } ); log( 'autoplay menu load' ); }
		if ( i === 140 && saveTrial ) { dispatch( 'keydown', { code: 'Escape' } ); log( 'autoplay menu closed=' + ( globalThis.__HEXEN2_MENU__?.isOpen() === false ) ); }
		if ( i === 120 && ! saveTrial ) { dispatch( 'keydown', { code: 'Escape' } ); log( 'autoplay menu closed=' + ( globalThis.__HEXEN2_MENU__?.isOpen() === false ) ); }
		if ( i === 140 ) { dispatch( 'keyup', { code: 'ArrowUp' } ); log( 'autoplay pos=' + session.player.v.origin.map( v => Math.round( v ) ).join( ',' ) + ' yaw=' + Math.round( cl.viewangles[ 1 ] ) + ' vangle=' + Math.round( session.player.v.v_angle[ 1 ] ) + ' angles=' + Math.round( session.player.v.angles[ 1 ] ) + ' fix=' + ( session.player.v.fixangle | 0 ) + ' audio=' + audioState() ); }
		if ( i === 150 ) {

			let best = null, bestDistance = 1e9;
			for ( const ent of sv.edicts ) {

				if ( ! ent || ent.free || ! ent.v.model || ! PR_GetString( ent.v.classname ).startsWith( 'monster_' ) || ent.v.health <= 0 ) continue;
				const distance = Math.hypot( ent.v.origin[ 0 ] - session.player.v.origin[ 0 ], ent.v.origin[ 1 ] - session.player.v.origin[ 1 ] );
				if ( distance < bestDistance ) { bestDistance = distance; best = ent; }

			}
			combat = best ? { ent: best, before: best.v.health } : null;
			if ( combat ) { best.v.movetype = 0; best.v.health = 100; combat.before = 100; cl.viewangles = [ 0, 0, 0 ]; log( 'autoplay combat before=' + combat.before ); }

		}
		if ( combat && i > 150 ) {

			combat.ent.v.origin = [ session.player.v.origin[ 0 ] + 64, session.player.v.origin[ 1 ], session.player.v.origin[ 2 ] ];
			combat.ent.v.velocity = [ 0, 0, 0 ];
			SV_LinkEdict( combat.ent, true );

		}
		if ( i === 160 ) dispatch( 'mousedown', { button: 0 } );
		if ( i === 200 ) dispatch( 'mouseup', { button: 0 } );
		if ( i === 160 && combat ) log( 'autoplay combat draw calls=' + ( renderer.info.render.calls | 0 ) + ' tris=' + ( renderer.info.render.triangles | 0 ) + ' vis=' + cl_numvisedicts + ' model=' + ( cl_entities[ combat.ent.index ]?.model ? 'yes' : 'no' ) );
		if ( i === 230 && combat ) log( 'autoplay combat after=' + combat.ent.v.health + ' damaged=' + ( combat.ent.v.health < combat.before ) + ' calls=' + ( renderer.info.render.calls | 0 ) + ' tris=' + ( renderer.info.render.triangles | 0 ) );
		if ( i === 245 ) {

			let best = null, bestDistance = 1e9;
			for ( const ent of sv.edicts ) {

				if ( ! ent || ent.free || ! ent.v.model ) continue;
				const name = PR_GetString( ent.v.classname );
				if ( name !== 'item_health' && name !== 'item_artifact' && name !== 'item_mana' ) continue;
				const distance = Math.hypot( ent.v.origin[ 0 ] - session.player.v.origin[ 0 ], ent.v.origin[ 1 ] - session.player.v.origin[ 1 ] );
				if ( distance < bestDistance ) { bestDistance = distance; best = ent; }

			}
			item = best ? { ent: best, before: session.player.v.health } : null;
			if ( item ) {

				const yaw = cl.viewangles[ 1 ] * Math.PI / 180;
				item.ent.v.origin = [ session.player.v.origin[ 0 ] + Math.cos( yaw ) * 2, session.player.v.origin[ 1 ] + Math.sin( yaw ) * 2, session.player.v.origin[ 2 ] ];
				item.ent.v.velocity = [ 0, 0, 0 ];
				SV_LinkEdict( item.ent, true );
				log( 'autoplay item before health=' + item.before + ' class=' + PR_GetString( item.ent.v.classname ) + ' model=' + PR_GetString( item.ent.v.model ) + ' frame=' + ( item.ent.v.frame | 0 ) + ' effects=' + ( item.ent.v.effects | 0 ) );

			}
			else log( 'autoplay item none' );

		}
		if ( i === 275 && item ) log( 'autoplay item after health=' + session.player.v.health + ' frame=' + ( item.ent.v.frame | 0 ) + ' picked=' + ( session.player.v.health > item.before || item.ent.free ) );
		tick( 0.05 );

	}
	log( 'autoplay done frames=' + frames() + ' pos=' + session.player.v.origin.map( v => Math.round( v ) ).join( ',' ) + ' yaw=' + Math.round( cl.viewangles[ 1 ] ) );

}
