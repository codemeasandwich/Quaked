// Owner-tryable real client/server trial. Shots go through ordinary commands,
// QuakeC weapon execution and CL_ParseStartSoundPacket; no synthetic casings.
const panel = document.querySelector( 'section' );
for ( const type of [ 'mousedown', 'mouseup', 'keydown', 'keyup', 'pointerdown', 'pointerup' ] ) panel.addEventListener( type, e => e.stopPropagation() );
await import( '../main.js' );
while ( ! window.Cbuf_AddText ) await new Promise( r => setTimeout( r, 20 ) );
const { Cbuf_AddText } = await import( '../src/engine/common/cmd.js' );
const { cl, cls } = await import( '../src/engine/client/client.js' ), { sv } = await import( '../src/engine/server/server.js' );
const { R_ShellsStatus, R_ShellsSnapshot } = await import( '../src/newer/render/r_shells.js' );
const { R_WeaponStatus } = await import( '../src/newer/render/r_weapons.js' );
const { Cvar_SetValue, Cvar_VariableValue } = await import( '../src/engine/common/cvar.js' );
const keys = await import( '../src/engine/client/keys.js' ), split = await import( '../src/r_demosplit.js' );
const comparison = new URLSearchParams( window.location.search ).get( 'weapons' );
const nailComparison = comparison === 'nail-profile', shotgunComparison = comparison === 'shotgun-profile';
const cleanComparison = nailComparison || shotgunComparison;
function start() {

	split.R_DemoSplitRelease( true ); keys.set_key_dest( keys.key_game );
	Cbuf_AddText( 'maxplayers 1\nr_hdr 1\nr_dynres 1\nbgmvolume 0\nmap e1m1\n' );
	if ( cleanComparison ) { Cvar_SetValue( 'viewsize', 120 ); Cvar_SetValue( 'crosshair', 0 ); } // no game HUD
	const untilReady = setInterval( () => {

		if ( cls.demoplayback || cls.signon !== 4 || ! sv.active || cl.worldmodel?.name !== 'maps/e1m1.bsp' || cl.stats[ 0 ] <= 0 || ! cl.viewent?.model ) return;
		clearInterval( untilReady );
		// The title-demo handoff can restore its saved presentation after the
		// queued map command. Establish the trial mode once live signon finishes.
		split.R_DemoSplitRelease( true ); Cvar_SetValue( 'r_hdr', 1 ); Cvar_SetValue( 'r_newer_weapons', 1 );
		if ( cleanComparison ) { Cvar_SetValue( 'viewsize', 120 ); Cvar_SetValue( 'crosshair', 0 ); }
		const initialWeapon = shotgunComparison ? 2 : nailComparison ? 5 : 3;
		select( initialWeapon );
		document.querySelector( '#weapon' ).value = String( initialWeapon );

	}, 100 );

}
let selection = 0;
function select( id ) {

	Cbuf_AddText( 'give ' + id + '\ngive s 100\ngive n 100\ngive r 100\ngive c 100\n' );
	// Wait for the confirmed inventory, not a fixed delay or stale title-demo
	// state. The actual server/client can take longer while shaders are loading.
	const token = ++ selection, bit = id === 1 ? 4096 : 1 << ( id - 2 );
	const pending = setInterval( () => {

		if ( token !== selection ) { clearInterval( pending ); return; }
		if ( cls.demoplayback || cls.signon !== 4 || ( cl.items & bit ) === 0 ) return;
		clearInterval( pending ); Cbuf_AddText( 'impulse ' + id + '\n' );

	}, 50 );
	document.querySelector( '#weapon' ).value = String( id );

}
function fire( duration = 160 ) { Cbuf_AddText( '+attack\n' ); setTimeout( () => Cbuf_AddText( '-attack\n' ), duration ); }
function look() {

	const last = R_ShellsSnapshot().levels.find( level => level.name === cl.worldmodel?.name )?.shells.at( - 1 );
	if ( ! last ) return;
	const eye = window.camera.position, delta = last.p.map( ( v, i ) => v - eye.getComponent( i ) );
	cl.viewangles[ 0 ] = - Math.atan2( delta[ 2 ], Math.hypot( delta[ 0 ], delta[ 1 ] ) ) * 180 / Math.PI;
	cl.viewangles[ 1 ] = Math.atan2( delta[ 1 ], delta[ 0 ] ) * 180 / Math.PI;

}
document.querySelector( '#start' ).onclick = start;
document.querySelector( '#weapon' ).onchange = e => select( Number( e.target.value ) );
document.querySelector( '#fire' ).onclick = () => fire();
document.querySelector( '#fire-turn' ).onclick = () => fire( 1000 );
document.querySelector( '#art' ).onclick = () => Cvar_SetValue( 'r_newer_weapons', 1 - Cvar_VariableValue( 'r_newer_weapons' ) );
document.querySelector( '#hide-controls' ).onclick = () => { panel.style.display = 'none'; };
document.addEventListener( 'keydown', event => {

	if ( event.key === 'Escape' && panel.style.display === 'none' ) {

		panel.style.display = ''; event.preventDefault(); event.stopImmediatePropagation();

	}

}, true );
document.querySelector( '#look' ).onclick = look;
document.querySelector( '#save' ).onclick = () => Cbuf_AddText( 'save weapon-trial\n' );
document.querySelector( '#load' ).onclick = () => Cbuf_AddText( 'load weapon-trial\n' );
window.weaponTrial = { start, select, fire, look, cl, sv, status: () => ( { shells: R_ShellsStatus(), weapons: R_WeaponStatus(), model: cl.viewent?.model?.name, frame: cl.viewent?.frame } ) };
let traceModel, firingPoses = [];
setInterval( () => {

	const status = window.weaponTrial.status(), actual = cl.viewent?.model?.name;
	const key = actual?.replace( /^progs\//, '' ).replace( /\.mdl$/, '' );
	const replacement = status.weapons.ready.includes( key ) && Cvar_VariableValue( 'r_newer_weapons' ) !== 0;
	const loaded = replacement ? 'SUPPLIED MODEL LOADED' : 'ORIGINAL MODEL';
	if ( actual !== traceModel ) { traceModel = actual; firingPoses = []; }
	if ( key === 'v_nail2' && firingPoses.at( - 1 ) !== status.frame ) {

		firingPoses.push( status.frame ); if ( firingPoses.length > 32 ) firingPoses.shift();

	}
	const trace = key === 'v_nail2' ? ` · observed firing poses: ${firingPoses.join( '→' )}` : '';
	document.querySelector( '#status' ).textContent = `${loaded}: ${actual || 'waiting for level'} · ${status.shells.count} shells on this map (${status.shells.moving} moving) · ${Object.keys( status.weapons.failures ).length ? JSON.stringify( status.weapons.failures ) : 'no asset errors'}${trace}`;

}, 50 );
// This page is specifically for trying the supplied art, so enter its trial
// directly rather than leaving the owner in the ordinary title demo.
start();
