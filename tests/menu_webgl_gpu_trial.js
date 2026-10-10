import { QuakeMenu } from '../src/newer/ui/menu_webgl_source.js';
const report = document.querySelector( '#report' ), button = document.querySelector( '#run' );
const wait = ms => new Promise( resolve => setTimeout( resolve, ms ) );
async function until( test, name ) {
	const end = performance.now() + 15000;
	while ( ! test() ) { if ( performance.now() > end ) throw Error( name + ' timed out' ); await wait( 50 ); }
}
const items = [ 'Continue', 'Single Player', 'Multiplayer', 'Bestiarium', 'Options', 'Credits', 'Quit' ].map( ( label, id ) => ( { id: String( id ), label } ) );
function pixels( renderer ) {
	const { gl, canvas } = renderer, bytes = new Uint8Array( canvas.width * canvas.height * 4 );
	renderer.render(); gl.readPixels( 0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes ); return bytes;
}
async function run() {
	button.disabled = true; const checks = [], timings = [], check = ( passed, name, data = {} ) => checks.push( { passed, name, ...data } );
	let iframe, donor, actual;
	try {
		iframe = document.createElement( 'iframe' ); iframe.src = '../quake-menu-final.html'; document.body.append( iframe );
		await until( () => iframe.contentWindow?.QuakeMenu, 'source renderer' );
		const sourceWindow = iframe.contentWindow, sourceCanvas = sourceWindow.document.createElement( 'canvas' );
		sourceCanvas.style.cssText = 'width:640px;height:360px'; sourceWindow.document.body.append( sourceCanvas );
		const canvas = document.createElement( 'canvas' ); document.querySelector( '#views' ).replaceChildren( canvas );
		const config = { title: 'Main', items, selected: 2, selectorRotate: false, selectorAngle: .37 };
		donor = new sourceWindow.QuakeMenu( sourceCanvas, { config } );
		actual = new QuakeMenu( canvas, { config, externalFrame: true } ); await Promise.all( [ donor.ready, actual.ready ] );
		for ( const [ width, height ] of [ [ 640, 360 ], [ 1280, 720 ], [ 390, 844 ] ] ) {
			sourceCanvas.width = width; sourceCanvas.height = height; donor.backgroundDirty = true;
			actual.nativeLayoutKey=null;actual.layoutDirty=true;
			actual.frame( width, height, 1000 ); const expected = pixels( donor ), found = pixels( actual );
			let changed = 0, maximum = 0, regions=[];
			for ( let p = 0; p < found.length / 4; p ++ ) for(let channel=0;channel<3;channel++){
				const i=p*4+channel,delta=Math.abs(found[i]-expected[i]);
				if(delta){changed++;if(regions.length<12)regions.push({x:p%width,y:(p/width|0),channel,source:expected[i],module:found[i]});}
				maximum=Math.max(maximum,delta);
			}
			check( maximum <= 2, 'supplied renderer RGB parity ' + width + 'x' + height, { changed, maximum, regions } );
			actual.frame(width,height,1000,[{type:'panel',x:20,y:20,w:220,h:100},{type:'text',text:'OPTIONS',x:35,y:35,size:24,kind:2}],0);const overlay=pixels(actual);
			const backgroundAlpha=overlay[3],panelAlpha=overlay[((height-1-60)*width+100)*4+3];
			check(backgroundAlpha===0,'no generated background covers gameplay '+width,{backgroundAlpha});
			check(panelAlpha>240,'menu frame remains opaque and visible over gameplay '+width,{panelAlpha});
			const copy = document.createElement( 'canvas' ); copy.width = width; copy.height = height;
			const context = copy.getContext( '2d' ); actual.render(); const start = performance.now(); context.drawImage( canvas, 0, 0 );
			timings.push( { width, height, copySubmitMs: performance.now() - start } );
			// The overlay is transparent: the 2D canvas returns un-premultiplied RGB while the
			// WebGL readback is premultiplied, so compare premultiplied colour and alpha itself.
			const copied = context.getImageData( 0, 0, width, height ).data; let copyError = 0, alphaError = 0;
			for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {

				const c = ( y * width + x ) * 4, o = ( ( height - 1 - y ) * width + x ) * 4, a = copied[ c + 3 ] / 255;
				alphaError = Math.max( alphaError, Math.abs( copied[ c + 3 ] - overlay[ o + 3 ] ) );
				for ( let k = 0; k < 3; k ++ ) copyError = Math.max( copyError, Math.abs( copied[ c + k ] * a - overlay[ o + k ] ) );

			}
			check( copyError <= 2 && alphaError <= 1, 'one-to-one overlay color, alpha and glyph parity ' + width, { copyError, alphaError } );
		}
		check( actual.pendingFrame === 0, 'external renderer owns no animation frame' );
		check( actual.handlers.every( ( [ , type ] ) => type.startsWith( 'webglcontext' ) ), 'no competing input or window listeners' );
		const extension = actual.gl.getExtension( 'WEBGL_lose_context' );
		if ( extension ) {
			extension.loseContext(); await until( () => actual.contextLost, 'context loss' );
			check( actual.pendingFrame === 0, 'context loss schedules no frame' );
			extension.restoreContext(); await until( () => ! actual.contextLost && actual.loaded, 'context restoration' );
			actual.frame( 640, 360, 2000 ); check( actual.gl.getError() === actual.gl.NO_ERROR, 'restored context renders' );
			check( actual.pendingFrame === 0, 'restoration preserves external clock ownership' );
		} else check( false, 'context loss extension required for this trial' );
		actual.destroy(); actual.destroy();
		check( actual.destroyed && actual.pendingFrame === 0, 'destroy is idempotent and retires scheduling' );
		const late = new QuakeMenu( document.createElement( 'canvas' ), { externalFrame: true } ); late.destroy(); await late.ready;
		check( late.destroyed && ! late.loaded && late.pendingFrame === 0, 'pending decode cannot revive a destroyed renderer' );
	} catch ( error ) { check( false, 'execution', { error: error.stack } ); }
	finally { actual?.destroy(); donor?.destroy(); iframe?.remove(); button.disabled = false; }
	report.textContent = JSON.stringify( { status: checks.every( c => c.passed ) ? 'PASS' : 'FAIL', checks, timings,
		qualification: 'Copy submission timings are not GPU timings. Native input and game pause are checked in the gameplay trial.' }, null, 2 );
}
button.onclick = run;
await run();
