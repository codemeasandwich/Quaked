// Card [44q]: in local play the client links its non-player entities from QW-style packet entities. An entity the
// packet path had linked kept that frame's message time, so on the next frame without a new packet the NQ loop in
// CL_RelinkEntities took it as current and listed it, and the packet path listed it again: drawn twice. Through the
// public CL_RelinkEntities, on a real model from the shareware pak.
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { cl, cls, cl_entities, cl_visedicts, cl_numvisedicts } from '../src/engine/client/client.js';
import { CL_RelinkEntities } from '../src/engine/client/cl_main.js';
import { CL_GetEntityFrame, CL_SetServerSequence, CL_SetValidSequence } from '../src/engine/client/cl_pred.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();

// how many times each entity is in this frame's list
const listed = () => { const n = new Map(); for ( let i = 0; i < cl_numvisedicts; i ++ ) n.set( cl_visedicts[ i ], ( n.get( cl_visedicts[ i ] ) || 0 ) + 1 ); return n; };

Deno.test( 'local play lists each packet entity once a frame, with or without a new packet', () => {
	const saved = { demo: cls.demoplayback, max: cl.maxclients, num: cl.num_entities, models: cl.model_precache.slice(), mtime: [ ...cl.mtime ], time: cl.time, view: cl.viewentity };
	try {
		const NUMBER = 5;
		cls.demoplayback = false; cl.maxclients = 1; cl.viewentity = 1; cl.num_entities = NUMBER + 1;
		cl.model_precache.fill( null ); cl.model_precache[ 2 ] = Mod_ForName( 'progs/spike.mdl', true );
		for ( let i = 1; i <= NUMBER; i ++ ) { cl_entities[ i ].model = null; cl_entities[ i ].forcelink = false; }
		// one packet: entity 5, a nail in flight
		const seq = 7, frame = CL_GetEntityFrame( seq );
		frame.invalid = false; frame.packet_entities.num_entities = 1;
		const s = frame.packet_entities.entities[ 0 ];
		s.number = NUMBER; s.modelindex = 2; s.frame = 0; s.skin = 0; s.effects = 0; s.colormap = 0; s.origin.set( [ 100, 200, 300 ] ); s.angles.set( [ 0, 90, 0 ] );
		CL_SetServerSequence( seq ); CL_SetValidSequence( seq );
		// the frame the packet arrives
		cl.mtime[ 1 ] = 0.9; cl.mtime[ 0 ] = 1; cl.time = 1;
		CL_RelinkEntities();
		check( listed().get( cl_entities[ NUMBER ] ) === 1, 'the frame with the packet: listed once (' + listed().get( cl_entities[ NUMBER ] ) + ')' );
		// a later frame, no new packet (the usual case between server frames)
		cl.time = 1.02;
		CL_RelinkEntities();
		const n = listed().get( cl_entities[ NUMBER ] );
		check( n === 1, 'a frame without a new packet: listed once, not ' + n );
		check( [ ...listed().values() ].every( c => c === 1 ), 'no entity listed twice' );
		// the next packet no longer has it (the server drops a removed entity from the packet): not listed, model cleared
		const next = CL_GetEntityFrame( seq + 1 ); next.invalid = false; next.packet_entities.num_entities = 0;
		CL_SetServerSequence( seq + 1 ); CL_SetValidSequence( seq + 1 ); cl.mtime[ 1 ] = 1; cl.mtime[ 0 ] = 1.1; cl.time = 1.1;
		CL_RelinkEntities();
		check( ! listed().has( cl_entities[ NUMBER ] ) && cl_entities[ NUMBER ].model === null, 'gone from the packet: not listed, its model cleared' );
		// (defence only: the server never sends a model-0 entity in a packet) one marked model 0 is not listed either
		s.modelindex = 0; CL_SetServerSequence( seq ); CL_SetValidSequence( seq ); cl_entities[ NUMBER ].model = Mod_ForName( 'progs/spike.mdl', true );
		cl.mtime[ 1 ] = 1.1; cl.mtime[ 0 ] = 1.2; cl.time = 1.2;
		CL_RelinkEntities();
		check( ! listed().has( cl_entities[ NUMBER ] ) && cl_entities[ NUMBER ].model === null, 'a model-0 packet entity: not listed, its old model cleared' );
	} finally {
		cls.demoplayback = saved.demo; cl.maxclients = saved.max; cl.num_entities = saved.num; cl.viewentity = saved.view;
		saved.models.forEach( ( m, i ) => { cl.model_precache[ i ] = m; } ); cl.mtime[ 0 ] = saved.mtime[ 0 ]; cl.mtime[ 1 ] = saved.mtime[ 1 ]; cl.time = saved.time;
		CL_SetValidSequence( 0 );
	}
} );
