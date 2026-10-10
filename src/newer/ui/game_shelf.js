/**
 * @module newer/ui/game_shelf
 *
 * The game shelf (card [M1]; owner direction, 10 Oct 2026): when more than one game is installed, the index page
 * opens on a row of 3-D game boxes, standing spine-out like a shelf. Cycling pulls the chosen box forward and turns
 * it to show its front, and it can be turned over to show its back. Choosing a playable game opens that game's own
 * URL (`index.html?game=<id>`) with Newer Game's enhancements; a box not playable yet says so. The last box adds a
 * game from a folder the player picks: its `front`, `side` and `back` images make the box, with a placeholder (the
 * box's text printed) for any image that is missing.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `shelf`; browser storage.
 *
 * Errors: catches at 5 places.
 */

/** Each installed game's box art (paths relative to the page); a face not listed is a placeholder. */
export const GAME_BOXES = Object.freeze( {
	shareware: { front: 'assets/boxes/quake/front.jpg', back: 'assets/boxes/quake/back.jpg', spine: 'assets/boxes/quake/spine.jpg', sticker: 'Shareware' },
	quake: { front: 'assets/boxes/quake/front.jpg', back: 'assets/boxes/quake/back.jpg', spine: 'assets/boxes/quake/spine.jpg' },
	hipnotic: { front: 'assets/boxes/hipnotic/front.jpg', back: 'assets/boxes/hipnotic/back.jpg' },
	rogue: { front: 'assets/boxes/rogue/front.jpg', back: 'assets/boxes/rogue/back.jpg' },
	mg1: { front: 'assets/boxes/mg1/front.jpg' },
	malice: { front: 'assets/boxes/malice/front.jpg', back: 'assets/boxes/malice/back.jpg' },
	xmen: { front: 'assets/boxes/xmen/front.jpg', back: 'assets/boxes/xmen/back.jpg' },
	aopfm_v2: { front: 'assets/boxes/aopfm_v2/front.jpg' }
} );

const KIND_TEXT = Object.freeze( { shareware: 'The first episode of Quake', base: 'The full game', mission: 'A Quake mission pack', episode: 'A Quake episode', addon: 'A Quake add-on', folder: 'Added from a folder' } );
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
const DB_NAME = 'quaked.shelf.v1';
const STORE_WAIT_MS = 1500; // the longest the shelf waits for the games added from folders
let shelf = null;

/**
 * The box a game is shown in.
 *
 * @param {{ id: string, name: string, kind?: string, playable?: boolean, reason?: string }} game a catalogue entry
 *   (game_catalogue.js) or a game added from a folder
 * @param {{ front?: string, back?: string, spine?: string }} [images] its own images, for a folder game
 * @returns {{ id: string, name: string, kind: string, playable: boolean, reason: string, front: ?string, back: ?string,
 *   spine: ?string, sticker: ?string, text: string }} each face's image (null: a placeholder) and the box's text
 */
export function GameShelf_Box( game, images = GAME_BOXES[ game.id ] ?? {} ) {

	const kind = game.kind ?? 'addon';
	return { id: game.id, name: game.name, kind, playable: game.playable === true, reason: game.reason ?? '',
		front: images.front ?? null, back: images.back ?? null, spine: images.spine ?? images.side ?? null, sticker: images.sticker ?? null,
		text: KIND_TEXT[ kind ] ?? KIND_TEXT.addon };

}

/**
 * Reads a picked folder: its name, and its `front`, `side` (or `spine`) and `back` images, by file name whatever their
 * image type (front.png, Front.JPG, back.webp ...). Only the folder's own top level is read.
 *
 * @param {Array<{ name: string, webkitRelativePath?: string }>} files the folder's files (from a directory input, or
 *   gathered from a directory handle with `webkitRelativePath` set)
 * @param {string} [folderName] the folder's name when the files do not carry it
 * @returns {{ name: string, files: { front?: object, side?: object, back?: object }, paks: string[] }} the images found
 *   (the File objects), and the packs (`.pak`/`.pk3`) the folder holds
 */
export function GameShelf_ReadFolder( files, folderName = '' ) {

	const found = {}, paks = [];
	let name = folderName;
	for ( const file of files ) {

		const path = ( file.webkitRelativePath || file.name ).split( '/' );
		if ( ! name && path.length > 1 ) name = path[ 0 ];
		if ( path.length > 2 ) continue; // the folder's own top level only
		const base = path[ path.length - 1 ], stem = base.replace( /\.[^.]+$/, '' ).toLowerCase();
		if ( /\.(pak|pk3)$/i.test( base ) ) paks.push( base );
		if ( ! IMAGE.test( base ) ) continue;
		const face = stem === 'spine' ? 'side' : stem;
		if ( ( face === 'front' || face === 'side' || face === 'back' ) && ! found[ face ] ) found[ face ] = file;

	}
	return { name: name || 'Your game', files: found, paks };

}

/**
 * The URL that opens a game: this page with `?game=<id>`.
 *
 * @param {string} id the game's catalogue id
 * @param {string} [page] the page's address without its query (default this page's)
 * @returns {string} the game's URL
 */
export function GameShelf_Url( id, page = typeof location !== 'undefined' ? location.origin + location.pathname : 'index.html' ) {

	return `${page}?game=${encodeURIComponent( id )}`;

}

// --- the games added from folders, kept in IndexedDB (each as its name and its image Blobs) ---

function db() {

	return new Promise( ( resolve, reject ) => {

		if ( typeof indexedDB === 'undefined' ) { reject( new Error( 'no IndexedDB' ) ); return; }
		const open = indexedDB.open( DB_NAME, 1 );
		open.onupgradeneeded = () => open.result.createObjectStore( 'games', { keyPath: 'id' } );
		open.onsuccess = () => resolve( open.result );
		open.onerror = () => reject( open.error );

	} );

}

async function storedGames() {

	// bounded: a browser that never answers (a blocked open) leaves the shelf without the added games, not blank
	const read = ( async () => {

		const d = await db();
		return await new Promise( ( resolve, reject ) => { const r = d.transaction( 'games' ).objectStore( 'games' ).getAll(); r.onsuccess = () => resolve( r.result ); r.onerror = () => reject( r.error ); } );

	} )();
	try { return await Promise.race( [ read, new Promise( resolve => setTimeout( () => resolve( [] ), STORE_WAIT_MS ) ) ] ); } catch { return []; }

}

async function storeGame( record ) {

	const d = await db();
	await new Promise( ( resolve, reject ) => { const t = d.transaction( 'games', 'readwrite' ); t.objectStore( 'games' ).put( record ); t.oncomplete = resolve; t.onerror = () => reject( t.error ); } );

}

// --- the shelf on the page ---

// (a filter on a box would flatten its 3-D faces, showing them from behind: a box not playable yet dims its faces)
const CSS = `
#game-shelf{position:fixed;inset:0;z-index:200;background:radial-gradient(ellipse at 50% 35%,#2a2118 0%,#0d0a07 60%,#000 100%);color:#d8c9a8;font-family:Georgia,'Times New Roman',serif;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none}
#game-shelf h1{position:absolute;top:4vh;width:100%;text-align:center;font-weight:normal;letter-spacing:.5em;font-size:clamp(14px,2.4vw,26px);text-transform:uppercase;color:#bfa77a;margin:0}
#game-shelf .stage{position:absolute;left:50%;top:48%;width:0;height:0;perspective:1800px;perspective-origin:50% 40%}
#game-shelf .row{position:absolute;transform-style:preserve-3d}
#game-shelf .box{position:absolute;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.2,.7,.2,1);cursor:pointer}
#game-shelf .box.dim .face{filter:brightness(.55) saturate(.6)}
#game-shelf .face{position:absolute;left:0;top:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:#15110c center/cover no-repeat;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
#game-shelf .face.ph{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8%;background:linear-gradient(160deg,#3a2c1c,#120d08);color:#e2cf9f}
#game-shelf .face.ph .t{font-size:var(--title);letter-spacing:.08em;text-transform:uppercase;line-height:1.15}
#game-shelf .face.ph .s{margin-top:.8em;font-size:calc(var(--title)*.45);color:#a99369}
#game-shelf .face.spine.ph{padding:0;writing-mode:vertical-rl;justify-content:center;background:linear-gradient(90deg,#1c150e,#3a2c1c 50%,#1c150e)}
#game-shelf .face.spine.ph .t{font-size:calc(var(--depth)*.42);letter-spacing:.15em;white-space:nowrap}
#game-shelf .face.end{background:#0f0b07}
#game-shelf .sticker{position:absolute;right:6%;top:12%;transform:rotate(12deg);background:#b3261e;color:#fff;font:bold calc(var(--title)*.5) Arial,sans-serif;padding:.3em .7em;letter-spacing:.1em;text-transform:uppercase;box-shadow:0 2px 6px rgba(0,0,0,.6)}
#game-shelf .add .face.ph{background:repeating-linear-gradient(135deg,#1d1610 0 14px,#241b13 14px 28px);border:2px dashed #7a6644}
#game-shelf .add .plus{font-size:calc(var(--title)*2.4);line-height:1;color:#bfa77a}
#game-shelf .caption{position:absolute;bottom:13vh;width:100%;text-align:center;padding:0 16px}
#game-shelf .caption .n{font-size:clamp(16px,2.6vw,30px);letter-spacing:.12em;text-transform:uppercase;color:#efe0bd}
#game-shelf .caption .k{margin-top:.4em;font-size:clamp(12px,1.5vw,17px);color:#a99369}
#game-shelf .controls{position:absolute;bottom:4vh;width:100%;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;padding:0 16px}
#game-shelf button{font:inherit;font-size:clamp(12px,1.4vw,16px);letter-spacing:.12em;text-transform:uppercase;color:#e2cf9f;background:rgba(60,45,28,.85);border:1px solid #7a6644;padding:.6em 1.2em;cursor:pointer}
#game-shelf button:hover,#game-shelf button:focus-visible{background:rgba(110,80,45,.95);outline:none}
#game-shelf button[disabled]{opacity:.4;cursor:default}
`;

function el( tag, cls, parent ) {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( parent ) parent.appendChild( e );
	return e;

}

// a face: its image, or a placeholder with the box's text printed
function face( box, side, cls, w, h ) {

	const f = el( 'div', 'face ' + cls );
	f.style.width = w + 'px'; f.style.height = h + 'px';
	const url = box[ side ];
	if ( url ) f.style.backgroundImage = `url("${url}")`;
	else {

		f.classList.add( 'ph' );
		if ( box.kind === 'add' ) { el( 'div', 'plus', f ).textContent = '+'; el( 'div', 't', f ).textContent = 'Add a game'; el( 'div', 's', f ).textContent = side === 'back' ? 'Pick the folder of your add-on or plug-in. Its front, side and back images make its box.' : 'From a folder'; }
		else if ( side === 'spine' ) el( 'div', 't', f ).textContent = box.name;
		else { el( 'div', 't', f ).textContent = box.name; el( 'div', 's', f ).textContent = side === 'back' ? box.text + ( box.playable ? '' : '. Not playable yet' + ( box.reason ? ': ' + box.reason : '' ) ) : box.text; }

	}
	if ( side === 'front' && box.sticker ) el( 'div', 'sticker', f ).textContent = box.sticker;
	return f;

}

function build( box, H ) {

	const W = Math.round( H * box.aspect ), D = Math.round( H * 0.17 );
	const b = el( 'div', 'box' + ( box.kind === 'add' ? ' add' : '' ) + ( box.playable || box.kind === 'add' ? '' : ' dim' ) );
	b.style.setProperty( '--title', Math.max( 12, W * 0.075 ) + 'px' ); b.style.setProperty( '--depth', D + 'px' );
	b.style.width = W + 'px'; b.style.height = H + 'px'; b.style.left = - W / 2 + 'px'; b.style.top = - H / 2 + 'px';
	const at = ( f, t ) => { f.style.transform = t; b.appendChild( f ); };
	at( face( box, 'front', 'front', W, H ), `translateZ(${D / 2}px)` );
	at( face( box, 'back', 'back', W, H ), `rotateY(180deg) translateZ(${D / 2}px)` );
	const spine = face( box, 'spine', 'spine', D, H ); spine.style.left = ( W - D ) / 2 + 'px';
	// a printed spine's name fits its length (about 0.75 of a letter's size per letter, with its spacing)
	const title = spine.querySelector( '.t' );
	if ( title ) title.style.fontSize = Math.min( D * 0.42, H * 0.86 / ( box.name.length * 0.78 ) ) + 'px';
	at( spine, `rotateY(-90deg) translateZ(${W / 2}px)` );
	const right = el( 'div', 'face end' ); right.style.width = D + 'px'; right.style.height = H + 'px'; right.style.left = ( W - D ) / 2 + 'px';
	at( right, `rotateY(90deg) translateZ(${W / 2}px)` );
	for ( const [ r, t ] of [ [ 'top', `rotateX(90deg) translateZ(${H / 2}px)` ], [ 'bottom', `rotateX(-90deg) translateZ(${H / 2}px)` ] ] ) {

		const e = el( 'div', 'face end ' + r ); e.style.width = W + 'px'; e.style.height = D + 'px'; e.style.top = ( H - D ) / 2 + 'px';
		at( e, t );

	}
	return { el: b, W, D };

}

function aspectOf( url ) {

	return new Promise( resolve => {

		if ( ! url ) { resolve( 0.82 ); return; }
		const img = new Image();
		img.onload = () => resolve( img.naturalWidth > 0 ? Math.min( 1.1, Math.max( 0.55, img.naturalWidth / img.naturalHeight ) ) : 0.82 );
		img.onerror = () => resolve( 0.82 );
		img.src = url;

	} );

}

/**
 * Opens the shelf over the page and resolves when the player has chosen a game to play (the page then goes to it).
 *
 * @param {Array<object>} games the installed games from the catalogue, in its order
 * @param {{ current?: ?string, open?: (url: string) => void, remember?: (id: string) => void }} [options] the game to
 *   start on (the last one chosen), how a game's URL is opened (default `location.assign`) and how the choice is kept
 * @returns {Promise<string>} the chosen game's id
 */
export async function GameShelf_Show( games, options = {} ) {

	const open = options.open ?? ( url => location.assign( url ) );
	if ( ! document.getElementById( 'game-shelf-style' ) ) { const s = el( 'style', '', document.head ); s.id = 'game-shelf-style'; s.textContent = CSS; }
	const root = el( 'div', '', document.body ); root.id = 'game-shelf'; root.setAttribute( 'role', 'listbox' ); root.setAttribute( 'aria-label', 'Choose your game' );
	el( 'h1', '', root ).textContent = 'Choose your game';
	const stage = el( 'div', 'stage', root ), row = el( 'div', 'row', stage ), caption = el( 'div', 'caption', root );
	const name = el( 'div', 'n', caption ), kind = el( 'div', 'k', caption );
	const controls = el( 'div', 'controls', root );
	const button = ( label, fn ) => { const b = el( 'button', '', controls ); b.textContent = label; b.addEventListener( 'click', e => { e.stopPropagation(); fn(); } ); return b; };

	const boxes = games.map( g => GameShelf_Box( g ) );
	for ( const record of await storedGames() ) boxes.push( folderBox( record ) );
	boxes.push( { id: '+add', name: 'Add a game', kind: 'add', playable: false, reason: '', front: null, back: null, spine: null, text: '' } );
	// drawn at once with a box's usual shape; each box takes its front's own shape as that image arrives
	for ( const b of boxes ) b.aspect = 0.82;

	let index = Math.max( 0, boxes.findIndex( b => b.id === options.current ) ), flipped = false, built = [], note = '';
	const H = () => Math.round( Math.min( innerHeight * 0.5, innerWidth * 0.55 ) );
	const render = () => {

		row.textContent = ''; built = boxes.map( b => build( b, H() ) );
		built.forEach( ( b, i ) => { row.appendChild( b.el ); b.el.addEventListener( 'click', e => { e.stopPropagation(); if ( i === index ) choose(); else select( i ); } ); } );
		place();

	};
	const place = () => {

		const sel = built[ index ], gap = 6;
		built.forEach( ( b, i ) => {

			if ( i === index ) { b.el.style.transform = `translateZ(${H() * 0.35}px) rotateY(${flipped ? 180 : 0}deg)`; b.el.style.zIndex = 2; return; }
			// the others stand spine-out, packed beside the chosen box
			const side = Math.sign( i - index ), between = built.slice( Math.min( i, index ) + 1, Math.max( i, index ) ).reduce( ( s, o ) => s + o.D + gap, 0 );
			const x = side * ( sel.W / 2 + gap * 4 + between + b.D / 2 );
			b.el.style.transform = `translateX(${x}px) rotateY(90deg)`; b.el.style.zIndex = 1;

		} );
		const box = boxes[ index ];
		name.textContent = box.name;
		kind.textContent = note || ( box.kind === 'add' ? 'Pick the folder of your add-on or plug-in' : box.playable ? box.text + ' — Enter or click to play' : box.text + ' — not playable yet' );
		playButton.disabled = ! ( box.playable || box.kind === 'add' );
		playButton.textContent = box.kind === 'add' ? 'Pick a folder' : 'Play';

	};
	const select = i => { index = ( i + boxes.length ) % boxes.length; flipped = false; note = ''; place(); };
	const flip = () => { flipped = ! flipped; place(); };
	let resolveChoice;
	const chosen = new Promise( r => { resolveChoice = r; } );
	const choose = () => {

		const box = boxes[ index ];
		if ( box.kind === 'add' ) { addFolder(); return; }
		if ( ! box.playable ) { note = box.kind === 'folder' ? 'Playing a game from a folder is not built yet' : 'Not playable yet' + ( box.reason ? ': ' + box.reason : '' ); place(); return; }
		try { ( options.remember ?? ( () => {} ) )( box.id ); } catch { /* the URL still opens it */ }
		resolveChoice( box.id );
		shelf?.close();
		open( GameShelf_Url( box.id ) );

	};
	const addFolder = async () => {

		try {

			const picked = await pickFolder();
			if ( ! picked ) return;
			const { name: folderName, files } = GameShelf_ReadFolder( picked.files, picked.name );
			const record = { id: 'folder:' + folderName + ':' + Date.now(), name: folderName, front: files.front ?? null, side: files.side ?? null, back: files.back ?? null };
			try { await storeGame( record ); } catch { note = 'Added for now (this browser cannot keep it)'; }
			const box = folderBox( record ); box.aspect = await aspectOf( box.front );
			boxes.splice( boxes.length - 1, 0, box ); index = boxes.length - 2; flipped = false; render();

		} catch ( error ) { note = 'The folder could not be read: ' + ( error?.message ?? error ); place(); }

	};

	button( '◀', () => select( index - 1 ) );
	button( 'Turn over', flip );
	const playButton = button( 'Play', choose );
	button( '▶', () => select( index + 1 ) );

	const keys = e => {

		if ( e.key === 'ArrowLeft' || e.key === 'a' ) select( index - 1 );
		else if ( e.key === 'ArrowRight' || e.key === 'd' ) select( index + 1 );
		else if ( e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'f' ) flip();
		else if ( e.key === 'Enter' ) choose();
		else return;
		e.preventDefault();

	};
	let wheelAt = 0, touchX = null;
	const wheel = e => { const now = performance.now(); if ( now - wheelAt < 180 ) return; wheelAt = now; select( index + Math.sign( e.deltaX || e.deltaY ) ); };
	root.addEventListener( 'touchstart', e => { touchX = e.touches[ 0 ].clientX; }, { passive: true } );
	root.addEventListener( 'touchend', e => { if ( touchX === null ) return; const dx = e.changedTouches[ 0 ].clientX - touchX; touchX = null; if ( Math.abs( dx ) > 40 ) select( index - Math.sign( dx ) ); } );
	addEventListener( 'keydown', keys ); root.addEventListener( 'wheel', wheel, { passive: true } ); addEventListener( 'resize', render );
	// a controller: left and right (d-pad or stick) cycle, A plays, Y turns the box over
	let padHeld = null, padTimer = setInterval( () => {

		const pad = Array.from( navigator.getGamepads?.() ?? [] ).find( p => p && p.connected );
		if ( ! pad ) return;
		const x = pad.axes?.[ 0 ] ?? 0, now = { left: pad.buttons[ 14 ]?.pressed || x < - 0.6, right: pad.buttons[ 15 ]?.pressed || x > 0.6, a: pad.buttons[ 0 ]?.pressed, y: pad.buttons[ 3 ]?.pressed };
		if ( padHeld === null ) { padHeld = now; return; } // a button already held when the shelf opened is not a press
		if ( now.left && ! padHeld.left ) select( index - 1 );
		if ( now.right && ! padHeld.right ) select( index + 1 );
		if ( now.a && ! padHeld.a ) choose();
		if ( now.y && ! padHeld.y ) flip();
		padHeld = now;

	}, 50 );
	shelf = { root, close: () => { removeEventListener( 'keydown', keys ); removeEventListener( 'resize', render ); clearInterval( padTimer ); root.remove(); shelf = null;
		for ( const b of boxes ) if ( b.kind === 'folder' ) for ( const url of [ b.front, b.back, b.spine ] ) if ( url ) URL.revokeObjectURL( url ); } };
	render();
	let reshape = null;
	boxes.forEach( b => aspectOf( b.front ).then( aspect => {

		if ( Math.abs( aspect - b.aspect ) < 0.005 || shelf === null ) return;
		b.aspect = aspect;
		if ( reshape === null ) reshape = requestAnimationFrame( () => { reshape = null; if ( shelf !== null ) render(); } );

	} ) );
	return chosen;

}

/**
 * Whether the shelf is open, and its element (for checks).
 *
 * @returns {?HTMLElement} the shelf's root element, or null
 */
export function GameShelf_Element() {

	return shelf?.root ?? null;

}

function folderBox( record ) {

	const url = blob => ( blob ? URL.createObjectURL( blob ) : null );
	return { ...GameShelf_Box( { id: record.id, name: record.name, kind: 'folder', playable: false }, {} ), front: url( record.front ), back: url( record.back ), spine: url( record.side ) };

}

// the folder the player picks: the directory picker where there is one, else a directory file input
function pickFolder() {

	if ( typeof window.showDirectoryPicker === 'function' ) {

		return window.showDirectoryPicker().then( async handle => {

			const files = [];
			for await ( const entry of handle.values() ) if ( entry.kind === 'file' ) files.push( await entry.getFile() );
			return { name: handle.name, files };

		} ).catch( error => ( error?.name === 'AbortError' ? null : Promise.reject( error ) ) );

	}
	return new Promise( resolve => {

		const input = document.createElement( 'input' );
		input.type = 'file'; input.webkitdirectory = true; input.multiple = true;
		input.addEventListener( 'change', () => resolve( input.files.length ? { name: '', files: Array.from( input.files ) } : null ) );
		input.addEventListener( 'cancel', () => resolve( null ) );
		input.click();

	} );

}
