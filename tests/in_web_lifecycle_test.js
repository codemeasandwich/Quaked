// Browser input starts once and stops completely (card [44m], item 19): a second IN_Init added every listener again,
// and IN_Shutdown left the touch-start listener on the element. Through the public IN_Init and IN_Shutdown with a
// document and element that count their listeners (a desktop browser: no touch controls).
import { IN_Init, IN_Shutdown } from '../src/platform/in_web.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
function target() {
	const live = new Map();
	return { live, addEventListener( type, fn ) { const k = type + ':' + fn.name; live.set( k, ( live.get( k ) ?? 0 ) + 1 ); },
		removeEventListener( type, fn ) { const k = type + ':' + fn.name; if ( live.get( k ) ) live.set( k, live.get( k ) - 1 ); },
		count() { let n = 0; for ( const v of live.values() ) n += v; return n; } };
}

Deno.test( 'IN_Init twice adds each listener once; IN_Shutdown removes them all, touch start included', () => {
	const saved = [ 'document', 'navigator' ].map( k => [ k, Object.getOwnPropertyDescriptor( globalThis, k ) ] );
	const doc = target(), element = target();
	Object.defineProperty( globalThis, 'document', { configurable: true, value: Object.assign( doc, { body: element, pointerLockElement: null } ) } );
	Object.defineProperty( globalThis, 'navigator', { configurable: true, value: { userAgent: 'Desktop', maxTouchPoints: 0 } } );
	try {
		IN_Init( element );
		const once = { doc: doc.count(), element: element.count() };
		check( element.live.get( 'touchstart:handleTouchStart' ) === 1, 'the touch-start listener is on the element' );
		IN_Init( element );
		same( doc.count(), once.doc, 'document listeners once' ); same( element.count(), once.element, 'element listeners once' );
		IN_Shutdown();
		same( doc.count(), 0, 'no document listener left' );
		same( element.count(), 0, 'no element listener left, touch start included' );
	} finally {
		IN_Shutdown();
		for ( const [ k, d ] of saved ) { if ( d ) Object.defineProperty( globalThis, k, d ); else delete globalThis[ k ]; }
	}
} );
