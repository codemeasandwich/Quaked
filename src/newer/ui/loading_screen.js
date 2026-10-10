/**
 * @module newer/ui/loading_screen
 *
 * The first-load screen: the logo, the progress and the hand-over to the game.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// The first-load screen in index.html: the Quaked logo (logo.svg, inlined so it
// shows before any script or fetch) sits dim in the centre of a black page and
// fills with white from the bottom up as pak0.pak downloads. The fill is a
// clip rectangle over a second copy of the logo, sized in the logo's own
// viewBox units, so it follows the letter shapes exactly.

/**
 * Fills the loading logo from the bottom to show pak0.pak's download progress (main.js passes it as COM_FetchPak's
 * progress callback) and sets the `aria-valuenow` percentage on #loading. Out-of-range or non-numeric values are
 * clamped (a missing content-length never reports, a compressed one can overshoot), and pages without the logo
 * (trial pages) are left alone.
 *
 * @param {number} value fraction 0..1 of the logo that is filled (non-finite counts as 0)
 * @param {Document} [doc=globalThis.document] document holding #loading-logo and #loading-fill
 */
export function LoadingScreen_SetProgress( value, doc = globalThis.document ) {

	const logo = doc?.getElementById( 'loading-logo' );
	const fill = doc?.getElementById( 'loading-fill' );
	if ( ! logo || ! fill ) return;
	const v = Number.isFinite( value ) ? Math.min( 1, Math.max( 0, value ) ) : 0;
	const box = logo.viewBox.baseVal;
	fill.setAttribute( 'y', String( box.y + box.height * ( 1 - v ) ) );
	fill.setAttribute( 'height', String( box.height * v ) );
	doc.getElementById( 'loading' )?.setAttribute( 'aria-valuenow', String( Math.round( v * 100 ) ) );

}

/**
 * Removes the loading screen at once (main.js, for the welcome start or when the intro finished without a fade).
 *
 * @param {Document} [doc=globalThis.document] document holding #loading
 */
export function LoadingScreen_Remove( doc = globalThis.document ) {

	doc?.getElementById( 'loading' )?.remove();

}
/**
 * Fades the loading screen out and removes it; main.js hands it to `R_DemoLoadingSplash` so it runs on the first
 * real console frame, not to an uninitialized canvas. The event owns completion; a bounded timer (duration + 100 ms)
 * handles removed/hidden DOM surfaces. With prefers-reduced-motion it is removed without fading.
 *
 * @param {Document} [doc=globalThis.document] document holding #loading
 * @param {number} [duration=450] fade length in milliseconds
 * @returns {Promise<void>} resolves once the element is removed (at once when there is none); never rejects
 */
export function LoadingScreen_FadeOut(doc=globalThis.document,duration=450){
 const element=doc?.getElementById('loading');if(!element)return Promise.resolve();
 return new Promise(resolve=>{
  let timer,finished=false;
  const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);element.removeEventListener?.('transitionend',end);element.remove();resolve();};
  const end=event=>{if(event.target===element&&event.propertyName==='opacity')finish();};
  element.addEventListener?.('transitionend',end);
  element.style.transition='opacity '+duration+'ms ease';element.style.opacity='1';
  const begin=()=>{if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return;}element.style.opacity='0';timer=setTimeout(finish,duration+100);};
  (globalThis.requestAnimationFrame||((fn)=>setTimeout(fn,0)))(begin);
 });
}
