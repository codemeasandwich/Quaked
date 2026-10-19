// Trial page for the product host (src/engine/client/hexen2_page.js): the same packs the desktop adapter would hand it,
// served here, are mounted through COM and the real page host starts the session. Not the packaged app.
import { COM_AddPack, COM_LoadPackFile, COM_BuildPack } from '../../src/engine/common/pak.js';
import { Hexen2_PageStart } from '../../src/engine/client/hexen2_page.js';

const receipt = { ok: false, frames: 0, errors: [], keyEvents: 0 };
document.addEventListener( 'keydown', () => { receipt.keyEvents ++; } );
window.__HEXEN2_PRODUCT__ = receipt;

async function bytes( url ) {

	const response = await fetch( url );
	if ( !response.ok ) throw new Error( url + ': HTTP ' + response.status );
	return response.arrayBuffer();

}

try {

	await import( '../../src/newer/install.js' );
	const packs = [];
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) packs.push( COM_LoadPackFile( name, await bytes( '/hexen/' + name ) ) );
	const loose = [];
	for ( const name of [ 'progs.dat' ] ) loose.push( { name, data: new Uint8Array( await bytes( '/hexen/' + name ) ) } );
	packs.push( COM_LoadPackFile( 'hexen2/loose', COM_BuildPack( loose ) ) );
	const started = await Hexen2_PageStart( { packs, id: 'hexen2', classId: 'paladin',
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

		} } );
	receipt.started = started.ok;
	if ( !started.ok ) receipt.errors.push( started.reason );
	receipt.ok = started.ok;

} catch ( error ) {

	receipt.errors.push( String( error && error.stack || error ) );

}
