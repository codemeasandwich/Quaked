/**
 * @module newer/ui/face_state
 *
 * The status-bar face's behaviour (expression and attention), in game time.
 *
 * Types: exported classes `FaceWaterState`, `FaceState`.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Gloom Hood behavior is independent of the artwork and of player movement.
// Time is game time: pause freezes reactions, and a restored clock resets them.
export const FACE_LOOKS = Object.freeze( [ 'head_left', 'eyes_left', 'front', 'eyes_right', 'head_right' ] );
/**
 * The face's water (air-use) overlay stage. Owner amendment: entering water shows W1 immediately; W10 starts at 90%
 * air use. A source-preview caller without submersion retains its raw stages. Used by r_facegame.js each HUD frame
 * and r_playerface.js.
 *
 * @param {number|string} percent air used, 0..100 (clamped; non-numeric counts as 0)
 * @param {boolean} [submerged=false] whether the head is under water (adds one stage)
 * @returns {number} the stage 0..10 (0 = no overlay)
 */
export function faceWaterStage(percent,submerged=false) {
	const n=Number(percent),used=Number.isFinite(n)?Math.max(0,Math.min(100,n)):0;
	return Math.min(10,Math.floor(used/10)+(submerged?1:0));
}
/**
 * The water overlay as shown: follows the air-use stage while submerged, and after surfacing drains one stage every
 * 0.05 s of game time. One instance lives in r_facegame.js for the session.
 */
export class FaceWaterState {
	/**
	 * Creates a dry state (stage 0).
	 */
	constructor(){this.reset();}
	/**
	 * Back to dry: stage 0, not submerged, no world. Called on a new world, a clock that went back, when disabled, and
	 * by r_facegame.js on death, respawn or R_FaceGameReset.
	 */
	reset(){this.epoch=null;this.time=-Infinity;this.submerged=false;this.stage=0;this.drainStart=null;this.drainFrom=0;}
	/**
	 * Once per HUD frame (R_FaceWater in r_facegame.js).
	 *
	 * @param {{ time: number, epoch: *, submerged: boolean, stage: number, enabled?: boolean }} sample `time` game
	 * seconds (`cl.time`); `epoch` the world identity (`sv.edicts`), whose change resets the state; `submerged` the
	 * head is under water; `stage` the current `faceWaterStage` 0..10; `enabled` false (no known air data, dead or
	 * noclip) resets and shows nothing
	 * @returns {number} the stage to draw, 0..10
	 */
	frame({time,epoch,submerged,stage,enabled=true}) {
		if(!enabled){this.reset();return 0;}
		if(this.epoch!==epoch||time<this.time)this.reset();
		this.epoch=epoch;this.time=time;
		if(submerged){this.stage=stage;this.drainStart=null;}
		else {
			if(this.submerged){this.drainStart=time;this.drainFrom=this.stage;}
			if(this.drainStart!==null)this.stage=Math.max(0,this.drainFrom-Math.floor((time-this.drainStart+1e-9)/.05));
		}
		this.submerged=submerged;
		return this.stage;
	}
}
/**
 * The face's injury stage for a health percentage: 1 at 91..100, rising by one per 10 lost, 10 at 0..10.
 *
 * @param {number} percent health 0..100 (rounded and clamped)
 * @returns {number} the stage 1..10
 */
export function faceHealthStage( percent ) {
	return Math.min( 10, Math.floor( ( 100 - Math.max( 0, Math.min( 100, Math.round( percent ) ) ) ) / 10 ) + 1 );
}
/**
 * Which look (index into FACE_LOOKS) turns the face toward something at `angle` from the view: front within 15
 * degrees ahead or behind, eyes only up to 45, the whole head beyond. The artwork names its looks from the
 * character's own point of view (see below), so a negative (player's left) angle takes the right-named looks.
 *
 * @param {?number} angle degrees from the view direction, positive to the HUD's right (r_facegame.js
 * `faceImpactAngle`); any value is wrapped to -180..180; non-finite looks front
 * @returns {number} pose 0..4: 0 head_left, 1 eyes_left, 2 front, 3 eyes_right, 4 head_right
 */
export function faceDirection( angle ) {
	if ( ! Number.isFinite( angle ) ) return 2;
	const signed = ( ( angle + 180 ) % 360 + 360 ) % 360 - 180, a = Math.abs( signed );
	if ( a <= 15 || a >= 165 ) return 2;
	// The artwork names its looks from the character's own point of view: head_left/eyes_left (poses 0 and 1) look toward the
	// screen's right, head_right/eyes_right (4 and 3) toward the screen's left. Something on the player's left (negative)
	// therefore takes the right-named looks, so the head turns toward it on screen (owner report, 9 Oct 2026).
	if ( a <= 45 ) return signed < 0 ? 3 : 1;
	return signed < 0 ? 4 : 0;
}
/**
 * The face's look and expression over game time: reactions to damage, alerts, rewards and sustained firing, idle
 * glances and blinks, stepping one pose at a time. r_facegame.js keeps one for live play and one for demos, for the
 * session; a clock that goes back resets it.
 */
export class FaceState {
	/**
	 * @param {{ random?: function(): number }} [options] `random` returns 0..1 (default Math.random; tests pass a fixed
	 * sequence) for glance and blink timing
	 */
	constructor( { random = Math.random } = {} ) { this.random = random; this.reset(); }
	/**
	 * Clears every reaction and timer and faces front; schedules the first glance 1.5..3 s and the first blink 3..6 s
	 * after `time`. Called on construction, when the clock goes back, when a dead player comes back to life, and by
	 * R_FaceGameReset.
	 *
	 * @param {number} [time=0] game seconds to restart from
	 */
	reset( time = 0 ) {
		this.pose = this.targetPose = 2; this.stepTime = time; this.lastTime = time;
		this.hits = []; this.hitUntil = this.painUntil = this.shockUntil = this.grinUntil = -Infinity; this.hitIsAlert = false; this.lastAlert = -Infinity;
		this.attackStart = null; this.attackUntil = this.focusUntil = this.idleBlockedUntil = -Infinity;
		this.wasAttacking = false; this.dead = false; this.glancePose = 2; this.glanceUntil = -Infinity;
		this.nextGlance = time + 1.5 + this.random() * 1.5;
		this.blinkUntil=-Infinity;this.blinkBlocked=false;
		this.nextBlink=time+3+this.random()*3;
	}
	_clock( time ) { if ( time < this.lastTime ) this.reset( time ); this.lastTime = time; }
	/**
	 * Records whether the player is alive (from `frame` and r_facegame.js on a health update): health at or below 0
	 * marks the face dead; health above 0 after death resets it.
	 *
	 * @param {number} health the player's health
	 * @param {number} time game seconds
	 */
	life( health, time ) {
		this._clock( time );
		if ( this.dead && health > 0 ) this.reset( time );
		if ( health <= 0 ) this.dead = true;
	}
	/**
	 * A hit (R_FaceDamage in r_facegame.js, from a native damage event or the client's damage message): the face
	 * turns toward the direction that has dealt the most in the last 0.2 s (latest wins a tie) for 1 s, shows pain for
	 * 0.2 s, and shock for 1 s when more than 20 health was lost. Ignored while dead or for no damage.
	 *
	 * @param {{ time: number, receivedTime?: number, impactTime?: number, healthLoss: number, amount?: number, angle?: ?number }} event
	 * `time` game seconds the reaction is timed from; `receivedTime` the display clock now (default `time`);
	 * `impactTime` when the hit landed, for grouping (default `time`); `healthLoss` health lost; `amount` armour plus
	 * health, for choosing the direction (default `healthLoss`); `angle` degrees from the view, as `faceDirection`
	 */
	damage( { time, receivedTime = time, impactTime = time, healthLoss, amount = healthLoss, angle = null } ) {
		// A queued native observation retains impact time for arbitration without
		// making the display clock run backwards when the packet arrives.
		this._clock( receivedTime ); if ( this.dead || ! ( amount > 0 ) ) return;
		this.hits = this.hits.filter( hit => impactTime - hit.time >= 0 && impactTime - hit.time <= .2 + 1e-9 );
		this.hits.push( { time: impactTime, pose: faceDirection( angle ), amount } );
		const totals = new Map(); for ( const hit of this.hits ) totals.set( hit.pose, ( totals.get( hit.pose ) || 0 ) + hit.amount );
		let best = -1, chosen = 2;
		// Iterating oldest to latest and accepting ties implements latest-hit ties.
		for ( const hit of this.hits ) { const sum = totals.get( hit.pose ); if ( sum >= best ) { best = sum; chosen = hit.pose; } }
		this.hitPose = chosen; this.hitUntil = time + 1; this.painUntil = time + .2; this.hitIsAlert = false;
		if ( healthLoss > 20 ) this.shockUntil = time + 1;
		this.glancePose = 2; this.glanceUntil = -Infinity;
		this._target( chosen, receivedTime );
	}
	/**
	 * An enemy that is off screen has just noticed the player (its sight sound): the face glances toward where the
	 * sound came from, for a second. It is a reaction without pain, and it never replaces a reaction to damage that is
	 * under way. At most one glance per half second. Called by r_facegame.js for each sight event.
	 *
	 * @param {{ time: number, receivedTime?: number, angle?: ?number }} event `time` game seconds of the sound,
	 * `receivedTime` the display clock now (default `time`), `angle` degrees from the view (a non-finite angle is
	 * ignored)
	 */
	alert( { time, receivedTime = time, angle = null } ) {
		this._clock( receivedTime ); if ( this.dead || ! Number.isFinite( angle ) ) return;
		if ( time - this.lastAlert < .5 ) return; // one glance per half second: a room waking at once is one glance
		if ( time < this.hitUntil && ! this.hitIsAlert ) return; // a reaction to damage is under way and owns the face
		this.lastAlert = time; this.hitPose = faceDirection( angle ); this.hitUntil = time + 1; this.hits = []; this.hitIsAlert = true;
		this.glancePose = 2; this.glanceUntil = -Infinity;
		this._target( this.hitPose, receivedTime );
	}
	/**
	 * A grin for 2 s (unless dead): from r_facegame.js on picking up a new weapon or power-up, finding a secret, or a
	 * native reward event drained from sv_faceevents.js.
	 *
	 * @param {number} time game seconds the grin starts
	 * @param {number} [receivedTime=time] the display clock now
	 */
	reward( time, receivedTime = time ) { this._clock( receivedTime ); if ( ! this.dead ) this.grinUntil = time + 2; }
	/**
	 * The player fired (r_facegame.js, from native shot events or the view weapon's frames): extends the attack window
	 * to the weapon's cadence plus 0.12 s; firing for 2 s continuously gives the focused expression. Ignored while dead.
	 *
	 * @param {{ time: number, receivedTime?: number, cadence?: number }} event `time` game seconds of the shot,
	 * `receivedTime` the display clock now (default `time`), `cadence` seconds between shots (0.05..2, default 0.6)
	 */
	shot( { time, receivedTime = time, cadence = .6 } ) {
		this._clock( receivedTime ); if ( this.dead ) return;
		if ( this.attackStart === null || time > this.attackUntil + 1e-9 ) this.attackStart = time;
		this.attackUntil = time + Math.max( .05, Math.min( 2, cadence ) ) + .12;
	}
	_target( pose, time ) { if ( pose !== this.targetPose ) { this.targetPose = pose; this.stepTime = time; } }
	_eyes(time,powered) {
		if(this.dead){this.blinkUntil=-Infinity;this.nextBlink=Infinity;return 'dead';}
		if(powered){this.blinkBlocked=true;this.blinkUntil=-Infinity;this.nextBlink=Infinity;return 'open';}
		if(this.blinkBlocked){this.blinkBlocked=false;this.nextBlink=time+3+this.random()*3;}
		if(time>=this.nextBlink){this.blinkUntil=time+.15;this.nextBlink=time+3+this.random()*3;}
		return time<this.blinkUntil-1e-9?'blink':'open';
	}
	/**
	 * Once per HUD frame (R_PlayerFaceFrame through r_facegame.js): advances the look one pose toward its target
	 * (every 0.04 s while reacting, 0.08 s otherwise), runs idle glances and blinks, and picks the expression (dead,
	 * shocked, pain, grin, focused, normal, in that priority).
	 *
	 * @param {{ time: number, health?: number, attacking?: boolean, strength?: boolean, invulnerability?: boolean, invisibility?: boolean }} sample
	 * `time` game seconds; `health` the player's health (default 100); `attacking` the fire button or weapon frames;
	 * `strength` Quad, `invulnerability` Pentagram, `invisibility` Ring held (strength or invulnerability keeps the
	 * eyes open)
	 * @returns {{ look: string, target: string, expression: string, eyeState: string, health: number, healthPercent: number, strength: boolean, invulnerability: boolean, invisibility: boolean, dead: boolean }}
	 * a fresh object: the FACE_LOOKS name shown and aimed at; expression 'normal', 'pain', 'shocked',
	 * 'mischievous_excited' or 'focused_determined'; eyeState 'open', 'blink' or 'dead'; the injury stage 1..10 and
	 * health 0..100; the power flags passed in; whether dead
	 */
	frame( { time, health = 100, attacking = false, strength = false, invulnerability = false, invisibility = false } ) {
		this.life( health, time );
		const active = ! this.dead && attacking && time <= this.attackUntil;
		if ( active && this.attackStart !== null && time - this.attackStart >= 2 - 1e-9 ) this.focusUntil = time + .3;
		if ( this.wasAttacking && ! active ) {
			if ( time <= this.focusUntil ) this.focusUntil = time + .3;
			this.idleBlockedUntil = time + .5; this.nextGlance = time + .5 + 1.5 + this.random() * 1.5;
			this.attackStart = null;
		}
		this.wasAttacking = active;
		if ( active ) { this.glancePose = 2; this.glanceUntil = -Infinity; }
		const reacting = time < this.hitUntil;
		if ( ! this.dead ) {
			let wanted = 2;
			if ( reacting ) wanted = this.hitPose;
			else if ( ! active && time >= this.idleBlockedUntil ) {
				if ( time < this.glanceUntil ) wanted = this.glancePose;
				else if ( time >= this.nextGlance ) {
					this.glancePose = this.random() < .5 ? 1 : 3;
					this.glanceUntil = time + .3 + this.random() * .3;
					this.nextGlance = this.glanceUntil + 1.5 + this.random() * 1.5; wanted = this.glancePose;
				}
			}
			this._target( wanted, time );
			const interval = reacting ? .04 : .08;
			// Catch up only to this target; each crossed pose remains a discrete step.
			const steps = Math.floor( ( time - this.stepTime + 1e-9 ) / interval );
			if ( steps > 0 && this.pose !== this.targetPose ) {
				const count = Math.min( 1, Math.abs( this.targetPose - this.pose ) );
				this.pose += Math.sign( this.targetPose - this.pose ) * count; this.stepTime = time;
			}
		}
		const expression = this.dead ? 'focused_determined' : time < this.shockUntil ? 'shocked' : time < this.painUntil ? 'pain' :
			time < this.grinUntil ? 'mischievous_excited' : active && this.attackStart !== null && time - this.attackStart >= 2 - 1e-9 || time < this.focusUntil ? 'focused_determined' : 'normal';
		const healthPercent = Math.max( 0, Math.min( 100, Math.round( Number.isFinite( health ) ? health : 100 ) ) );
		return { look: FACE_LOOKS[ this.pose ], target: FACE_LOOKS[ this.targetPose ], expression,eyeState:this._eyes(time,strength||invulnerability),
			health: faceHealthStage( healthPercent ), healthPercent, strength, invulnerability, invisibility, dead: this.dead };
	}
}
