/**
 * @module client/menu_animation
 * Shared title presentation clock. Pages own one state object; the renderer only sees its final geometry, so native
 * fallback and vector drawing cannot disagree. Static titles remain the default for Quake.
 */
export const MENU_TITLE_CONFIG = Object.freeze( {
	quake: Object.freeze( { slide: false } ),
	hexen2: Object.freeze( { slide: true, rise: .5, fall: .15, logoRise: .15 } )
} );

/** Creates a page-owned title clock for a static or sliding presentation. */
export function MenuTitle_Create( config = MENU_TITLE_CONFIG.quake ) {
	return { config, titlePercent: config.slide ? 0 : 1, titleTarget: 1, logoPercent: config.slide ? 0 : 1,
		logoTarget: 1, name: '', canSwitch: true, lastTime: null };
}

/** Advances a title clock in seconds, retaining native retract-before-switch timing (uhexen2 menu.c:507-575). */
export function MenuTitle_Advance( state, name, now ) {
	if ( ! state.config.slide ) { state.name = name; return state; }
	let delta = state.lastTime === null ? 1 / 60 : now - state.lastTime;
	state.lastTime = now;
	if ( ! Number.isFinite( delta ) || delta <= 0 ) delta = 1 / 60;
	delta = Math.min( delta, .25 );
	const ease = ( value, target, duration, minimum ) => value < target
		? Math.min( target, value + Math.max( ( target - value ) / duration * delta, minimum ) )
		: Math.max( target, value - Math.max( ( value - target ) / duration * delta, minimum ) );
	const falling = state.titlePercent > state.titleTarget;
	state.titlePercent = ease( state.titlePercent, state.titleTarget, falling ? state.config.fall : state.config.rise, falling ? .02 : .004 );
	if ( falling && state.titlePercent <= state.titleTarget ) state.canSwitch = true;
	state.logoPercent = ease( state.logoPercent, state.logoTarget, state.config.logoRise, .02 );
	if ( state.name !== name && state.titleTarget !== 0 ) state.titleTarget = 0;
	if ( state.canSwitch ) { state.name = name; state.canSwitch = false; state.titleTarget = 1; }
	return state;
}
