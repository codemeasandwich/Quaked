import * as anim from '../src/r_anim.js';
import * as glquake from '../src/glquake.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function assertNear( actual, expected, epsilon, message ) {

	if ( Number.isFinite( actual ) !== true || Math.abs( actual - expected ) > epsilon )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

const model = {};

Deno.test( 'a pose change blends over the frame interval', () => {

	const e = { origin: [ 0, 0, 0 ] };

	let s = anim.R_AliasPoseBlend( e, model, 3, 10.00, 0.1 );
	assertEqual( s.blend, 1, 'first sight does not blend' );

	s = anim.R_AliasPoseBlend( e, model, 3, 10.05, 0.1 );
	assertEqual( s.blend, 1, 'same pose stays settled' );

	s = anim.R_AliasPoseBlend( e, model, 4, 10.10, 0.1 );
	assertEqual( s.from, 3, 'leaving the old pose' );
	assertEqual( s.to, 4, 'heading for the new pose' );
	assertNear( s.blend, 0, 1e-9, 'starts at the old pose' );

	s = anim.R_AliasPoseBlend( e, model, 4, 10.125, 0.1 );
	assertNear( s.blend, 0.25, 1e-6, 'a quarter of the way' );

	s = anim.R_AliasPoseBlend( e, model, 4, 10.15, 0.1 );
	assertNear( s.blend, 0.5, 1e-6, 'halfway' );

	s = anim.R_AliasPoseBlend( e, model, 4, 10.4, 0.1 );
	assertEqual( s.blend, 1, 'arrived' );

} );

// card [43]: some of the game's frame changes arrive a server frame early (about 0.083 s after the last: 7 of 47 in
// the browser audit of a dog's leap and a dog's and a Grunt's death); the next blend must start from the pose on screen,
// not snap the rest of the way to the last frame first (the mesh side is tested with real models in
// classic_alias_frames_test.js)
Deno.test( 'a pose change that comes early starts from the pose on screen, with no jump', () => {

	const e = { origin: [ 0, 0, 0 ] }, poses = { 3: [ 0, 0, 0 ], 4: [ 10, 0, 0 ], 5: [ 10, 10, 0 ] };
	const shown = s => { const out = [ 0, 0, 0 ], lead = [ 0, 0, 0 ];
		if ( s.lead ) { anim.R_BlendArrays( lead, poses[ s.lead.from ], poses[ s.lead.to ], s.lead.t ); anim.R_BlendArrays( out, lead, poses[ s.to ], s.blend ); }
		else anim.R_BlendArrays( out, poses[ s.from ], poses[ s.to ], s.blend ); return out; };
	anim.R_AliasPoseBlend( e, model, 3, 20.0, 0.1 );
	anim.R_AliasPoseBlend( e, model, 4, 20.1, 0.1 );
	let s = anim.R_AliasPoseBlend( e, model, 4, 20.1833, 0.1 ); const before = shown( s );
	assertNear( before[ 0 ], 8.33, .01, 'five sixths of the way to pose 4' );
	s = anim.R_AliasPoseBlend( e, model, 5, 20.1833, 0.1 );
	assertEqual( s.from, 4, 'the next blend leaves pose 4' ); assertEqual( s.to, 5, 'for pose 5' );
	assertNear( s.lead?.t, .833, .001, 'and remembers where it was on the way to 4' );
	const after = shown( s );
	for ( let k = 0; k < 3; k ++ ) assertNear( after[ k ], before[ k ], 1e-6, 'the pose on screen does not jump (' + k + ')' );
	s = anim.R_AliasPoseBlend( e, model, 5, 20.2333, 0.1 ); const mid = shown( s );
	assertNear( mid[ 0 ], 8.33 + ( 10 - 8.33 ) * .5, .01, 'halfway on, from where it was' ); assertNear( mid[ 1 ], 5, .01, 'and towards 5' );
	s = anim.R_AliasPoseBlend( e, model, 5, 20.3, 0.1 ); assertEqual( s.blend, 1, 'arrived' ); assertEqual( s.lead, null, 'the lead is done with' );
	// a change that comes on time or late leaves nothing to carry
	s = anim.R_AliasPoseBlend( e, model, 3, 20.4167, 0.1 ); assertEqual( s.lead, null, 'late (pose 5 settled): no lead' );
	// a fresh state (stale, foreign, a teleport) has none
	s = anim.R_AliasPoseBlend( e, model, 4, 20.45, 0.1 ); s = anim.R_AliasPoseBlend( e, model, 5, 21.5, 0.1 ); assertEqual( s.lead, null, 'restarted: no lead' );
	// how far it had got is by the last frame's own interval, not the next one's (a group frame's can differ)
	const g = { origin: [ 0, 0, 0 ] }; anim.R_AliasPoseBlend( g, model, 3, 30, 0.1 ); anim.R_AliasPoseBlend( g, model, 4, 30.1, 0.1 );
	s = anim.R_AliasPoseBlend( g, model, 5, 30.1833, 0.2 ); assertNear( s.lead?.t, .833, .001, 'the 0.1 s frame was five sixths done (not 0.42 by the next frame\'s 0.2 s)' );
	// a change exactly on time is not early, whatever the rounding
	const h = { origin: [ 0, 0, 0 ] }; anim.R_AliasPoseBlend( h, model, 3, 20.0, 0.1 ); anim.R_AliasPoseBlend( h, model, 4, 20.1, 0.1 );
	s = anim.R_AliasPoseBlend( h, model, 5, 20.2, 0.1 ); assertEqual( s.lead, null, 'on time (20.1 to 20.2): no lead' );

} );

Deno.test( 'group frames blend over their own interval', () => {

	const e = { origin: [ 0, 0, 0 ] };
	anim.R_AliasPoseBlend( e, model, 0, 5.00, 0.2 );
	anim.R_AliasPoseBlend( e, model, 1, 5.05, 0.2 );
	const s = anim.R_AliasPoseBlend( e, model, 1, 5.15, 0.2 );
	assertNear( s.blend, 0.5, 1e-6, '0.1 s into a 0.2 s frame' );

} );

Deno.test( 'no blending from a stale or foreign state', () => {

	const e = { origin: [ 0, 0, 0 ] };
	anim.R_AliasPoseBlend( e, model, 2, 1.0, 0.1 );

	// not drawn for a while (out of view): jump straight to the new pose
	let s = anim.R_AliasPoseBlend( e, model, 7, 3.0, 0.1 );
	assertEqual( s.blend, 1, 'stale state is dropped' );
	assertEqual( s.from, 7, 'and starts fresh' );

	// a different model
	s = anim.R_AliasPoseBlend( e, {}, 8, 3.05, 0.1 );
	assertEqual( s.blend, 1, 'model change resets' );

	// a teleport
	anim.R_AliasPoseBlend( e, model, 1, 4.0, 0.1 );
	e.origin = [ 5000, 0, 0 ];
	s = anim.R_AliasPoseBlend( e, model, 2, 4.05, 0.1 );
	assertEqual( s.blend, 1, 'a big jump is a teleport' );

	// time going backwards (a new level)
	s = anim.R_AliasPoseBlend( e, model, 3, 0.5, 0.1 );
	assertEqual( s.blend, 1, 'time reset' );

} );

Deno.test( 'blending arrays interpolates linearly', () => {

	const out = new Float32Array( 3 );
	anim.R_BlendArrays( out, [ 0, 10, - 4 ], [ 10, 20, 4 ], 0.25 );
	assertNear( out[ 0 ], 2.5, 1e-6, 'x' );
	assertNear( out[ 1 ], 12.5, 1e-6, 'y' );
	assertNear( out[ 2 ], - 2, 1e-6, 'z' );

} );

Deno.test( 'r_lerpmodels: off or Newer Game only, including legacy forced values', () => {

	const old = anim.r_lerpmodels.value;

	try {

		anim.R_AnimSetNewer( false );
		anim.r_lerpmodels.value = 1;
		assertEqual( anim.R_AnimEnabled(), false, 'classic lighting: off by default' );
		anim.R_AnimSetNewer( true );
		assertEqual( anim.R_AnimEnabled(), true, 'Newer Game: on' );
		anim.r_lerpmodels.value = 0;
		assertEqual( anim.R_AnimEnabled(), false, 'switched off' );
		anim.R_AnimSetNewer( false );
		anim.r_lerpmodels.value = 2;
		assertEqual( anim.R_AnimEnabled(), false, 'legacy forced preference cannot enable Classic frames' );
		anim.R_AnimSetNewer( true );
		assertEqual( anim.R_AnimEnabled(), true, 'legacy positive preference still enables enhanced frames' );

	} finally {

		anim.r_lerpmodels.value = old;
		anim.R_AnimSetNewer( false );

	}

} );

Deno.test( 'Newer Game forces smooth texture filtering without touching the user setting', () => {

	const texture = { magFilter: 1003, minFilter: 1003, generateMipmaps: true, anisotropy: 1, needsUpdate: false, userData: {} }; // (userData: as a THREE.Texture)
	glquake.GL_RegisterTexture( texture );

	try {

		assertEqual( glquake.gl_texturemode.value, 0, 'default is pixelated' );
		assertEqual( glquake.GL_TextureLinear(), false, 'classic: nearest' );

		glquake.GL_SetForceLinear( true );
		assertEqual( glquake.GL_TextureLinear(), true, 'forced smooth' );
		assertEqual( texture.magFilter, 1006, 'registered textures switch to linear' );
		assertEqual( texture.anisotropy, 16, 'and anisotropic' );
		assertEqual( glquake.gl_texturemode.value, 0, 'the user setting is untouched' );

		glquake.GL_SetForceLinear( false );
		assertEqual( texture.magFilter, 1003, 'back to nearest' );
		assertEqual( texture.anisotropy, 1, 'and isotropic' );

	} finally {

		glquake.GL_SetForceLinear( false );
		glquake.GL_UnregisterTexture( texture );

	}

} );

Deno.test( 'walking monsters glide between the game\'s steps', async () => {

	const { R_SmoothMove } = await import( '../src/r_anim.js' );

	// stepped 10 units every 0.1 s, drawn at 60 fps
	const e = { origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ], model: { flags: 0 } };
	const shown = [];
	for ( let f = 0; f < 90; f ++ ) {

		const t = 1 + f / 60;
		e.origin = [ Math.floor( ( t - 1 ) / 0.1 ) * 10, 0, 0 ];
		e.angles = [ 0, 0, 0 ];
		R_SmoothMove( e, t );
		shown.push( e.origin[ 0 ] );

	}

	// moves nearly every frame (raw would only change every sixth) and never goes backwards
	let changes = 0;
	for ( let i = 1; i < shown.length; i ++ ) {

		if ( shown[ i ] < shown[ i - 1 ] - 1e-9 ) throw new Error( 'went backwards' );
		if ( shown[ i ] !== shown[ i - 1 ] ) changes ++;

	}

	if ( changes < 70 ) throw new Error( 'not gliding: ' + changes + ' changes in 89 frames' );

	// drawn twice in one frame shows the same thing
	const first = e.origin[ 0 ];
	e.origin = [ 9999, 0, 0 ];
	R_SmoothMove( e, 1 + 89 / 60 );
	if ( e.origin[ 0 ] !== first ) throw new Error( 'a second draw in the same frame changed it' );

	// a fast mover (a rocket) and a teleport are left alone
	const rocket = { origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ], model: { flags: 1 } };
	R_SmoothMove( rocket, 5 );
	rocket.origin = [ 30, 0, 0 ]; R_SmoothMove( rocket, 5.1 );
	if ( rocket.origin[ 0 ] !== 30 ) throw new Error( 'a rocket is not smoothed' );

	const tele = { origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ], model: { flags: 0 } };
	R_SmoothMove( tele, 7 );
	tele.origin = [ 500, 0, 0 ]; R_SmoothMove( tele, 7.1 );
	if ( tele.origin[ 0 ] !== 500 ) throw new Error( 'a teleport is not smoothed' );

} );
