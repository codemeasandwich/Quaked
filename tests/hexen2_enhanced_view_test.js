// Public screen update: Enhanced keeps Hexen's held view above its native bar, while Quake still fills the screen.
import * as screen from '../src/engine/render/gl_screen.js';
import * as draw from '../src/engine/render/gl_draw.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as cvar from '../src/engine/common/cvar.js';
import { Con_Init } from '../src/engine/common/console.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { sb_lines } from '../src/engine/client/sbar.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );

function fixture( run ) {

	const oldWindow = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	globalThis.window = { devicePixelRatio: 1 };
	const vid = { width: 640, height: 480, recalc_refdef: true };
	const cl = { intermission: 0, paused: false, worldmodel: null, time: 0 };
	const refdef = { vrect: {} };
	let inset = 0, frames = 0;
	try {

		cmd.Cbuf_Init(); cmd.Cmd_Init(); Con_Init();
		if ( ! cvar.Cvar_FindVar( 'r_hdr' ) ) cvar.Cvar_RegisterVariable( r_hdr );
		draw.Draw_SetExternals( { vid } );
		screen.SCR_SetExternals( { vid, cl, cls: { state: 0, signon: 0, demoplayback: false }, r_refdef: refdef,
			V_RenderView: () => { frames ++; }, Touch_BottomInset: () => inset } );
		screen.SCR_Init();
		run( { vid, cl, refdef, frame( profile, enhanced, size, touch = 0 ) {

			GameProfile_Set( profile );
			cvar.Cvar_SetValue( 'r_hdr', enhanced );
			cvar.Cvar_SetValue( 'viewsize', size );
			inset = touch; window.innerHeight = vid.height; vid.recalc_refdef = true;
			const before = frames;
			screen.SCR_UpdateScreen();
			same( frames, before + 1, 'public screen update renders the view' );
			return { ...refdef.vrect, fov_x: refdef.fov_x, fov_y: refdef.fov_y };

		} } );

	} finally {

		GameProfile_Set( 'quake' );
		if ( oldWindow ) Object.defineProperty( globalThis, 'window', oldWindow ); else delete globalThis.window;

	}

}

Deno.test( 'Quake Enhanced retains its full-height view and Classic bar reservation', () => fixture( ( { frame } ) => {

	const classic = frame( 'quake', 0, 100 ), enhanced = frame( 'quake', 1, 100 );
	same( classic.height, draw.Draw_GetVirtualHeight() - 48, 'Classic bar reservation' );
	same( enhanced.height, draw.Draw_GetVirtualHeight(), 'Enhanced full height' );
	same( enhanced.y, 0, 'Enhanced top' );
	same( enhanced.fov_y, classic.fov_y, 'vertical FOV unchanged' );

} ) );

for ( const id of [ 'hexen2', 'hexen2-demo', 'hexen2-portals' ] ) Deno.test( id + ' Enhanced keeps the Classic view rectangle and FOV', () => fixture( ( { frame, vid, cl } ) => {

	for ( const [ width, height ] of [ [ 640, 480 ], [ 1280, 720 ], [ 480, 800 ] ] ) {

		Object.assign( vid, { width, height } );
		for ( const inset of [ 0, 72 ] ) for ( const size of [ 80, 90, 100, 110, 120 ] ) {

			const classic = frame( id, 0, size, inset ), enhanced = frame( id, 1, size, inset );
			same( JSON.stringify( enhanced ), JSON.stringify( classic ), `${id} ${width}x${height}, size ${size}, inset ${inset}` );
			if ( size === 100 || size === 110 ) same( enhanced.height, draw.Draw_GetVirtualHeight() - sb_lines - Math.round( inset * draw.Draw_GetVirtualHeight() / vid.height ), 'screen minus bar and touch controls' );
			same( r_hdr.value, 1, 'Enhanced remains on' );

		}

	}
	cl.intermission = 1;
	same( frame( id, 1, 100 ).height, draw.Draw_GetVirtualHeight(), 'intermission remains full height' );

} ) );
