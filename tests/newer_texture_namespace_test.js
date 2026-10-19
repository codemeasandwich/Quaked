// The wall-texture index is namespaced by game family, and an entry may provide low/mid/high files selected by
// r_texture_tier (default mid). A tiny synthetic index exercises the public selection path without importing any
// Hexen texture art (docs/hexen2/unified-host.md package U7).
import * as textures from '../src/newer/render/r_newertextures.js';
import * as vars from '../src/engine/common/cvar.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => { if ( actual !== expected ) throw new Error( `${message}: ${actual} != ${expected}` ); };

const INDEX = Object.freeze( {
	stone: [ 'stone-low.webp', 'stone-mid.webp', 'stone-high.webp' ],
	wall: { low: 'wall-low.webp', mid: 'wall-mid.webp', high: 'wall-high.webp' },
	door: { tiers: { low: 'door-low.webp', mid: 'door-mid.webp', high: 'door-high.webp' } },
	plain: 'plain.webp',
	fallback: { low: 'fallback-low.webp', high: 'fallback-high.webp' },
	absent: {}
} );

function registerTier() {

	if ( vars.Cvar_FindVar( 'r_texture_tier' ) === null ) vars.Cvar_RegisterVariable( textures.r_texture_tier );

}

Deno.test( 'the texture index has a Quake path and a Hexen II path', () => {

	GameProfile_Set( 'quake' );
	same( textures.R_TextureIndexBase(), 'newer/textures/', 'Quake index directory' );
	same( textures.R_TextureIndexPath(), 'newer/textures/index.json', 'Quake index file' );

	GameProfile_Set( 'hexen2' );
	same( textures.R_TextureIndexBase(), 'newer/textures/hexen2/', 'Hexen index directory' );
	same( textures.R_TextureIndexPath(), 'newer/textures/hexen2/index.json', 'Hexen index file' );

	GameProfile_Set( 'hexen2-portals' );
	same( textures.R_TextureIndexPath(), 'newer/textures/hexen2/index.json', 'Portal shares the Hexen namespace' );

	GameProfile_Set( 'quake' );

} );

Deno.test( 'a tiny synthetic index selects the tiered file, defaulting to mid', () => {

	registerTier();
	const saved = vars.Cvar_VariableString( 'r_texture_tier' );
	try {

		vars.Cvar_SetValue( 'r_texture_tier', 1 );
		same( textures.R_TextureTier(), 'mid', 'numeric 1 is mid' );
		same( textures.R_TextureIndexFile( INDEX, 'stone' ), 'stone-mid.webp', 'array entry, mid' );
		same( textures.R_TextureIndexFile( INDEX, 'wall' ), 'wall-mid.webp', 'object entry, mid' );
		same( textures.R_TextureIndexFile( INDEX, 'door' ), 'door-mid.webp', 'nested tiers, mid' );
		same( textures.R_TextureIndexFile( INDEX, 'plain' ), 'plain.webp', 'plain entry applies to every tier' );
		same( textures.R_TextureIndexFile( INDEX, 'fallback' ), 'fallback-low.webp', 'missing mid falls back to low' );
		same( textures.R_TextureIndexFile( INDEX, 'absent' ), null, 'an entry with no file is not upgraded' );
		same( textures.R_TextureIndexFile( INDEX, 'missing' ), null, 'an unlisted texture is not upgraded' );

		vars.Cvar_SetValue( 'r_texture_tier', 0 );
		same( textures.R_TextureTier(), 'low', 'numeric 0 is low' );
		same( textures.R_TextureIndexFile( INDEX, 'stone' ), 'stone-low.webp', 'array entry, low' );
		same( textures.R_TextureIndexFile( INDEX, 'fallback' ), 'fallback-low.webp', 'explicit low' );

		vars.Cvar_SetValue( 'r_texture_tier', 2 );
		same( textures.R_TextureTier(), 'high', 'numeric 2 is high' );
		same( textures.R_TextureIndexFile( INDEX, 'stone' ), 'stone-high.webp', 'array entry, high' );
		same( textures.R_TextureIndexFile( INDEX, 'fallback' ), 'fallback-high.webp', 'explicit high' );

		vars.Cvar_Set( 'r_texture_tier', 'low' );
		same( textures.R_TextureTier(), 'low', 'a tier name is accepted too' );
		same( textures.R_TextureIndexFile( INDEX, 'wall' ), 'wall-low.webp', 'named tier, object entry' );

		vars.Cvar_Set( 'r_texture_tier', 'nonsense' );
		same( textures.R_TextureTier(), 'mid', 'an unknown value stays mid' );

	} finally {

		vars.Cvar_Set( 'r_texture_tier', saved || '1' );

	}

} );

Deno.test( 'tiered and plain entries resolve through the same public file helper', () => {

	same( textures.R_TextureFile( 'only.webp', 'high' ), 'only.webp', 'a string ignores the tier' );
	same( textures.R_TextureFile( null ), null, 'nothing' );
	same( textures.R_TextureFile( [ 'a.webp', 'b.webp' ], 'high' ), 'b.webp', 'a short array falls back to mid' );
	check( textures.TEXTURE_TIERS.join( ',' ) === 'low,mid,high', 'the three tier names' );

} );


Deno.test( 'Hexen II loads the per-game index, not Quake\'s', async () => {

	registerTier();
	const savedFetch = globalThis.fetch, savedTier = vars.Cvar_VariableString( 'r_texture_tier' ), fetched = [];
	globalThis.fetch = async url => {

		fetched.push( String( url ) );
		check( String( url ).includes( 'textures/hexen2/index.json' ), 'the Hexen namespace is fetched' );
		return { ok: true, json: async () => ( { version: 1, textures: { stone: { low: 's-low.webp', mid: 's-mid.webp', high: 's-high.webp' } } } ) };

	};
	try {

		GameProfile_Set( 'hexen2' );
		vars.Cvar_Set( 'r_texture_tier', 'high' );
		const api = await import( '../src/newer/render/r_newertextures.js?hexen-index-' + Math.random() );
		await api.R_NewerTexturesPrefetch( [ 'stone' ] );
		check( fetched.length === 1 && fetched[ 0 ].includes( 'textures/hexen2/index.json' ), 'only the Hexen index was requested: ' + JSON.stringify( fetched ) );
		same( api.R_TextureTier(), 'high', 'the tier is read at load time' );

	} finally {

		globalThis.fetch = savedFetch;
		vars.Cvar_Set( 'r_texture_tier', savedTier || '1' );
		GameProfile_Set( 'quake' );

	}

} );
