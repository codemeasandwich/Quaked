// Trial page for the product host (src/engine/client/hexen2_page.js): the same packs the desktop adapter would hand it,
// served here, are mounted through COM and the real page host starts the session. Not the packaged app.
import { COM_AddPack, COM_LoadPackFile, COM_BuildPack } from '../../src/engine/common/pak.js';
import { Hexen2_PageStart } from '../../src/engine/client/hexen2_page.js';

const receipt = { ok: false, frames: 0, errors: [], keyEvents: 0, logs: [] };
window.__HEXEN2_LOG__ = text => { receipt.logs.push( String( text ) ); };
document.addEventListener( 'keydown', () => { receipt.keyEvents ++; } );
window.__HEXEN2_PRODUCT__ = receipt;

// Count real mixer sources, as the browser trial does, so a running AudioContext alone is not mistaken for audio.
window.__SOURCES_STARTED__ = 0;
const originalStart = AudioBufferSourceNode.prototype.start;
AudioBufferSourceNode.prototype.start = function ( ...args ) { window.__SOURCES_STARTED__ ++; return originalStart.apply( this, args ); };

async function bytes( url ) {

	const response = await fetch( url );
	if ( !response.ok ) throw new Error( url + ': HTTP ' + response.status );
	return response.arrayBuffer();

}

try {

	await import( '../../src/newer/install.js' );
	const params = new URLSearchParams( location.search ), classId = params.get( 'class' ) ?? 'paladin';
	const portal = params.get( 'game' ) === 'portals';
	receipt.requestedClass = classId;
	const packs = [];
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) packs.push( COM_LoadPackFile( name, await bytes( '/hexen/' + name ) ) );
	const loose = [];
	if ( portal ) {

		for ( const name of [ 'progs.dat', 'strings.txt', 'hexen.rc' ] ) loose.push( { name, data: new Uint8Array( await bytes( '/portal/' + name ) ) } );
		packs.push( COM_LoadPackFile( 'hexen2-portals/loose', COM_BuildPack( loose ) ) );
		packs.push( COM_LoadPackFile( 'portal-pak3', await bytes( '/portal/pak3.pak' ) ) );

	} else {

		for ( const name of [ 'progs.dat' ] ) loose.push( { name, data: new Uint8Array( await bytes( '/hexen/' + name ) ) } );
		packs.push( COM_LoadPackFile( 'hexen2/loose', COM_BuildPack( loose ) ) );

	}
	const started = await Hexen2_PageStart( { packs, id: portal ? 'hexen2-portals' : 'hexen2', classId, log: text => { receipt.logs.push( String( text ) ); },
		onFrame: ( session, stats ) => {

			receipt.frames = stats.frames;
			receipt.position = stats.position;
			receipt.health = stats.health;
			receipt.classNumber = session.plan.classNumber;
			receipt.canvas = stats.canvas; receipt.css = stats.css; receipt.video = stats.video; receipt.yaw = stats.yaw;
			receipt.inputLocked = stats.inputLocked;
			receipt.forward = stats.forward;
			receipt.keyDest = stats.keyDest;
			receipt.forwardState = stats.forwardState;
			receipt.yaw = stats.yaw; receipt.weapon = stats.weapon; receipt.viewent = stats.viewent; receipt.currentWeapon = stats.currentWeapon; receipt.drawViewmodel = stats.drawViewmodel; receipt.drawEntities = stats.drawEntities;
			receipt.hud = stats.hud;
			receipt.audio = stats.audio;
			receipt.weaponFrames = receipt.weaponFrames ?? [];
			if ( stats.viewentFrame !== null && stats.viewentFrame !== undefined && ! receipt.weaponFrames.includes( stats.viewentFrame ) && receipt.weaponFrames.length < 100 ) receipt.weaponFrames.push( stats.viewentFrame );
			receipt.entityFrames = receipt.entityFrames ?? [];
			for ( const frame of stats.visibleFrames ?? [] ) if ( ! receipt.entityFrames.includes( frame ) && receipt.entityFrames.length < 100 ) receipt.entityFrames.push( frame );

		} } );
	receipt.started = started.ok;
	if ( !started.ok ) receipt.errors.push( started.reason );
	receipt.ok = started.ok;

} catch ( error ) {

	receipt.errors.push( String( error && error.stack || error ) );

}
