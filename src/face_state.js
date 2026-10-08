// Gloom Hood behavior is independent of the artwork and of player movement.
// Time is game time: pause freezes reactions, and a restored clock resets them.
export const FACE_LOOKS = Object.freeze( [ 'head_left', 'eyes_left', 'front', 'eyes_right', 'head_right' ] );
export function faceHealthStage( percent ) {
	return Math.min( 10, Math.floor( ( 100 - Math.max( 0, Math.min( 100, Math.round( percent ) ) ) ) / 10 ) + 1 );
}
export function faceDirection( angle ) {
	if ( ! Number.isFinite( angle ) ) return 2;
	const signed = ( ( angle + 180 ) % 360 + 360 ) % 360 - 180, a = Math.abs( signed );
	if ( a <= 15 || a >= 165 ) return 2;
	if ( a <= 45 ) return signed < 0 ? 1 : 3;
	return signed < 0 ? 0 : 4;
}
export class FaceState {
	constructor( { random = Math.random } = {} ) { this.random = random; this.reset(); }
	reset( time = 0 ) {
		this.pose = this.targetPose = 2; this.stepTime = time; this.lastTime = time;
		this.hits = []; this.hitUntil = this.painUntil = this.shockUntil = this.grinUntil = -Infinity;
		this.attackStart = null; this.attackUntil = this.focusUntil = this.idleBlockedUntil = -Infinity;
		this.wasAttacking = false; this.dead = false; this.glancePose = 2; this.glanceUntil = -Infinity;
		this.nextGlance = time + 1.5 + this.random() * 1.5;
		this.blinkUntil=-Infinity;this.blinkBlocked=false;
		this.nextBlink=time+3+this.random()*3;
	}
	_clock( time ) { if ( time < this.lastTime ) this.reset( time ); this.lastTime = time; }
	life( health, time ) {
		this._clock( time );
		if ( this.dead && health > 0 ) this.reset( time );
		if ( health <= 0 ) this.dead = true;
	}
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
		this.hitPose = chosen; this.hitUntil = time + 1; this.painUntil = time + .2;
		if ( healthLoss > 20 ) this.shockUntil = time + 1;
		this.glancePose = 2; this.glanceUntil = -Infinity;
		this._target( chosen, receivedTime );
	}
	reward( time, receivedTime = time ) { this._clock( receivedTime ); if ( ! this.dead ) this.grinUntil = time + 2; }
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
