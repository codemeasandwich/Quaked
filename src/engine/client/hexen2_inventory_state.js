/**
 * @module engine/client/hexen2_inventory_state
 *
 * The client's artifact inventory as the shared client owns it: the stable order of the artifacts carried, the six-icon
 * scroll position, the selected slot and the native four-second display timer (uhexen2 engine/hexen2/sbar.c
 * SB_InvChanged, SB_InvReset, InvLeft_f, InvRight_f, InvUse_f, InvDrop_f and DrawArtifactInventory). The counts come
 * from `cl.h2.stats`, the record `svc_update_inv` fills, so the input commands and the status bar read one state
 * instead of each keeping its own.
 *
 * Types: plain values and functions; no exported classes.
 * State: the inventory object hangs off `cl.h2.inventory`, so a new serverinfo (`CL_Hexen2Reset`) drops it with the
 * rest of the Hexen client state.
 * Errors: none raised; a client without a Hexen state reports an empty inventory.
 *
 * Native code: /tmp/h2-refs/uhexen2/engine/hexen2/sbar.c:1430-1595 (SB_InvChanged, SB_InvReset, InvLeft_f etc.).
 */

import { HEXEN2_ARTIFACT_FIELDS } from './hexen2_inventory.js';

/** How many artifact icons the native inventory row shows at once (sbar.c INV_MAX_ICON). */
export const HEXEN2_INV_MAX_ICON = 6;
/** How long the inventory row stays open after a selection command, in seconds (sbar.c INVENTORY_DISPLAY_TIME). */
export const HEXEN2_INVENTORY_DISPLAY_TIME = 4;

const ARTIFACTS = HEXEN2_ARTIFACT_FIELDS.length;

// The wire side is installed by cl_input (CL_SendInvSelect) so this leaf state module never imports the client.
let sendSelection = null;

/**
 * Installs the native `clc_inv_select` sender (cl_input.js, `CL_SendInvSelect`). Called once when the input commands
 * load.
 *
 * @param {?function(number): void} send the sender, or null
 */
export function Hexen2_InventorySetSender( send ) { sendSelection = typeof send === 'function' ? send : null; }

function number( value ) { return typeof value === 'number' && Number.isFinite( value ) ? value | 0 : 0; }
function send( selection ) { if ( sendSelection ) sendSelection( selection & 0xff ); }

/**
 * A fresh, empty inventory in the native initial state (`SB_InvReset`).
 *
 * @returns {{ count: number, selected: number, startpos: number, order: number[], artifacts: number[], open: boolean,
 *   hideTime: number }} the inventory
 */
export function Hexen2_InventoryNew() {

	return { count: 0, selected: - 1, startpos: 0, order: new Array( ARTIFACTS ).fill( 0 ),
		artifacts: new Array( ARTIFACTS ).fill( 0 ), open: false, hideTime: 0 };

}

/**
 * The inventory attached to a shared client, created on first use.
 *
 * @param {object} cl the client state (`cl.h2` is the Hexen record)
 * @returns {?object} the inventory, or null when the client has no Hexen state
 */
export function Hexen2_InventoryState( cl ) {

	if ( ! cl || ! cl.h2 ) return null;
	const current = cl.h2.inventory;
	if ( current === null || typeof current !== 'object' || ! Array.isArray( current.order ) ) {

		cl.h2.inventory = Hexen2_InventoryNew();
		return cl.h2.inventory;

	}
	return current;

}

/**
 * Reads the fifteen native artifact counts from the stats record.
 *
 * @param {?object} h2 the Hexen client state
 * @returns {number[]} the counts in artifact-number order (`cnt_torch` first)
 */
export function Hexen2_InventoryCounts( h2 ) {

	const stats = h2?.stats ?? {};
	return HEXEN2_ARTIFACT_FIELDS.map( field => number( stats[ field ] ) );

}

/**
 * Rebuilds the carried-artifact order from the counts, as native `SB_InvChanged` does: held items keep their order,
 * new ones append by artifact number, and the selection and scroll position are clamped.
 *
 * @param {object} cl the shared client
 * @returns {{ inventory: ?object, changed: boolean, selection: number }} the state, whether the selection must be sent
 *   to the server, and the native `cl.v.inventory` byte (selected artifact + 1, or 0)
 */
export function Hexen2_InventorySync( cl ) {

	const inventory = Hexen2_InventoryState( cl );
	if ( inventory === null ) return { inventory: null, changed: false, selection: 0 };
	const counts = Hexen2_InventoryCounts( cl.h2 );
	const examined = new Array( ARTIFACTS ).fill( false );
	let position = 0;
	// held items keep their order
	for ( let i = 0; i < inventory.count && i < ARTIFACTS; i ++ ) {

		const artifact = inventory.order[ i ] | 0;
		if ( artifact < 0 || artifact >= ARTIFACTS || examined[ artifact ] || counts[ artifact ] <= 0 ) continue;
		examined[ artifact ] = true;
		inventory.order[ position ++ ] = artifact;

	}
	// then the new ones by artifact number
	for ( let artifact = 0; artifact < ARTIFACTS; artifact ++ ) {

		if ( examined[ artifact ] || counts[ artifact ] <= 0 ) continue;
		inventory.order[ position ++ ] = artifact;

	}
	let changed = false;
	const previousSelected = inventory.selected, previousCount = inventory.count;
	inventory.artifacts = counts;
	inventory.count = position;
	if ( inventory.selected >= inventory.count ) { inventory.selected = inventory.count - 1; changed = true; }
	if ( inventory.count > 0 && inventory.selected < 0 ) { inventory.selected = 0; changed = true; }
	if ( inventory.count === 0 ) inventory.selected = - 1;
	if ( inventory.count <= 1 ) inventory.startpos = 0;
	else if ( inventory.startpos >= inventory.count ) { inventory.startpos = Math.max( 0, inventory.selected ); changed = true; }
	changed = changed || previousSelected !== inventory.selected || previousCount !== inventory.count;
	const selection = Hexen2_InventorySelection( inventory );
	if ( changed ) send( selection );
	return { inventory, changed, selection };

}

/**
 * The native `cl.v.inventory` byte: the selected artifact plus one, or 0 when nothing is selected or carried.
 *
 * @param {?object} inventory an inventory from `Hexen2_InventoryState`
 * @returns {number} the selection byte
 */
export function Hexen2_InventorySelection( inventory ) {

	if ( inventory === null || inventory.count <= 0 || inventory.selected < 0 || inventory.selected >= inventory.count ) return 0;
	return ( ( inventory.order[ inventory.selected ] | 0 ) + 1 ) & 0xff;

}

/*
===============
Hexen2_InvLeft

Native InvLeft_f: the first press opens the row; later presses move the selection left, scrolling a full row when the
selection is already at its left edge.
===============
*/
/**
 * The `invleft` command's state change.
 *
 * @param {object} cl the shared client
 * @returns {boolean} true when the inventory moved (the caller opens the row sound)
 */
export function Hexen2_InvLeft( cl ) {

	const inventory = Hexen2_InventoryState( cl );
	if ( inventory === null || cl.intermission ) return false;
	Hexen2_InventorySync( cl );
	if ( inventory.count <= 0 ) return false;
	const wasOpen = inventory.open;
	if ( ! wasOpen ) inventory.open = true;
	else if ( inventory.selected === inventory.startpos ) {

		inventory.startpos = ( inventory.startpos - 1 + inventory.count ) % inventory.count;
		inventory.selected = inventory.startpos;

	} else inventory.selected = ( inventory.selected - 1 + inventory.count ) % inventory.count;
	inventory.hideTime = ( cl.time ?? 0 ) + HEXEN2_INVENTORY_DISPLAY_TIME;
	return true;

}

/**
 * The `invright` command's state change (native InvRight_f).
 *
 * @param {object} cl the shared client
 * @returns {boolean} true when the inventory moved
 */
export function Hexen2_InvRight( cl ) {

	const inventory = Hexen2_InventoryState( cl );
	if ( inventory === null || cl.intermission ) return false;
	Hexen2_InventorySync( cl );
	if ( inventory.count <= 0 ) return false;
	const wasOpen = inventory.open;
	if ( ! wasOpen ) inventory.open = true;
	else {

		const rightIcon = inventory.count >= HEXEN2_INV_MAX_ICON
			? ( inventory.startpos + HEXEN2_INV_MAX_ICON - 1 ) % inventory.count
			: ( inventory.startpos + inventory.count - 1 ) % inventory.count;
		if ( inventory.selected === rightIcon ) inventory.startpos = ( inventory.startpos + 1 ) % inventory.count;
		inventory.selected = ( inventory.selected + 1 ) % inventory.count;

	}
	inventory.hideTime = ( cl.time ?? 0 ) + HEXEN2_INVENTORY_DISPLAY_TIME;
	return true;

}

/**
 * The `invuse` command's state change: select the artifact for the server and close the row (native InvUse_f).
 *
 * @param {object} cl the shared client
 * @returns {?number} the artifact byte to send, or null when nothing is carried or an intermission holds the game
 */
export function Hexen2_InvUse( cl ) {

	const inventory = Hexen2_InventoryState( cl );
	if ( inventory === null || cl.intermission ) return null;
	const sync = Hexen2_InventorySync( cl );
	if ( sync.inventory.count <= 0 ) return null;
	const selection = Hexen2_InventorySelection( inventory );
	inventory.open = false;
	inventory.hideTime = 0;
	return selection;

}

/**
 * The `invdrop` command's state change (native InvDrop_f).
 *
 * @param {object} cl the shared client
 * @returns {?number} the artifact byte to send, or null when nothing is carried
 */
export function Hexen2_InvDrop( cl ) {

	const inventory = Hexen2_InventoryState( cl );
	if ( inventory === null || cl.intermission ) return null;
	Hexen2_InventorySync( cl );
	if ( inventory.count <= 0 ) return null;
	const selection = Hexen2_InventorySelection( inventory );
	inventory.open = false;
	inventory.hideTime = 0;
	return selection;

}

/**
 * The `invoff` command: close the inventory row without changing the selection.
 *
 * @param {object} cl the shared client
 */
export function Hexen2_InvOff( cl ) {

	const inventory = Hexen2_InventoryState( cl );
	if ( inventory === null ) return;
	inventory.open = false;
	inventory.hideTime = 0;

}

/**
 * Closes the row when its native display time has expired and reports the selection the server should receive, as
 * `DrawArtifactInventory`'s `Inv_Update(false)` does on the next frame.
 *
 * @param {object} cl the shared client
 * @returns {?number} the selection byte to send, or null when the row did not close
 */
export function Hexen2_InventoryExpire( cl ) {

	const inventory = Hexen2_InventoryState( cl );
	if ( inventory === null || ! inventory.open ) return null;
	if ( ( cl.time ?? 0 ) <= inventory.hideTime ) return null;
	inventory.open = false;
	const selection = Hexen2_InventorySelection( inventory );
	send( selection );
	return selection;

}
