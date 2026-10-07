import { Rend_ParseRecord } from './sv_rendveil.js';
// What stands in another level, for drawing it from here (see r_levelview.js):
// its monsters, items, torches and brush entities (secret doors, false walls,
// doors, buttons), from the level's entity list or, for a level you have been in,
// from how you left it (dead monsters stay dead, picked-up items stay gone).
//
// The game itself only sets these up when it runs the level, so the models are
// chosen here the way the QuakeC spawn functions do.

import { R_ParseEntityLump } from './r_levelgraph.js';
import { Axe_ParseRecord, Axe_ValidOwnerKey } from './axe_record.js';

const MONSTERS = {
	monster_army: 'soldier', monster_dog: 'dog', monster_ogre: 'ogre', monster_ogre_marksman: 'ogre',
	monster_knight: 'knight', monster_zombie: 'zombie', monster_wizard: 'wizard', monster_demon1: 'demon',
	monster_shambler: 'shambler', monster_enforcer: 'enforcer', monster_fish: 'fish',
	monster_hell_knight: 'hknight', monster_shalrath: 'shalrath', monster_tarbaby: 'tarbaby',
	monster_boss: 'boss', monster_oldone: 'oldone'
};

const WEAPONS = {
	weapon_supershotgun: 'g_shot', weapon_nailgun: 'g_nail', weapon_supernailgun: 'g_nail2',
	weapon_grenadelauncher: 'g_rock', weapon_rocketlauncher: 'g_rock2', weapon_lightning: 'g_light'
};

const ARTIFACTS = {
	item_artifact_envirosuit: 'suit', item_artifact_invulnerability: 'invulner',
	item_artifact_invisibility: 'invisibl', item_artifact_super_damage: 'quaddama'
};

// ammo boxes: brush models, small and (spawnflags 1) large
const AMMO = { item_shells: 'shell', item_spikes: 'nail', item_rockets: 'rock', item_cells: 'batt' };

const TORCHES = {
	light_torch_small_walltorch: 'flame', light_flame_small_yellow: 'flame2',
	light_flame_large_yellow: 'flame2', light_flame_small_white: 'flame2'
};

export function R_FramePrefix( name ) {

	return String( name ).replace( /\d+$/, '' );

}

function vec( s ) {

	const v = [ 0, 0, 0 ];
	if ( s == null ) return v;
	const p = String( s ).trim().split( /\s+/ );
	for ( let i = 0; i < 3 && i < p.length; i ++ ) v[ i ] = parseFloat( p[ i ] ) || 0;
	return v;

}

// the model an entity from a level's entity list would set for itself, with its skin
function modelFor( ent, worldtype ) {

	const c = ent.classname;
	const flags = parseInt( ent.spawnflags, 10 ) || 0;

	if ( MONSTERS[ c ] !== undefined ) return { model: 'progs/' + MONSTERS[ c ] + '.mdl', skin: 0 };
	if ( WEAPONS[ c ] !== undefined ) return { model: 'progs/' + WEAPONS[ c ] + '.mdl', skin: 0 };
	if ( ARTIFACTS[ c ] !== undefined ) return { model: 'progs/' + ARTIFACTS[ c ] + '.mdl', skin: 0 };
	if ( TORCHES[ c ] !== undefined ) return { model: 'progs/' + TORCHES[ c ] + '.mdl', skin: 0 };
	if ( AMMO[ c ] !== undefined ) return { model: 'maps/b_' + AMMO[ c ] + ( flags & 1 ? '1' : '0' ) + '.bsp', skin: 0 };

	switch ( c ) {

		case 'item_armor1': return { model: 'progs/armor.mdl', skin: 0 };
		case 'item_armor2': return { model: 'progs/armor.mdl', skin: 1 };
		case 'item_armorInv': return { model: 'progs/armor.mdl', skin: 2 };
		case 'item_health': return { model: 'maps/b_bh' + ( flags & 2 ? '100' : flags & 1 ? '10' : '25' ) + '.bsp', skin: 0 };
		case 'item_key1':
		case 'item_key2': {

			const kind = c === 'item_key1' ? 's' : 'g';
			return { model: 'progs/' + [ 'w_', 'm_', 'b_' ][ worldtype ] + kind + '_key.mdl', skin: 0 };

		}
		case 'misc_explobox': return { model: 'maps/b_explob.bsp', skin: 0 };
		case 'misc_explobox2': return { model: 'maps/b_exbox2.bsp', skin: 0 };

	}

	return null;

}

/*
================
R_LevelEntities

The things to draw of a level: [ { kind: 'alias' | 'bsp' | 'brush', model, origin,
angles, frame, skin, classname } ].

text is the level's entity lump (model.entities), snapshot the entities as they were
when you left it (or null), submodels the level's brush models (for their size),
skill 0-3.
================
*/
export function R_LevelEntities( text, snapshot, submodels, skill ) {

	const lump = R_ParseEntityLump( text || '' );
	const world = lump.length > 0 ? lump[ 0 ] : {};
	const worldtype = Math.max( 0, Math.min( 2, parseInt( world.worldtype, 10 ) || 0 ) );

	const out = [];
	const cutKey=ent=>Axe_ValidOwnerKey(ent._newer_axe_owner)?ent._newer_axe_owner:
		Number(ent._snapshot_index)>0?'slot:'+ent._snapshot_index:null;
	const cutOwners=new Set((snapshot||[]).filter(ent=>ent._newer_axe_corpse!==undefined).map(cutKey).filter(Boolean));

	const add = ( ent, fromSnapshot ) => {
		if(fromSnapshot&&ent._newer_axe_corpse!==undefined){let record=Axe_ParseRecord(ent._newer_axe_corpse);if(record?.key&&Axe_ValidOwnerKey(ent._newer_axe_owner)&&record.key!==ent._newer_axe_owner)record=null;out.push({kind:'axe',record,cutKey:cutKey(ent),origin:record?.origin||vec(ent.origin),time:Number.isFinite(Number(ent._snapshot_time))?Number(ent._snapshot_time):record?.at||0});return;}
		let fallbackFor=null;
		if(fromSnapshot&&ent._newer_axe_hidden!==undefined){
			const owner=Axe_ValidOwnerKey(ent._newer_axe_owner)?ent._newer_axe_owner:Number(ent._newer_axe_hidden)>0?'slot:'+ent._newer_axe_hidden:null;
			if(!cutOwners.has(owner))return; // an expired, already-replaced corpse
			fallbackFor=owner;
		}

		// Native ThrowGib and the size-scaled gore allocator do not assign a
		// classname. Their explicit saved model still defines a valid corpse.
		const c = ent.classname ?? (fromSnapshot&&(fallbackFor||/^progs\/(gib[123]|zom_gib|h_[a-z0-9_]+)\.mdl$/.test(ent.model||''))?'':undefined);
		if ( c === undefined || c.indexOf( 'trigger' ) === 0 || c.indexOf( 'info_' ) === 0 ) return;

		let origin = vec( ent.origin );
		const angles = ent.angles !== undefined ? vec( ent.angles ) : [ 0, ent.angle !== undefined ? parseFloat( ent.angle ) || 0 : 0, 0 ];
		let model;
		let skin = parseInt( ent.skin, 10 ) || 0;

		if ( fromSnapshot === false ) {

			// the skill the level is played on takes some entities out (spawnflags)
			const flags = parseInt( ent.spawnflags, 10 ) || 0;
			if ( skill === 0 && ( flags & 256 ) ) return;
			if ( skill === 1 && ( flags & 512 ) ) return;
			if ( skill >= 2 && ( flags & 1024 ) ) return;

		}

		if ( ent.model !== undefined && ent.model !== '' ) {

			model = ent.model;

		} else if ( fromSnapshot === false ) {

			const m = modelFor( ent, worldtype );
			if ( m === null ) return;
			model = m.model;
			skin = m.skin;

		} else {

			return; // no model: nothing there to see (an item that was picked up)

		}

		if ( model.charAt( 0 ) === '*' ) {

			const sm = submodels != null ? submodels[ parseInt( model.slice( 1 ), 10 ) ] : undefined;
			if ( sm === undefined ) return;

			// a train stands at its first stop, which is not worked out here
			if ( c === 'func_train' ) return;

			// a platform starts at the bottom of its travel
			if ( fromSnapshot === false && c === 'func_plat' ) {

				const height = ent.height !== undefined ? parseFloat( ent.height ) : sm.maxs[ 2 ] - sm.mins[ 2 ] - 8;
				origin = [ origin[ 0 ], origin[ 1 ], origin[ 2 ] - height ];

			}

			out.push( { kind: 'brush', classname: c, model, submodel: sm, origin, angles, frame: 0, skin: 0 } );
			return;

		}

		if ( /\.bsp$/.test( model ) ) {

			out.push( { kind: 'bsp', classname: c, model, origin, angles, frame: 0, skin: 0 } );
			return;

		}

		const rendVeil = fromSnapshot && Number( ent.health ) > 0 && c.startsWith( 'monster_' ) ? Rend_ParseRecord( ent._newer_rend_veil ) : null;
		const snapshotTime = Number( ent._snapshot_time );
		out.push( { kind: fallbackFor?'axeFallback':'alias', ...(fallbackFor?{fallbackFor}:{}), classname: c, model, origin, angles, frame: parseInt( ent.frame, 10 ) || 0, skin, fromSnapshot,
			rendVeil: rendVeil?.model === model ? rendVeil : null, rendVeilTime: Number.isFinite( snapshotTime ) ? snapshotTime : null } );

	};

	if ( snapshot != null ) {

		for ( const ent of snapshot ) add( ent, true );

	} else {

		for ( const ent of lump ) add( ent, false );

	}

	return out;

}
