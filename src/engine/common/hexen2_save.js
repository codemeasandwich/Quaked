/**
 * @module engine/common/hexen2_save
 *
 * Hexen II's save repository and legacy single-session record helpers. The unified host serialises its versioned
 * whole-hub text in `server/host_cmd.js`; the repository persists that text without imposing the legacy player-bundle
 * schema. Values are JSON-compatible, committed atomically per key; map/client restoration stays with the host.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports; `Hexen2_SaveStore` returns a store object with its own IndexedDB/localStorage state.
 * Errors: validation returns `{ ok: false, reason }`; store failures reject with an Error.
 */

/** The schema version of this single-session record. */
export const HEXEN2_SAVE_SCHEMA = 2;

/** Schema 1 records (player only) remain readable; schema 2 adds the visited-level hub. */
const HEXEN2_SAVE_SCHEMAS = Object.freeze( [ 1, 2 ] );

/** The player fields the record preserves (numeric scalars, in the native field namespace). */
export const HEXEN2_SAVE_PLAYER_FIELDS = Object.freeze( [
	'health', 'max_health', 'bluemana', 'greenmana', 'max_mana', 'level', 'experience',
	'strength', 'intelligence', 'wisdom', 'dexterity',
	'armor_amulet', 'armor_bracer', 'armor_breastplate', 'armor_helmet',
	'items', 'weapon', 'current_weapon', 'weaponframe', 'rings_active',
	'artifacts', 'artifact_active', 'inventory',
	'cnt_torch', 'cnt_h_boost', 'cnt_sh_boost', 'cnt_mana_boost', 'cnt_teleport', 'cnt_tome', 'cnt_summon',
	'cnt_invisibility', 'cnt_glyph', 'cnt_haste', 'cnt_blast', 'cnt_polymorph', 'cnt_flight', 'cnt_cubeofforce',
	'cnt_invincibility', 'ring_flight', 'ring_water', 'ring_turning', 'ring_regeneration',
	'puzzle_inv1', 'puzzle_inv2', 'puzzle_inv3', 'puzzle_inv4', 'puzzle_inv5', 'puzzle_inv6', 'puzzle_inv7', 'puzzle_inv8'
] );

const VECTORS = Object.freeze( [ 'origin', 'angles', 'velocity', 'v_angle' ] );
const finite = value => typeof value === 'number' && Number.isFinite( value );

/**
 * Copies the restorable player state out of a native player edict.
 *
 * @param {?object} player the player edict (`player.v` is the native field object)
 * @returns {{ fields: object, vectors: object }} scalars and the four vectors
 */
export function Hexen2_CapturePlayer( player ) {

	const v = player?.v ?? {};
	const fields = {}, vectors = {};
	for ( const name of HEXEN2_SAVE_PLAYER_FIELDS ) fields[ name ] = finite( v[ name ] ) ? v[ name ] : 0;
	for ( const name of VECTORS ) vectors[ name ] = [ finite( v[ name ]?.[ 0 ] ) ? v[ name ][ 0 ] : 0,
		finite( v[ name ]?.[ 1 ] ) ? v[ name ][ 1 ] : 0, finite( v[ name ]?.[ 2 ] ) ? v[ name ][ 2 ] : 0 ];
	return { fields, vectors };

}

/**
 * Builds the version-1 record.
 *
 * @param {{ gameId: string, classId: string, skill: number, level: string, player: object, time?: number }} options
 *   the run identity and the live player
 * @returns {object} the save record
 */
export function Hexen2_BuildSaveBundle( options ) {

	const captured = Hexen2_CapturePlayer( options.player );
	const hub = options.hub && typeof options.hub === 'object' ? Object.freeze( { levels: options.hub.levels ?? {}, worlds: options.hub.worlds ?? {} } ) : undefined;
	const view = options.view && typeof options.view === 'object' ? Object.freeze( {
		angles: Object.freeze( [ 0, 1, 2 ].map( i => finite( options.view.angles?.[ i ] ) ? options.view.angles[ i ] : 0 ) ),
		time: finite( options.view.time ) ? options.view.time : 0
	} ) : undefined;
	return Object.freeze( {
		schema: HEXEN2_SAVE_SCHEMA,
		kind: 'hexen2-single-session',
		savedAt: new Date().toISOString(),
		identity: Object.freeze( { gameId: String( options.gameId ?? 'hexen2' ), classId: String( options.classId ?? 'paladin' ),
			skill: Number.isInteger( options.skill ) ? options.skill : 1, level: String( options.level ?? 'demo1' ) } ),
		time: finite( options.time ) ? options.time : 0,
		player: Object.freeze( captured.fields ),
		vectors: Object.freeze( Object.fromEntries( Object.entries( captured.vectors ).map( ( [ k, v ] ) => [ k, Object.freeze( v ) ] ) ) ),
		...( hub ? { hub } : {} ),
		...( view ? { view } : {} )
	} );

}

/**
 * Checks the record's shape and ranges before any live field is written.
 *
 * @param {?object} bundle the candidate
 * @returns {{ ok: true } | { ok: false, reason: string }} the check
 */
export function Hexen2_ValidateSaveBundle( bundle ) {

	if ( bundle === null || typeof bundle !== 'object' ) return { ok: false, reason: 'no save record' };
	if ( !HEXEN2_SAVE_SCHEMAS.includes( bundle.schema ) ) return { ok: false, reason: `unsupported save schema ${String( bundle.schema )}` };
	if ( bundle.kind !== 'hexen2-single-session' ) return { ok: false, reason: 'not a Hexen II single-session record' };
	if ( !bundle.identity || typeof bundle.identity.level !== 'string' || bundle.identity.level === '' ) return { ok: false, reason: 'the record has no level' };
	if ( typeof bundle.identity.gameId !== 'string' || typeof bundle.identity.classId !== 'string' ) return { ok: false, reason: 'the record has no run identity' };
	if ( !Number.isInteger( bundle.identity.skill ) || bundle.identity.skill < 0 || bundle.identity.skill > 3 ) return { ok: false, reason: 'the record skill is out of range' };
	if ( bundle.player === null || typeof bundle.player !== 'object' ) return { ok: false, reason: 'the record has no player fields' };
	for ( const name of HEXEN2_SAVE_PLAYER_FIELDS ) if ( !finite( bundle.player[ name ] ) ) return { ok: false, reason: `player field ${name} is not finite` };
	for ( const name of VECTORS ) {

		const v = bundle.vectors?.[ name ];
		if ( !Array.isArray( v ) || v.length !== 3 || !v.every( finite ) ) return { ok: false, reason: `player vector ${name} is invalid` };

	}
	if ( finite( bundle.time ) === false ) return { ok: false, reason: 'the record time is not finite' };
	if ( bundle.view !== undefined ) {

		if ( bundle.view === null || typeof bundle.view !== 'object' || !Array.isArray( bundle.view.angles ) || bundle.view.angles.length !== 3 || !bundle.view.angles.every( finite ) || !finite( bundle.view.time ) )
			return { ok: false, reason: 'the record view is malformed' };

	}
	if ( bundle.hub !== undefined ) {

		if ( bundle.hub === null || typeof bundle.hub !== 'object' || bundle.hub.levels === null || typeof bundle.hub.levels !== 'object' || bundle.hub.worlds === null || typeof bundle.hub.worlds !== 'object' )
			return { ok: false, reason: 'the record hub is malformed' };

	}
	return { ok: true };

}

/**
 * Writes a validated record onto a live player. The caller reloads the named level first when it differs; this
 * function never changes the level.
 *
 * @param {object} bundle a validated record
 * @param {object} player the live player edict
 * @param {{ vectors?: boolean }} [options] whether to restore origin/angles/velocity (false for a level transition,
 *   where the new map's start must win)
 * @returns {{ ok: true } | { ok: false, reason: string }} the result
 */
export function Hexen2_ApplySaveBundle( bundle, player, options = {} ) {

	const valid = Hexen2_ValidateSaveBundle( bundle );
	if ( !valid.ok ) return valid;
	if ( !player?.v ) return { ok: false, reason: 'no live player' };
	for ( const name of HEXEN2_SAVE_PLAYER_FIELDS ) player.v[ name ] = bundle.player[ name ];
	if ( options.vectors !== false ) for ( const name of VECTORS ) player.v[ name ] = [ bundle.vectors[ name ][ 0 ], bundle.vectors[ name ][ 1 ], bundle.vectors[ name ][ 2 ] ];
	return { ok: true };

}

function memoryStore() {

	const items = new Map();
	return { async put( key, value ) { items.set( key, JSON.parse( JSON.stringify( value ) ) ); }, async get( key ) { return items.get( key ) ?? null; },
		async list() { return [ ...items.keys() ]; }, async remove( key ) { items.delete( key ); }, kind: 'memory' };

}

/**
 * The persistence boundary. IndexedDB stores the record in one object store with a single put (a failed put leaves the
 * previous value); without IndexedDB the browser's localStorage keeps the JSON record, and without storage an in-memory
 * store is returned so the UI can still report a non-persistent save. Writes resolve only on transaction completion;
 * an unavailable/blocked database falls back at open, while a failed transaction rejects without switching backends.
 *
 * @param {{ indexedDB?: ?object, localStorage?: ?object, name?: string }} [env] platform objects (globals by default; null disables a backend)
 * @returns {{ put: function(string, object|string): Promise<void>, get: function(string): Promise<object|string|null>,
 *   list: function(): Promise<Array<string>>, remove: function(string): Promise<void>, kind: string }} the store
 */
export function Hexen2_SaveStore( env = {} ) {

	const factory = 'indexedDB' in env ? env.indexedDB : globalThis.indexedDB;
	if ( factory && typeof factory.open === 'function' ) {

		const dbName = env.name ?? 'quaked-hexen2-saves', storeName = 'saves';
		let opening = null;
		const open = () => opening ??= new Promise( ( resolve, reject ) => {

			const request = factory.open( dbName, 1 );
			request.onupgradeneeded = () => { if ( !request.result.objectStoreNames.contains( storeName ) ) request.result.createObjectStore( storeName ); };
			request.onsuccess = () => resolve( request.result );
			request.onerror = () => reject( request.error ?? new Error( 'IndexedDB open failed' ) );
			request.onblocked = () => reject( new Error( 'IndexedDB open blocked' ) );

		} );
		const run = async ( mode, action ) => {

			const db = await open();
			return new Promise( ( resolve, reject ) => {

				const tx = db.transaction( storeName, mode ), store = tx.objectStore( storeName );
				const request = action( store );
				let result;
				request.onsuccess = () => { result = request.result; };
				tx.oncomplete = () => resolve( result );
				request.onerror = () => reject( request.error ?? new Error( 'IndexedDB request failed' ) );
				tx.onabort = () => reject( tx.error ?? new Error( 'IndexedDB transaction aborted' ) );

			} );

		};
		// Only opening failure selects a fallback. Falling back after a failed transaction could hide a quota error
		// behind a second, divergent save while the previous IndexedDB record remains authoritative.
		const fallback = Hexen2_SaveStore( { ...env, indexedDB: null } );
		let backend = null;
		const ready = async () => {

			if ( backend === null ) {

				try { await open(); backend = 'indexeddb'; } catch { backend = fallback; }

			}
			return backend;

		};
		return { get kind() { return backend && backend !== 'indexeddb' ? backend.kind : 'indexeddb'; },
			async put( key, value ) { if ( await ready() !== 'indexeddb' ) return backend.put( key, value ); await run( 'readwrite', store => store.put( value, key ) ); },
			async get( key ) { if ( await ready() !== 'indexeddb' ) return backend.get( key ); return ( await run( 'readonly', store => store.get( key ) ) ) ?? null; },
			async list() { if ( await ready() !== 'indexeddb' ) return backend.list(); return ( await run( 'readonly', store => store.getAllKeys() ) ) ?? []; },
			async remove( key ) { if ( await ready() !== 'indexeddb' ) return backend.remove( key ); await run( 'readwrite', store => store.delete( key ) ); } };

	}
	const storage = 'localStorage' in env ? env.localStorage : ( () => { try { return globalThis.localStorage ?? null; } catch { return null; } } )();
	if ( storage ) return { kind: 'localstorage',
		async put( key, value ) { storage.setItem( 'quaked.hexen2.save.' + key, JSON.stringify( value ) ); },
		async get( key ) { const raw = storage.getItem( 'quaked.hexen2.save.' + key ); return raw ? JSON.parse( raw ) : null; },
		async list() { const out = [], prefix = 'quaked.hexen2.save.'; for ( let i = 0; i < storage.length; i ++ ) { const key = storage.key( i ); if ( key?.startsWith( prefix ) ) out.push( key.slice( prefix.length ) ); } return out; },
		async remove( key ) { storage.removeItem( 'quaked.hexen2.save.' + key ); } };
	return memoryStore();

}

/**
 * Normalises a Hexen map name from the gamecode/trigger form (`ruins`, `maps/ruins.bsp`) to the mount form
 * (`maps/ruins.bsp`).
 *
 * @param {string} name the map name
 * @returns {string} the normalised map path, or '' for an empty/invalid name
 */
export function Hexen2_NormalizeMapName( name ) {

	const text = String( name ?? '' ).trim().replace( /\\/g, '/' );
	if ( text === '' ) return '';
	if ( text.startsWith( 'maps/' ) || text.includes( '/' ) ) return text.endsWith( '.bsp' ) ? text : text + '.bsp';
	return 'maps/' + ( text.endsWith( '.bsp' ) ? text : text + '.bsp' );

}

/**
 * Builds the same-page transition URL a changelevel uses. It keeps the game identity, class and skill and asks the
 * page to autostart the next map instead of reopening the character gate.
 *
 * @param {{ pathname?: string, gameId: string, classId: string, skill: number, map: string, spot?: string }} options
 * @returns {string} the relative URL
 */
export function Hexen2_TransitionUrl( options ) {

	const params = new URLSearchParams();
	params.set( 'game', String( options.gameId ?? 'hexen2' ) );
	params.set( 'autostart', '1' );
	params.set( 'class', String( options.classId ?? 'paladin' ) );
	params.set( 'skill', String( Number.isInteger( options.skill ) ? options.skill : 1 ) );
	params.set( 'map', Hexen2_NormalizeMapName( options.map ) );
	if ( options.spot ) params.set( 'spot', String( options.spot ) );
	return String( options.pathname ?? location.pathname ) + '?' + params.toString();

}

/**
 * A small whole-hub snapshot store keyed by normalised level name. It is the first step beyond the single-session
 * record: returning to a visited hub level restores that level's snapshot, while a forward level starts at the map's
 * own player start. It deliberately does not yet persist cross-level trigger/timer state.
 *
 * @param {{ localStorage?: object }} [env] the storage (defaults to the browser localStorage)
 * @returns {{ put: function(string, object): void, get: function(string): ?object, all: function(): object,
 *   remove: function(string): void, clear: function(): void, key: string }} the hub store
 */
export function Hexen2_HubStore( env = {} ) {

	const storage = env.localStorage ?? ( () => { try { return globalThis.localStorage ?? null; } catch { return null; } } )();
	const key = 'quaked.hexen2.hub.v1';
	const read = () => {

		try { const raw = storage?.getItem( key ); const parsed = raw ? JSON.parse( raw ) : null;
			return parsed && typeof parsed === 'object' && parsed.levels ? { levels: parsed.levels, worlds: parsed.worlds ?? {} } : { levels: {}, worlds: {} }; } catch { return { levels: {}, worlds: {} }; }

	};
	const write = value => { try { storage?.setItem( key, JSON.stringify( value ) ); } catch { /* quota/private mode: the caller reports the save as non-persistent */ } };
	return {
		key,
		put( level, bundle ) { const value = read(); value.levels[ Hexen2_NormalizeMapName( level ) ] = bundle; write( value ); },
		get( level ) { return read().levels[ Hexen2_NormalizeMapName( level ) ] ?? null; },
		all() { return read().levels; },
		putWorld( level, world ) { const value = read(); value.worlds[ Hexen2_NormalizeMapName( level ) ] = world; write( value ); },
		getWorld( level ) { return read().worlds[ Hexen2_NormalizeMapName( level ) ] ?? null; },
		allWorlds() { return read().worlds; },
		remove( level ) { const value = read(), name = Hexen2_NormalizeMapName( level ); delete value.levels[ name ]; delete value.worlds[ name ]; write( value ); },
		clear() { write( { levels: {}, worlds: {} } ); }
	};

}
