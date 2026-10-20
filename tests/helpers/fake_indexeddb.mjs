// The save store uses one request per transaction. Stage writes until commit so an abort *after* request success is
// observable, as it is in a real browser (request success alone does not mean the save is durable).
/** A deterministic single-request transaction fixture with a shared durable record map and injectable failures. */
export function fakeIndexedDB( records = new Map() ) {
	const factory = { records, abortNext: false, failOpen: false, opens: 0,
		open() {

			factory.opens ++;
			const request = {};
			setTimeout( () => {

				if ( factory.failOpen ) { request.error = new Error( 'IndexedDB unavailable' ); request.onerror?.(); return; }
				request.result = {
					objectStoreNames: { contains: () => true },
					transaction( name, mode ) {

						const tx = {};
						tx.objectStore = () => {

							const run = ( value, commit ) => {

								const req = {};
								setTimeout( () => {

									req.result = structuredClone( value );
									req.onsuccess?.();
									setTimeout( () => {

										if ( mode === 'readwrite' && factory.abortNext ) {

											factory.abortNext = false;
											tx.error = new Error( 'QuotaExceededError: transaction aborted' );
											tx.onabort?.();

										} else { commit?.(); tx.oncomplete?.(); }

									}, 0 );

								}, 0 );
								return req;

							};
							return {
								get: key => run( records.get( key ) ), getAllKeys: () => run( [ ...records.keys() ] ),
								put: ( value, key ) => { const copy = structuredClone( value ); return run( key, () => records.set( key, copy ) ); },
								delete: key => run( undefined, () => records.delete( key ) ),
							};

						};
						return tx;

					},
				};
				request.onsuccess?.();

			}, 0 );
			return request;

		},
	};
	return factory;

}

/** The synchronous localStorage contract, independent of browser availability. */
export function saveLocalStorage() {

	const values = new Map();
	return { get length() { return values.size; }, key: i => [ ...values.keys() ][ i ] ?? null,
		getItem: key => values.get( key ) ?? null, setItem: ( key, value ) => values.set( key, String( value ) ), removeItem: key => values.delete( key ) };

}
