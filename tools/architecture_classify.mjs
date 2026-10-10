// The proposed folder and owning increment ([44b]..[44f]) of every src module (card [44a]), and the measurements the
// baseline states about them, from tools/architecture_graph.mjs's output:
//   * subsystem sizes; the cross-subsystem import matrix (distinct module pairs and statements);
//   * the engine's own cycle (engine modules alone, and with the platform), and what is left of the big cycle when every
//     engine -> Newer import is removed;
//   * every engine module importing a Newer module, with the modules it imports;
//   * the debts' checks: engine cycles spanning more than one folder (D1a), cycles holding a Newer module once the native
//     side no longer imports Newer (D1c).
// Fails (exit 1) if the graph run failed (an unscanned module or unexpected unresolved import), or any module has no folder
// or no increment. Usage:
//   node tools/architecture_classify.mjs <graph.json> <out.json>
import fs from 'node:fs';

const g = JSON.parse( fs.readFileSync( process.argv[ 2 ], 'utf8' ) );
// (a graph whose own run failed is not measured)
if ( g.unscanned?.length || g.unexpected?.length ) { console.error( 'the graph run failed: ' + [ ...g.unscanned, ...g.unexpected.map( e => e.from + ' -> ' + e.to ) ].join( ' ' ) ); process.exit( 1 ); }
// ordered: the first that matches; [ folder, increment, pattern on the path inside src/ ]
const RULES = [
	[ 'newer/render/rend_veil', '44e', /^rend_veil\// ],
	// (hooks: the planned neutral module the engine calls and Newer registers into, D1b)
	[ 'engine/common', '44b', /^(common|cmd|cvar|zone|sys|crc|mathlib|quakedef|console|wad|pak|bspfile|anorm_dots|protocol|hooks)\.js$/ ],
	[ 'engine/progs', '44b', /^(pr_cmds|pr_comp|pr_edict|pr_exec|progs|progdefs)\.js$/ ],
	[ 'engine/server', '44b', /^(sv_main|sv_move|sv_phys|sv_user|server|world|pmove|host|host_cmd)\.js$/ ],
	[ 'engine/net', '44c', /^net(_\w+)?\.js$/ ],
	[ 'engine/client', '44c', /^(cl_\w+|client|chase|view|keys|sbar|screen|menu)\.js$/ ],
	[ 'engine/sound', '44c', /^(snd_\w+|sound|cd_audio)\.js$/ ],
	// the Newer parts of the renderer kept beside the GL port's names
	[ 'newer/render', '44e', /^(gl_post|gl_portal|gl_normals)\.js$/ ],
	// the normal-map maths, split from gl_normals (made in [44g] for debt D1c)
	[ 'newer/render', '44g', /^normal_math\.js$/ ],
	[ 'engine/render', '44d', /^(gl_\w+|glquake|render|vid|r_part|lit)\.js$/ ],
	// the client's one ray-cast helper (made in [44g] for debt D6)
	[ 'engine/render', '44g', /^r_trace\.js$/ ],
	[ 'platform', '44c', /^(webxr|touch|touch_layout|in_web)\.js$/ ],
	[ 'newer/gameplay', '44b', /^(sv_\w+|respawn_record|rend_veil_state|axe_record|shotgun_flight|powervision_state)\.js$/ ],
	[ 'newer/ui', '44f', /^(menu_webgl\w*|menu_art|studio_logo|loading_\w+|r_demoloading|r_newerhud|r_playerface|playerface_manifest|r_bestiary_book|r_bestiary|bestiary_art|bestiary_state|newer_defaults|r_facegame|face_state|respawn_notice|respawn_motion|r_folio)\.js$/ ],
	[ 'newer/sound', '44f', /^s_\w+\.js$/ ],
	// asset preparation (made ahead of the game or in the background) and the prepared data's formats and transports
	[ 'newer/assets', '44f', /^(normal_prepare|rockfield_prepare|rockfield_worker|prepared_corpus|startup_\w+)\.js$/ ],
	[ 'newer/assets', '44e', /(_bake_format|_bakes|_bundle|_transport|_startup_packs|_presets|_store)\.js$|^(alias_mesh_\w+|rockfield|r_normalprefetch|r_rockbakes|r_demonbakes|r_aliasmeshcache|demon_bake_format)\.js$/ ],
	// the model and animation renderer ([44d]): poses, skins, held weapons, cut and lying bodies, the levels drawn in windows
	// the Newer/Classic switch, its own leaf module at the top of newer/ (made in [44g] for debt D2)
	[ 'newer', '44g', /^mode\.js$/ ],
	[ 'newer/render', '44d', /^(enemy_face|r_anim|r_newerskins|r_weapons|r_weaponstyle|r_weapon_surface|r_axepose|r_axecorpses|r_bisect|shadow_pose|r_classicstate|r_levelview|r_levelents|r_levelgraph|r_shells|r_shelltrace)\.js$/ ],
	[ 'newer/render', '44e', /^(r_\w+|powervision_shaders|vision_coordinates|fx_math|v_shamblersteps)\.js$/ ]
];
// rules match a module's name (its folder ignored), so a module already moved into its folder is classified the same; an
// adapter left at an old path is not a module of its own (measured through, never moved)
const adapters = g.adapters || {};
const map = {};
for ( const f of g.src ) {

	if ( adapters[ f ] ) continue;
	const inner = f.replace( /^src\//, '' ), name = inner.startsWith( 'rend_veil/' ) || inner.includes( '/rend_veil/' ) ? 'rend_veil/' + inner.split( '/' ).pop() : inner.split( '/' ).pop();
	const rule = RULES.find( ( [ , , re ] ) => re.test( name ) );
	map[ f ] = rule ? { folder: rule[ 0 ], increment: rule[ 1 ], path: 'src/' + rule[ 0 ] + '/' + name.split( '/' ).pop() } : null;

}
const unassigned = Object.entries( map ).filter( ( [ , v ] ) => v === null ).map( ( [ k ] ) => k );
const top = f => map[ f ].folder.split( '/' ).slice( 0, 2 ).join( '/' ).replace( /^platform\/.*$/, 'platform' );
const engine = f => map[ f ]?.folder.startsWith( 'engine/' ), newer = f => map[ f ]?.folder.startsWith( 'newer/' );

const sizes = {};
for ( const f of g.src.filter( f => map[ f ] ) ) { const k = top( f ); sizes[ k ] ??= { modules: 0, lines: 0 }; sizes[ k ].modules ++; sizes[ k ].lines += g.lines[ f ]; }
// evaluation edges, an adapter replaced by the module it re-exports
const through = f => adapters[ f ] ?? f;
const evaluation = g.edges.filter( e => e.kinds.some( k => k === 'static' || k === 'export' ) ).map( e => ( { ...e, from: through( e.from ), to: through( e.to ) } ) ).filter( e => map[ e.from ] && map[ e.to ] && e.from !== e.to );
const matrix = {};
for ( const e of evaluation ) { const a = top( e.from ), b = top( e.to ); if ( a === b ) continue; const k = a + ' -> ' + b; matrix[ k ] ??= { pairs: 0, statements: 0 }; matrix[ k ].pairs ++; matrix[ k ].statements += e.statements; }
const engineToNewer = {}, platformToNewer = {};
const platform = f => map[ f ]?.folder === 'platform';
for ( const e of evaluation ) if ( engine( e.from ) && newer( e.to ) ) ( engineToNewer[ e.from ] ??= [] ).push( e.to );
for ( const e of evaluation ) if ( platform( e.from ) && newer( e.to ) ) ( platformToNewer[ e.from ] ??= [] ).push( e.to );

// the cycles: of the engine alone, the engine with the platform, and all modules without the engine -> Newer imports
function scc( nodes, keep ) {

	const set = new Set( nodes ), adj = new Map( nodes.map( n => [ n, [] ] ) );
	for ( const e of evaluation ) if ( set.has( e.from ) && set.has( e.to ) && keep( e ) ) adj.get( e.from ).push( e.to );
	let i = 0; const idx = new Map(), low = new Map(), on = new Set(), st = [], out = [];
	const visit = v => { idx.set( v, i ); low.set( v, i ); i ++; st.push( v ); on.add( v ); for ( const w of adj.get( v ) ) { if ( ! idx.has( w ) ) { visit( w ); low.set( v, Math.min( low.get( v ), low.get( w ) ) ); } else if ( on.has( w ) ) low.set( v, Math.min( low.get( v ), idx.get( w ) ) ); } if ( low.get( v ) === idx.get( v ) ) { const c = []; let w; do { w = st.pop(); on.delete( w ); c.push( w ); } while ( w !== v ); if ( c.length > 1 ) out.push( c.sort() ); } };
	for ( const v of nodes ) if ( ! idx.has( v ) ) visit( v );
	return out.sort( ( a, b ) => b.length - a.length );

}
const all = g.src.filter( f => map[ f ] );
const cyclesNow = scc( all, () => true );
const engineAlone = scc( all.filter( engine ), () => true );
const engineAndPlatform = scc( all.filter( f => engine( f ) || top( f ) === 'platform' ), () => true );
const withoutEngineToNewer = scc( all, e => ! ( engine( e.from ) && newer( e.to ) ) );
// the native side (engine and platform) importing Newer removed: what is left is the native cycle and Newer's own
const withoutNativeToNewer = scc( all, e => ! ( ( engine( e.from ) || platform( e.from ) ) && newer( e.to ) ) );
// D1a's check: engine (and platform) cycles that span more than one folder; D1c's: cycles holding a Newer module once the
// native side no longer imports Newer
const crossFolder = engineAndPlatform.filter( c => new Set( c.map( f => map[ f ].folder ) ).size > 1 );
const newerCycles = withoutNativeToNewer.filter( c => c.some( newer ) );
const increments = {};
for ( const f of all ) ( increments[ map[ f ].increment ] ??= [] ).push( f );

const out = { map, unassigned, adapters, sizes, matrix, engineToNewer, platformToNewer, cycles: { now: cyclesNow, engineAlone, engineAndPlatform, withoutEngineToNewer, withoutNativeToNewer, crossFolder, newerCycles }, increments };
fs.writeFileSync( process.argv[ 3 ], JSON.stringify( out, null, 1 ) );
const e2n = Object.values( engineToNewer ), statements = evaluation.filter( e => engine( e.from ) && newer( e.to ) ).reduce( ( a, e ) => a + e.statements, 0 );
console.log( `modules ${ all.length } (adapters ${ Object.keys( adapters ).length }); cycles now ${ cyclesNow.map( c => c.length ) }; engine alone ${ engineAlone.map( c => c.length ) }; engine+platform ${ engineAndPlatform.map( c => c.length ) }; without engine->Newer ${ withoutEngineToNewer.map( c => c.length ) }; without engine/platform->Newer ${ withoutNativeToNewer.map( c => c.length ) }` );
console.log( `D1a cross-folder engine cycles: ${ crossFolder.map( c => c.length ) || 'none' }; D1c Newer cycles: ${ newerCycles.map( c => c.length ) || 'none' }` );
console.log( `platform -> Newer: ${ Object.values( platformToNewer ).flat().length } pairs (${ Object.entries( platformToNewer ).map( ( [ k, v ] ) => k + ' -> ' + v.join( ',' ) ).join( '; ' ) })` );
console.log( `engine -> Newer: ${ Object.keys( engineToNewer ).length } engine modules, ${ e2n.flat().length } distinct pairs, ${ statements } statements` );
if ( unassigned.length ) { console.error( 'unassigned: ' + unassigned.join( ' ' ) ); process.exit( 1 ); }
