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
