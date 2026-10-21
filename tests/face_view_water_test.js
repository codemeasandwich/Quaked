// Public renderer -> HUD regression: the rendered eye can cross water while the
// recorded body stays dry (bob, stair smoothing or a demo camera offset).
import { cl, cls, cl_entities, ca_connected, CSHIFT_CONTENTS } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { sv } from '../src/engine/server/server.js';
import { R_SetupFrame, R_SetExternals } from '../src/engine/render/gl_rmain.js';
import { r_refdef } from '../src/engine/render/render.js';
import { V_SetContentsColor } from '../src/engine/client/view.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { STAT_HEALTH, IT_SUIT } from '../src/engine/common/quakedef.js';
import { R_PlayerFaceFrame, R_FaceWater } from '../src/newer/ui/r_facegame.js';
import { CL_PlayerWater } from '../src/newer/gameplay/cl_water.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );

function fixture( contents = - 3 ) {

	sv.active = false; sv.edicts = [];
	CL_ClearState(); cls.state = ca_connected; cls.signon = 4; cls.demoplayback = true; cls.demofile = {};
	cl.worldmodel = { nodes: [ { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 },
		children: [ { contents: - 1 }, { contents } ] } ] };
	cl.time = 10; cl.stats[ STAT_HEALTH ] = 100; cl.viewentity = 1; cl.viewheight = 22;
	cl_entities[ 1 ].origin.set( [ 0, 0, 40 ] );
	R_SetExternals( { V_SetContentsColor, V_CalcBlend: () => {} } );
	r_refdef.viewangles.fill( 0 );
	return z => { r_refdef.vieworg.set( [ 0, 0, z ] ); R_SetupFrame(); return R_PlayerFaceFrame(); };

}

for ( const profile of [ 'quake', 'hexen2' ] ) Deno.test( `${profile} demo face follows the rendered water view, fills and drains without a server`, () => {

	GameProfile_Set( profile );
	try {
		const view = fixture();
		same( CL_PlayerWater().submerged, false, 'recorded body is dry' );
		let face = view( - 10 );
		check( cl.cshifts[ CSHIFT_CONTENTS ].percent > 0, 'real view contents drive underwater tint' );
		same( face.waterSubmerged, true, 'HUD uses the same underwater view' );
		same( face.waterStage, 1, 'entry immediately shows W1' );
		same( face.waterKnown, false, 'demo never borrows server air' );
		same( face.waterEstimated, true, 'demo reserve is visual only' );
		cl.time += 6; face = view( - 10 );
		same( face.waterPercent, 50, 'six seconds consumes half the visual reserve' );
		same( face.waterStage, 6, 'unchanged fill stages' );
		// The audio/body observation must not reset the HUD estimate when the two disagree.
		for ( let i = 0; i < 4; i ++ ) { CL_PlayerWater(); same( R_FaceWater().waterPercent, 50, 'repeated reads do not reset or consume reserve' ); }
		cl_entities[ 1 ].origin[ 2 ] = - 40;
		face = view( 10 );
		same( cl.cshifts[ CSHIFT_CONTENTS ].percent, 0, 'surfaced view has no water tint' );
		same( face.waterSubmerged, false, 'dry view wins over submerged body' );
		same( face.waterStage, 6, 'surfacing starts the existing drain' );
		cl.time += .05; same( view( 10 ).waterStage, 5, 'one drain frame per fifty game milliseconds' );
		cl.time += .25; same( view( 10 ).waterStage, 0, 'drain completes' );
	} finally { GameProfile_Set( 'quake' ); CL_ClearState(); }

} );

Deno.test( 'view water needs no recorded player entity and keeps suit, rewind, death and world resets', () => {

	const view = fixture(); cl.viewentity = 0;
	same( view( - 10 ).waterStage, 1, 'view leaf alone proves submersion' );
	cl.time += 8; same( view( - 10 ).waterStage, 7, 'fills without player geometry' );
	cl.items = IT_SUIT; same( view( - 10 ).waterStage, 1, 'suit replenishes reserve' );
	cl.items = 0; cl.time += 6; same( view( - 10 ).waterStage, 6, 'reserve resumes' );
	cl.time -= 4; same( view( - 10 ).waterStage, 1, 'rewind resets reserve' );
	cl.stats[ STAT_HEALTH ] = 0; same( view( - 10 ).waterStage, 0, 'death clears overlay' );
	cl.stats[ STAT_HEALTH ] = 100; same( view( - 10 ).waterStage, 1, 'new life starts fresh' );
	cl.worldmodel = { nodes: [ { contents: - 1 } ] };
	same( R_FaceWater().waterStage, 0, 'old view sample cannot cross worlds' );
	cl.worldmodel = null; R_SetupFrame(); same( R_FaceWater().waterStage, 0, 'missing world clears overlay' );
	same( cl.cshifts[ CSHIFT_CONTENTS ].percent, 0, 'missing world clears old water tint' );
	CL_ClearState(); same( R_FaceWater().waterStage, 0, 'client clear discards view observation' );

} );

Deno.test( 'slime and lava views use the shared liquid classification', () => {

	for ( const contents of [ - 4, - 5 ] ) {
		const view = fixture( contents );
		same( view( - 10 ).waterStage, 1, 'liquid entry shows water overlay' );
		cl.time += 6; same( view( - 10 ).waterStage, 6, 'liquid fill uses existing timing' );
	}
	CL_ClearState();

} );
