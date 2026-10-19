// A minimal DOM canvas double for the port's 2D overlay path: enough of a canvas and 2D context for Draw_CachePic's
// palette conversion and Draw_Pic's drawImage calls, so headless tests can execute the real drawing functions.
export function installFakeCanvas() {

	const calls = [];
	class Context2D {

		constructor( canvas ) { this.canvas = canvas; this.imageSmoothingEnabled = false; this.imageSmoothingQuality = 'low'; }
		setTransform() {}
		clearRect() {}
		fillRect() {}
		createImageData( width, height ) { return { width, height, data: new Uint8ClampedArray( width * height * 4 ) }; }
		putImageData() {}
		drawImage( image, x, y, w, h ) { calls.push( { image, x, y, w, h } ); }

	}
	class Canvas {

		constructor() { this.width = 0; this.height = 0; this.style = {}; this._ctx = new Context2D( this ); }
		getContext( kind ) { return kind === '2d' ? this._ctx : null; }

	}
	const previousWindow = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	const previousDocument = Object.getOwnPropertyDescriptor( globalThis, 'document' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, addEventListener() {} } } );
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: tag => new Canvas( tag ) } } );
	return {
		calls,
		canvas: new Canvas(),
		restore() {

			if ( previousWindow ) Object.defineProperty( globalThis, 'window', previousWindow ); else delete globalThis.window;
			if ( previousDocument ) Object.defineProperty( globalThis, 'document', previousDocument ); else delete globalThis.document;

		}
	};

}
