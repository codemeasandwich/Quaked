// Gameplay adapter: events choose expression/attention; movement never does.
import { FaceState, FaceWaterState, faceWaterStage } from './face_state.js';
import { cl, cls } from './client.js';
import { in_attack } from './cl_input.js';
import { sv, MOVETYPE_NOCLIP } from './server.js';
import { GetEdictFieldValue } from './pr_edict.js';
import { SV_FaceDrain, SV_FaceLocalActive, SV_FaceReset } from './sv_faceevents.js';
import { IT_AXE, IT_QUAD, IT_INVULNERABILITY, IT_INVISIBILITY, IT_SUIT, STAT_HEALTH, STAT_WEAPONFRAME } from './quakedef.js';
const live = new FaceState(), demo = new FaceState();
const waterVisual=new FaceWaterState();
let liveWorld, demoWorld, lastFrame = -1, lastWeaponFrame = 0;
let liveEdicts, demoFile;
export function R_FaceGameReset(){live.reset();demo.reset();waterVisual.reset();liveWorld=demoWorld=liveEdicts=demoFile=undefined;lastFrame=-1;lastWeaponFrame=0;}
function controller( client = cl ) {
	const playback = cls.demoplayback, state = playback ? demo : live;
	if ( playback ? demoWorld !== client.worldmodel || demoFile!==cls.demofile : liveWorld !== client.worldmodel || liveEdicts!==sv.edicts ) {
		state.reset( client.time ); if ( playback ) demoWorld = client.worldmodel; else liveWorld = client.worldmodel;
		if(playback)demoFile=cls.demofile;else liveEdicts=sv.edicts;
		lastFrame = -1; lastWeaponFrame = 0;
	}
	return state;
}
export function faceImpactAngle( from, origin, angles ) {
	const x = from[ 0 ] - origin[ 0 ], y = from[ 1 ] - origin[ 1 ];
	if ( Math.hypot( x, y ) < 1 ) return null;
	// Quake yaw grows counterclockwise: negate for positive HUD-right angles.
	return - ( Math.atan2( y, x ) * 180 / Math.PI - angles[ 1 ] );
}
export function R_FaceDamage( armor, blood, from, origin, angles ) {
	const state = controller(), events = cls.demoplayback ? [] : SV_FaceDrain( 'damage' );
	if ( events.length ) {
		for ( const event of events ) state.damage( { time: cl.time - Math.max( 0, sv.time - event.time ), receivedTime: cl.time, impactTime: event.time, healthLoss: event.loss, amount: event.amount ?? event.loss,
			angle: event.angle === null ? null : faceImpactAngle( event.source, event.origin, event.viewAngles ) } );
	} else if ( cls.demoplayback || ! SV_FaceLocalActive() ) state.damage( { time: cl.time, healthLoss: blood, amount: armor + blood, angle: faceImpactAngle( from, origin, angles ) } );
}
export function R_FaceInventory( before, after ) {
	// Initial spawn inventory is a baseline, not a reward; signon guards that.
	const powers = SV_FaceLocalActive() ? 0 : IT_QUAD | IT_INVULNERABILITY | IT_INVISIBILITY;
	if ( cls.signon === 4 && ( after & ~before & ( 127 | IT_AXE | powers ) ) ) controller().reward( cl.time );
}
export function R_FaceSecret() { if ( cls.signon === 4 ) controller().reward( cl.time ); }
// Health transitions must reach the controller even with HUD/console hidden.
export function R_FaceHealthChanged( health ) {
	const state = controller(), respawning = state.dead && health > 0;
	if(health<=0 || respawning)waterVisual.reset();
	state.life( health, cl.time );
	if ( respawning && ! cls.demoplayback ) SV_FaceReset();
}
export function R_FaceShot( cadence = .6 ) { controller().shot( { time: cl.time, cadence } ); }

// Stock native WaterMove refreshes air_finished=time+12 below waterlevel3;
// CheckPowerups refreshes it while the suit timer is active. Read that clock,
// never start a second breathing timer or infer head submersion from SU_INWATER.
export function R_FaceWater(client=cl) {
	const known=client===cl && !cls.demoplayback && SV_FaceLocalActive() && client.worldmodel===sv.worldmodel;
	const p=known?sv.edicts[1]:null,field=p&&GetEdictFieldValue(p,'air_finished');
	let waterPercent=0;
	const waterSubmerged=!!(field && p.v.waterlevel===3 && p.v.health>0 && p.v.movetype!==MOVETYPE_NOCLIP);
	if(waterSubmerged) {
		const air=field.accessor.getFloat(field.ofs);
		if(Number.isFinite(air))waterPercent=Math.max(0,Math.min(100,(12-(air-sv.time))/12*100));
	}
	const stage=waterVisual.frame({time:client.time,epoch:sv.edicts,submerged:waterSubmerged,stage:faceWaterStage(waterPercent,waterSubmerged),enabled:!!(known&&field&&p.v.health>0&&p.v.movetype!==MOVETYPE_NOCLIP)});
	return {waterPercent,waterSubmerged,waterStage:stage,waterVisualStage:stage,waterOpacity:50,waterKnown:!!(known&&field)};
}
export function R_PlayerFaceFrame( client = cl ) {
	const state = controller( client ), native = ! cls.demoplayback && SV_FaceLocalActive();
	const shots = cls.demoplayback ? [] : SV_FaceDrain( 'shot' );
	for ( const shot of shots ) state.shot( { time: client.time - Math.max( 0, sv.time - shot.time ), receivedTime: client.time, cadence: shot.cadence } );
	if ( ! cls.demoplayback ) for ( const reward of SV_FaceDrain( 'reward' ) ) {
		if ( cls.signon === 4 ) state.reward( client.time - Math.max( 0, sv.time - reward.time ), client.time );
	}
	// Remote/demo protocols have no native firing hook. A changing nonzero weapon
	// cycle is evidence of activity; merely holding an empty weapon is not.
	const weaponFrame = client.stats[ STAT_WEAPONFRAME ];
	if ( ! native && client.time !== lastFrame && weaponFrame > 0 && weaponFrame !== lastWeaponFrame && ! shots.length ) state.shot( { time: client.time, cadence: .6 } );
	lastFrame = client.time; lastWeaponFrame = weaponFrame;
	return {...state.frame( { time: client.time, health: client.stats[ STAT_HEALTH ],
		attacking: native ? Boolean( in_attack.state & 1 ) : cls.demoplayback ? weaponFrame > 0 : Boolean( in_attack.state & 1 ) || weaponFrame > 0,
		strength: Boolean( client.items & IT_QUAD ), invulnerability: Boolean( client.items & IT_INVULNERABILITY ), invisibility: Boolean( client.items & IT_INVISIBILITY ) } ),divingSuit:Boolean(client.items&IT_SUIT),...R_FaceWater(client)};
}
