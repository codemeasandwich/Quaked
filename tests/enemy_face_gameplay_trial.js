// Public console/native spawn/renderer trial. Only this test page moves the
// camera and holds monsters for inspection; production gameplay is unchanged.
const panel = document.querySelector( '#face-controls' ), status = document.querySelector( '#face-status' ), errors = [];
for ( const type of [ 'mousedown', 'mouseup', 'keydown', 'keyup', 'pointerdown', 'pointerup' ] ) panel.addEventListener( type, event => event.stopPropagation() );
window.addEventListener( 'error', event => errors.push( event.message ) ); window.addEventListener( 'unhandledrejection', event => errors.push( String( event.reason ) ) );
await import( '../main.js' ); const deadline = performance.now() + 120000;
while ( ! window.Cbuf_AddText ) { if ( performance.now() > deadline ) throw Error( 'Engine startup timeout' ); await new Promise( resolve => setTimeout( resolve, 50 ) ); }
const pred = await import( '../src/cl_pred.js' );
const cmd = await import( '../src/cmd.js' ), { sv } = await import( '../src/server.js' ), { cl, cls, cl_entities } = await import( '../src/client.js' );
const { PR_GetString } = await import( '../src/progs.js' ), { SV_Move, SV_LinkEdict } = await import( '../src/world.js' ), keys = await import( '../src/keys.js' );
const bestiary = await import( '../src/r_bestiary.js' );
const split = await import( '../src/r_demosplit.js' ), loading = await import( '../src/r_demoloading.js' ), skins = await import( '../src/r_newerskins.js' );
const { renderer } = await import( '../src/vid.js' );
let ready = false, target = null, kind = 'soldier', cursor = -1, generation = 0, receipt = null, faceOnly = true, capturePending = false;
function inspect() {
	if ( ! ready ) return;
	bestiary.R_BestiaryCancel();
	const enemies = ( sv.edicts || [] ).filter( e => e && ! e.free && PR_GetString( e.v.model ) === 'progs/' + kind + '.mdl' && e.v.health > 0 );
	for ( let n = 0; n < enemies.length; n ++ ) {
		cursor = ( cursor + 1 ) % enemies.length; const e = enemies[ cursor ], p = sv.edicts[ 1 ], q = Array.from( e.v.origin );
		const yaw = e.v.angles[ 1 ] * Math.PI / 180;
		for ( const offset of [ 0, .25, -.25, .5, -.5 ] ) {
			const a = yaw + offset, pos = [ q[ 0 ] + Math.cos( a ) * 85, q[ 1 ] + Math.sin( a ) * 85, q[ 2 ] + 8 ];
			const fit = SV_Move( pos, p.v.mins, p.v.maxs, pos, 0, p ); if ( fit.startsolid || fit.allsolid ) continue;
			const sight = SV_Move( [ pos[ 0 ], pos[ 1 ], pos[ 2 ] + 22 ], [ 0, 0, 0 ], [ 0, 0, 0 ], [ q[ 0 ], q[ 1 ], q[ 2 ] + 16 ], 0, p );
			if ( sight.ent !== e ) continue;
			p.v.flags |= 64 | 128; p.v.movetype = 0; p.v.origin = pos; p.v.velocity = [ 0, 0, 0 ];
			const angles = [ 0, ( a + Math.PI ) * 180 / Math.PI, 0 ]; p.v.angles = angles; p.v.v_angle = angles; p.v.fixangle = 1; cl.viewangles.set( angles ); SV_LinkEdict( p, false );
			e.v.nextthink = -1; e.v.movetype = 0; target = e;
			status.textContent = `Native ${kind} #${e.index}, fixed face ${e._faceSeed % 12 + 1}/12. Next inspects a different individual.`; return;
		}
	}
	status.textContent = 'No hull-safe front inspection spot; move through the map manually.';
}
function start( nextKind, inspection = true ) {
	faceOnly = inspection;
	kind = nextKind; ready = false; target = null; cursor = -1; const previous = sv.edicts?.[ 1 ], token = ++ generation;
	split.R_DemoSplitRelease( true ); keys.set_key_dest( keys.key_game );
	cmd.Cbuf_AddText( 'disconnect\nmaxplayers 1\nr_hdr 1\nr_demosplit 0\nr_newer_enemies 1\nr_newer_textures ' + ( faceOnly ? 0 : 1 ) + '\nr_drawviewmodel 0\nskill 1\nbgmvolume 0\nmap e1m2\n' ); status.textContent = 'Loading native E1M2…';
	const until = performance.now() + 120000, timer = setInterval( () => {
		if ( token !== generation || performance.now() > until ) { clearInterval( timer ); if ( token === generation ) status.textContent = 'Map readiness timeout'; return; }
		if ( sv.edicts?.[ 1 ] === previous || cls.demoplayback || cls.signon !== 4 || ! sv.active || loading.R_IntroLoadingHolding() ) return;
		clearInterval( timer ); ready = true; inspect();
	}, 100 );
}
document.querySelector( '#grunt' ).onclick = () => start( 'soldier' ); document.querySelector( '#ogre' ).onclick = () => start( 'ogre' ); document.querySelector( '#knight' ).onclick = () => start( 'knight' );
document.querySelector( '#next' ).onclick = inspect;
document.querySelector( '#dismiss-folio' ).onclick = () => { if ( ready ) { cursor --; inspect(); } else bestiary.R_BestiaryCancel(); };
document.querySelector( '#full-enhancements' ).onclick = () => start( kind, false );
document.querySelector( '#save-face' ).onclick = () => cmd.Cbuf_AddText( 'save enemy-face-trial-20261007\n' );
document.querySelector( '#load-face' ).onclick = () => {
 const previous = sv.edicts?.[ 1 ], slot = target?.index, until = performance.now() + 120000, token = ++ generation;
 ready = false; cmd.Cbuf_AddText( 'load enemy-face-trial-20261007\n' );
 const timer = setInterval( () => {
  if ( token !== generation ) { clearInterval( timer ); return; }
  if ( performance.now() > until ) { clearInterval( timer ); status.textContent = 'Saved trial readiness timeout'; return; }
  if ( sv.edicts?.[ 1 ] === previous || cls.signon !== 4 || loading.R_IntroLoadingHolding() ) return;
  clearInterval( timer ); ready = true;
  const enemies = ( sv.edicts || [] ).filter( e => e && ! e.free && PR_GetString( e.v.model ) === 'progs/' + kind + '.mdl' && e.v.health > 0 );
  const selected = enemies.findIndex( e => e.index === slot );
  cursor = selected >= 0 ? selected - 1 : -1; inspect();
 }, 200 );
};
// The game clears its non-preserved backbuffer between frames. Export only
// after a real screen render, at the end of that frame's synchronous draws.
const originalRender = renderer.render.bind( renderer );
renderer.render = ( ...args ) => {
 const value = originalRender( ...args );
 if ( capturePending && renderer.getRenderTarget() === null ) {
  capturePending = false;
  queueMicrotask( () => {
   updateReceipt();
   const a = document.createElement( 'a' ); a.download = 'enemy-face-frame-' + kind + '.png'; a.href = renderer.domElement.toDataURL( 'image/png' ); a.click();
   const b = document.createElement( 'a' ); b.download = 'enemy-face-frame-' + kind + '.json'; b.href = 'data:application/json;charset=utf-8,' + encodeURIComponent( JSON.stringify( receipt, null, 2 ) ); b.click();
  } );
 }
 return value;
};
document.querySelector( '#capture-face' ).onclick = () => { capturePending = true; };
function updateReceipt() {
	const native = ( sv.edicts || [] ).filter( e => e && ! e.free && /^progs\/(soldier|ogre|knight)\.mdl$/.test( PR_GetString( e.v.model ) ) );
	receipt = { profile: faceOnly ? 'face-inspection-original-walls' : 'full-enhancements', loading: loading.R_DemoLoadingStatus(), ready, sequence: pred.CL_GetValidSequence(), clientTime: cl.time, serverTime: sv.time, paused: sv.paused, active: sv.active, demo: cls.demoplayback, map: sv.name, signon: cls.signon, target: target ? { index: target.index, seed: target._faceSeed, model: PR_GetString( target.v.model ) } : null,
		individuals: native.map( e => ( { index: e.index, model: PR_GetString( e.v.model ), seed: e._faceSeed, clientSeed: cl_entities[ e.index ]?._faceSeed, drawn: !! cl_entities[ e.index ]?._aliasMesh?.visible } ) ),
		skins: skins.R_NewerSkinsStatus(), glError: renderer.getContext().getError(), errors };
	document.querySelector( '#face-report' ).textContent = JSON.stringify( receipt, null, 2 );
}
setInterval( updateReceipt, 500 );
start( 'ogre' );
