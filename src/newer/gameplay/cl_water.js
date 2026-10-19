/**
 * Read-only player water observation shared by the HUD and player sound cues.
 * Live single-player air comes exclusively from QC's air_finished. Demos do not
 * transmit that field: their BSP/recorded eye position supplies submersion and a
 * twelve-second VISUAL estimate, never health, damage or a server timer.
 */
import { cl, cls, cl_entities } from '../../engine/client/client.js';
import { sv, MOVETYPE_NOCLIP } from '../../engine/server/server.js';
import { GetEdictFieldValue } from '../../engine/progs/pr_edict.js';
import { Mod_PointInLeaf } from '../../engine/render/gl_model.js';
import { CONTENTS_WATER, CONTENTS_LAVA } from '../../engine/common/bspfile.js';
import { IT_SUIT, STAT_HEALTH } from '../../engine/common/quakedef.js';
import { SV_FaceLocalActive } from './sv_faceevents.js';

let world, file, edicts, playback, epoch, lastTime = -Infinity, entered = null;
const clamp = value => Math.max( 0, Math.min( 100, value ) );
const liquid = contents => contents <= CONTENTS_WATER && contents >= CONTENTS_LAVA;

/** Clears visual demo history on CL_ClearState, including a same-world restart. */
export function CL_WaterReset() {
	world = file = edicts = playback = undefined; epoch = {}; lastTime = -Infinity; entered = null;
}

/**
 * Returns water classification, motion and air consumption without mutating the
 * client, server or QC. Geometry may classify remote/custom-program water, while remote air stays unknown. Repeated reads at one
 * game time do not consume air; new worlds/files, rewind, death and surfacing
 * reset the demo estimate. Native air is never estimated.
 */
export function CL_PlayerWater( client = cl ) {
	if ( world !== client.worldmodel || file !== cls.demofile || edicts !== sv.edicts || playback !== cls.demoplayback || client.time < lastTime ) {
		CL_WaterReset(); world = client.worldmodel; file = cls.demofile; edicts = sv.edicts; playback = cls.demoplayback;
	}
	lastTime = client.time;
	let known = false, airKnown = false, submerged = false, water = false, level = 0, waterPercent = 0;
	let velocity = client.velocity;
	const local = client === cl && ! cls.demoplayback && SV_FaceLocalActive() && client.worldmodel === sv.worldmodel;
	// SV_FaceLocalActive proves client 0 owns edict 1; no client viewentity
	// dependency (it may be unset during signon or a native public test).
	const player = local ? sv.edicts?.[ 1 ] : null;
	if ( player && player.v.health > 0 && player.v.movetype !== MOVETYPE_NOCLIP ) {
		known = true; level = player.v.waterlevel; submerged = level === 3;
		water = level > 0 && player.v.watertype === CONTENTS_WATER;
		velocity = player.v.velocity;
		const field = GetEdictFieldValue( player, 'air_finished' );
		const air = field?.accessor.getFloat( field.ofs );
		airKnown = Number.isFinite( air );
		if ( submerged && airKnown ) waterPercent = clamp( ( 12 - ( air - sv.time ) ) / 12 * 100 );
	} else if ( ! local && client === cl && client.worldmodel?.nodes?.length && client.stats[ STAT_HEALTH ] > 0 ) {
		const origin = cl_entities[ client.viewentity ]?.origin;
		if ( origin && client.viewentity > 0 ) {
			known = true;
			const contents = offset => Mod_PointInLeaf( [ origin[ 0 ], origin[ 1 ], origin[ 2 ] + offset ], client.worldmodel ).contents;
			const feet = contents( -23 ), waist = contents( -4 ), eye = contents( client.viewheight );
			level = liquid( feet ) ? ( liquid( waist ) ? ( liquid( eye ) ? 3 : 2 ) : 1 ) : 0;
			submerged = level === 3; water = level > 0 && feet === CONTENTS_WATER;
			if ( ! submerged || ( client.items & IT_SUIT ) !== 0 ) entered = null;
			if ( submerged && cls.demoplayback ) {
				entered ??= client.time;
				waterPercent = clamp( ( client.time - entered ) / 12 * 100 );
			}
		}
	}
	if ( ! known || ! submerged ) entered = null;
	const moving = Math.hypot( velocity?.[ 0 ] ?? 0, velocity?.[ 1 ] ?? 0 ) > 20;
	return { known, airKnown, waterPercent, submerged, water, moving, epoch,
		filling: submerged && waterPercent < 90 && ( client.items & IT_SUIT ) === 0 && ( airKnown || cls.demoplayback ),
		wading: water && level > 0 && level < 3 && moving && client.onground };
}
