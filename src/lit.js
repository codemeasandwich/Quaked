// LIT files: coloured lightmaps for a map ("maps/e1m1.lit", made by ericw-tools' light -lit).
//
// The file is "QLIT", a version (1) and the light as RGB, three bytes for each byte of the BSP's
// own (monochrome) lighting lump, in the same order: a surface's colour samples are at three
// times its lightofs.

export const LIT_MAGIC = 0x54494c51; // "QLIT"

// the RGB light of a LIT file for a BSP whose lighting lump is monoLength bytes, or null
// when it is not a LIT file of that map
export function Lit_Parse( bytes, monoLength ) {

	if ( bytes == null || bytes.length < 8 || monoLength <= 0 ) return null;

	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
	if ( view.getUint32( 0, true ) !== LIT_MAGIC || view.getInt32( 4, true ) !== 1 ) return null;
	if ( bytes.length - 8 < monoLength * 3 ) return null;

	return bytes.slice( 8, 8 + monoLength * 3 );

}

// the entity list of a ".ent" file: the same text as the BSP's entity lump
export function Ent_Parse( bytes ) {

	if ( bytes == null || bytes.length === 0 ) return null;

	let s = '';
	for ( let i = 0; i < bytes.length; i ++ ) {

		if ( bytes[ i ] === 0 ) break;
		s += String.fromCharCode( bytes[ i ] );

	}

	return s.indexOf( '{' ) >= 0 ? s : null;

}
