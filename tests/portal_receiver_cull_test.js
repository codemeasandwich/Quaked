// Card [15]: a brush entity (door, false wall) outside the main view but in what a visible portal shows must be drawn, or whatever stands
// behind it shows through the preview. Synthetic leaves; the real E1M5 case is in docs/portal-receiver-brushes-2026-10-09.md.
await import( '../src/engine/render/gl_rsurf.js' );
const portal = await import( '../src/gl_portal.js' );
const vars = await import( '../src/engine/common/cvar.js' );
if ( ! vars.Cvar_FindVar( 'r_hdr' ) ) vars.Cvar_RegisterVariable( new vars.cvar_t( 'r_hdr', '1' ) ); vars.Cvar_SetValue( 'r_hdr', 1 ); // (Newer Game: portals are drawn)
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const leafIn = { id: 'in' }, leafOut = { id: 'out' };
const leaf0 = { contents: - 1, visframe: 0, firstmarksurface: null, nummarksurfaces: 0, compressed_vis: null };
const model = { entities: '{\n"classname" "worldspawn"\n}\n{\n"classname" "trigger_teleport"\n"target" "t1"\n"model" "*1"\n}\n{\n"classname" "info_teleport_destination"\n"targetname" "t1"\n"origin" "500 600 32"\n"angle" "90"\n}\n',
	surfaces: [ { flags: 0x10, plane: { normal: new Float32Array( [ 1, 0, 0 ] ), dist: 100 }, texinfo: { texture: { name: '*teleport' } }, polys: { numverts: 4, verts: [ [ 100, - 32, 0, 0, 0 ], [ 100, 32, 0, 1, 0 ], [ 100, 32, 112, 1, 1 ], [ 100, - 32, 112, 0, 1 ] ], next: null } } ],
	firstmodelsurface: 0, nummodelsurfaces: 1, submodels: [ { mins: [ - 4096, - 4096, - 4096 ], maxs: [ 4096, 4096, 4096 ] }, { mins: [ 90, - 40, - 8 ], maxs: [ 110, 40, 120 ] } ],
	nodes: [ leaf0 ], leafs: [ { contents: - 2 }, leaf0 ], numleafs: 1 };
Deno.test( 'a box in a visible portal\'s receiver is kept, one elsewhere or behind a portal that is not in view is not', () => {
	try {
		const [ p ] = portal.R_BuildPortals( model ); check( p, 'a portal' );
		p.destLeafs = [ leafIn ]; delete p._destLeafSet; p.srcLeaf.visframe = 7;
		const at = point => point[ 0 ] > 1000 && point[ 0 ] < 1100 ? leafIn : leafOut;
		const inside = [ 1040, 0, 0 ], insideMax = [ 1060, 20, 20 ], outside = [ 0, 0, 0 ], outsideMax = [ 20, 20, 20 ];
		portal.R_PortalsBeginFrame( true );
		check( portal.R_BoxInPortalReceiver( inside, insideMax, at, 7 ), 'a box in a receiver leaf, portal in view' );
		check( ! portal.R_BoxInPortalReceiver( outside, outsideMax, at, 7 ), 'a box in no receiver leaf' );
		check( portal.R_BoxInPortalReceiver( [ 1050, 0, 0 ], [ 1300, 20, 20 ], at, 7 ), 'a box with only a corner in a receiver leaf (a thin door in a wall)' );
		check( portal.R_BoxInPortalReceiver( [ 900, 0, 0 ], [ 1200, 20, 20 ], at, 7 ), 'a box with only its centre in a receiver leaf' );
		const src = p.srcLeaf; p.srcLeaf = null; check( ! portal.R_BoxInPortalReceiver( inside, insideMax, at, 7 ), 'a portal with no source leaf is never in view' ); p.srcLeaf = src;
		check( ! portal.R_BoxInPortalReceiver( inside, insideMax, at, 8 ), 'the portal is not in the main view this frame' );
		portal.R_PortalsBeginFrame( false ); check( ! portal.R_BoxInPortalReceiver( inside, insideMax, at, 7 ), 'portals switched off' ); portal.R_PortalsBeginFrame( true );
	} finally { portal.R_ClearPortals(); }
} );
