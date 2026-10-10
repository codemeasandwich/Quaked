/**
 * @module newer/assets/rockfield_worker
 *
 * The rock relief worker: generates tile windows with the supplied generator.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `currentKey`, `field`.
 *
 * Errors: catches at 1 place.
 *
 * Runs only as a worker, started by URL from `r_rockfield.js` and `rockfield_prepare.js`; it installs its message
 * handler as it loads.
 */
// Tile windows use the supplied RockField generator without per-tile seeds.
import * as RockField from './rockfield.js';
let currentKey = '', field;
self.onmessage = function ( event ) {
 const { id, config, x, y } = event.data;
 try {
  const key = JSON.stringify( config );
  if ( currentKey !== key ) { field = RockField.createField( config ); currentKey = key; }
  const start = performance.now(), result = RockField.generateTile( field, x, y );
  self.postMessage( { id, result, elapsed: performance.now() - start }, [ result.data.buffer ] );
 } catch ( error ) { self.postMessage( { id, error: String( error?.message || error ) } ); }
};
