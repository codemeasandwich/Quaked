// Hexen II protocol families and message ids (src/engine/common/hexen2_protocol.js): the pinned Raven table, the
// collisions with this port's Quake ids that force family selection before body decoding, the replay-only natives, the
// private 1019 session and its bounded opcode-63 extension. plan section 5; T05 prerequisites.
import {
	HEXEN2_PROTOCOLS, HEXEN2_DEMO_PROTOCOLS, HEXEN2_LIVE_PROTOCOL, HEXEN2_LIVE_VERSION, HEXEN2_EXTENSION_OPCODE,
	HEXEN2_EXTENSION_MAX_BYTES, HEXEN2_NET_LIMITS, Hexen2_SoundIndexLimit, HEXEN2_STAT_BITS, HEXEN2_STAT_MASKS, HEXEN2_WIRE_FLAGS, HEXEN2_SERVER_MESSAGES, HEXEN2_CLIENT_COMMANDS,
	Hexen2_ServerMessageId, Hexen2_ServerMessageName, Hexen2_ClientCommandId, Hexen2_MessageMeaning,
	Hexen2_SelectCodec, Hexen2_ValidateExtension
} from '../src/engine/common/hexen2_protocol.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'the pinned Raven ids are exact, including the effect/inventory block', () => {

	same( HEXEN2_PROTOCOLS.raven111, 18, '1.11' );
	same( HEXEN2_PROTOCOLS.raven112, 19, '1.12' );
	same( HEXEN2_PROTOCOLS.uqe113, 20, 'UQE' );
	same( HEXEN2_DEMO_PROTOCOLS.join( ',' ), '18,19', 'the replay-only demo protocols' );
	same( HEXEN2_SERVER_MESSAGES.start_effect, 42, 'start_effect' );
	same( HEXEN2_SERVER_MESSAGES.end_effect, 43, 'end_effect' );
	same( HEXEN2_SERVER_MESSAGES.reference, 47, 'reference' );
	same( HEXEN2_SERVER_MESSAGES.clear_edicts, 48, 'clear_edicts' );
	same( HEXEN2_SERVER_MESSAGES.update_inv, 49, 'update_inv' );
	same( HEXEN2_SERVER_MESSAGES.skybox, 55, 'the last server message' );
	same( HEXEN2_CLIENT_COMMANDS.inv_select, 5, 'inventory select' );
	same( HEXEN2_CLIENT_COMMANDS.frame, 6, 'the last client command' );
	same( Hexen2_ServerMessageName( 42 ), 'start_effect', 'id to name' );
	same( Hexen2_ServerMessageId( 'update_inv' ), 49, 'name to id' );
	same( Hexen2_ServerMessageName( 56 ), null, 'an unknown id has no name' );
	same( Hexen2_ClientCommandId( 'delta' ), null, 'a Quake-only command has no Hexen id' );

} );

Deno.test( 'the colliding ids mean different things in each family, so a family must be chosen first', () => {

	for ( const id of [ 42, 47, 48, 49 ] ) {

		const meaning = Hexen2_MessageMeaning( 'server', id );
		check( meaning.collides, id + ' collides' );
		check( meaning.quake !== null && meaning.hexen2 !== null, id + ' names both meanings' );

	}
	same( Hexen2_MessageMeaning( 'server', 42 ).quake, 'svc_playerinfo', 'Quake 42' );
	same( Hexen2_MessageMeaning( 'server', 42 ).hexen2, 'start_effect', 'Hexen 42' );
	same( Hexen2_MessageMeaning( 'server', 47 ).quake, 'svc_packetentities', 'Quake 47' );
	same( Hexen2_MessageMeaning( 'server', 47 ).hexen2, 'reference', 'Hexen 47' );
	same( Hexen2_MessageMeaning( 'client', 5 ).quake, 'clc_delta', 'Quake command 5' );
	same( Hexen2_MessageMeaning( 'client', 5 ).hexen2, 'inv_select', 'Hexen command 5' );
	check( Hexen2_MessageMeaning( 'server', 23 ).collides === false, 'a shared meaning is not a collision' );
	same( Hexen2_MessageMeaning( 'server', 23 ).hexen2, 'temp_entity', 'shared temp entity' );

} );

Deno.test( 'family selection accepts the natives and the private session, and refuses unsupported numbers by name', () => {

	check( Hexen2_SelectCodec( { gameFamily: 'hexen2', protocol: 18 } ).ok, 'native 1.11' );
	check( Hexen2_SelectCodec( { gameFamily: 'hexen2', protocol: 19 } ).ok, 'native 1.12' );
	const privateCodec = Hexen2_SelectCodec( { gameFamily: 'hexen2', protocol: HEXEN2_LIVE_PROTOCOL } );
	check( privateCodec.ok, privateCodec.reason );
	same( privateCodec.codec, HEXEN2_LIVE_VERSION, 'the private codec name' );
	same( privateCodec.private, true, 'the private session' );
	const uqe = Hexen2_SelectCodec( { gameFamily: 'hexen2', protocol: 20 } );
	check( ! uqe.ok && /UQE protocol 20/.test( uqe.reason ), uqe.reason );
	const old = Hexen2_SelectCodec( { gameFamily: 'hexen2', protocol: 15 } );
	check( ! old.ok && /1\.03/.test( old.reason ), old.reason );
	const old109 = Hexen2_SelectCodec( { gameFamily: 'hexen2', protocol: 17 } );
	check( ! old109.ok && /1\.09/.test( old109.reason ), old109.reason );
	check( ! Hexen2_SelectCodec( { gameFamily: 'hexen2', protocol: 21 } ).ok, 'an unknown number is refused' );
	check( ! Hexen2_SelectCodec( { gameFamily: 'nonsense', protocol: 18 } ).ok, 'an unknown family is refused' );

} );

Deno.test( 'Quake keeps its own numbers and cannot borrow the private Hexen session', () => {

	same( Hexen2_SelectCodec( { gameFamily: 'quake', protocol: 15 } ).codec, 'quake-native', 'Quake 15' );
	same( Hexen2_SelectCodec( { gameFamily: 'quake', protocol: 1015 } ).codec, 'quake-large', 'Quake large protocol' );
	check( ! Hexen2_SelectCodec( { gameFamily: 'quake', protocol: 1019 } ).ok, 'Quake refuses the private Hexen session' );
	check( ! Hexen2_SelectCodec( { gameFamily: 'quake', protocol: 18 } ).ok, 'Quake refuses the Hexen demo protocol' );

} );

Deno.test( 'the extension envelope is opcode 63 with a bounded body', () => {

	same( HEXEN2_EXTENSION_OPCODE, 63, 'the service opcode' );
	same( HEXEN2_EXTENSION_MAX_BYTES, 4096, 'the body bound' );
	check( Hexen2_ValidateExtension( { opcode: 63, bytes: 0 } ).ok, 'an empty enveloped extension' );
	check( Hexen2_ValidateExtension( { opcode: 63, bytes: HEXEN2_EXTENSION_MAX_BYTES } ).ok, 'the bound itself' );
	check( ! Hexen2_ValidateExtension( { opcode: 63, bytes: HEXEN2_EXTENSION_MAX_BYTES + 1 } ).ok, 'one byte over the bound' );
	check( ! Hexen2_ValidateExtension( { opcode: 62, bytes: 1 } ).ok, 'another opcode is not the extension' );
	check( ! Hexen2_ValidateExtension( { opcode: 63, bytes: - 1 } ).ok, 'a negative length' );

} );

Deno.test( 'the pinned network limits, sound widths and stat masks are exact', () => {

	same( HEXEN2_NET_LIMITS.maxMessageBytes, 20000, 'MAX_MSGLEN' );
	same( HEXEN2_NET_LIMITS.maxDatagramBytes, 1024, 'MAX_DATAGRAM' );
	same( HEXEN2_NET_LIMITS.maxClients, 16, 'MAX_CLIENTS' );
	same( HEXEN2_NET_LIMITS.maxEdicts, 600, 'MAX_EDICTS' );
	same( HEXEN2_NET_LIMITS.maxModels, 512, 'MAX_MODELS' );
	same( Hexen2_SoundIndexLimit( 18 ), 256, 'the 1.11 byte-wide sound index' );
	same( Hexen2_SoundIndexLimit( 19 ), 512, 'the 1.12 mission pack index (ambients as a word)' );
	same( Hexen2_SoundIndexLimit( 20 ), null, 'UQE has no admitted sound width' );
	same( HEXEN2_STAT_BITS.sc1_health, 1, 'health bit' );
	same( HEXEN2_STAT_BITS.sc1_rings_active, 0x80000000, 'the last SC1 bit, unsigned (1 << 31 is negative and would sign-extend into SC2)' );
	same( HEXEN2_STAT_BITS.sc2_obj2, 1 << 23, 'the last SC2 bit' );
	same( HEXEN2_STAT_MASKS.sc1StatBar, 0x01ffffff, 'SC1_STAT_BAR' );
	same( HEXEN2_STAT_MASKS.sc2StatBar, 0x0000001e, 'SC2_STAT_BAR' );
	same( HEXEN2_STAT_MASKS.sc1Inventory, 0x01fffc00, 'SC1_INV' );
	same( HEXEN2_WIRE_FLAGS.u_morebits, 1, 'U_MOREBITS' );
	same( HEXEN2_WIRE_FLAGS.u_morebits2, 1 << 15, 'U_MOREBITS2' );
	same( HEXEN2_WIRE_FLAGS.snd_overflow2, 1 << 3, 'the 1.13 ambient sound overflow flag, kept only as a refused extension' );

} );
