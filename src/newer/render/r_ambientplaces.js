/**
 * @module newer/render/r_ambientplaces
 *
 * Where the map plays its standing sounds (a drip, a buzzing light, thunder), kept by the sound's name for the add-on
 * effects every game gets (card T-3faa98e3, docs/addon-effects-integration-2026-10-13.md): a map says where its drips
 * and sparking lights are by the sounds it places, whatever game or add-on it belongs to, so the effects that show
 * them need no list of maps or entities. The client notes each as the server sends it (`svc_spawnstaticsound`,
 * cl_parse.js); the list is the map's, emptied for the next one. It is kept whether or not sound is on.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `places` (name to positions) and `version`.
 *
 * Errors: none raised here.
 */

const places = new Map();
const NONE = Object.freeze( [] );
const MAX_EACH = 256, MAX_TOTAL = 1024;
let total = 0;
let version = 0;

/**
 * Notes one standing sound of the map. Called by the client as it reads each (`CL_ParseStaticSound`).
 *
 * @param {?string} name the sound's name as the server gave it (`ambience/drip1.wav`); ignored when missing
 * @param {ArrayLike<number>} origin where it is (Quake units, world space); copied
 */
export function R_AmbientPlaced( name, origin ) {

	if ( typeof name !== 'string' || name === '' || ! origin || total >= MAX_TOTAL || ! [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ].every( Number.isFinite ) ) return;
	const key = name.toLowerCase();
	let list = places.get( key );
	if ( ! list ) places.set( key, list = [] );
	if ( list.length >= MAX_EACH ) return;
	list.push( [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ] ); total ++;
	version ++;

}

/**
 * Where the map plays one sound.
 *
 * @param {string} name the sound's name
 * @returns {ReadonlyArray<Array<number>>} each place as [ x, y, z ] (the live list: do not change it)
 */
export function R_AmbientPlaces( name ) { return places.get( name ) ?? NONE; }

/**
 * A number that changes whenever the list does, so whoever keeps something per place knows to look again.
 *
 * @returns {number} the list's version
 */
export function R_AmbientPlacesVersion() { return version; }

/** Empties the list. Called by the renderer for each new map (`R_NewMap`), before the server sends the map's sounds. */
export function R_AmbientPlacesClear() { places.clear(); total = 0; version ++; }
