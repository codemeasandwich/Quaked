// The proposed subsystem folder of each src module (card [44a]), from tools/architecture_graph.mjs's output.
// Usage: node tools/architecture_classify.mjs <graph.json> <map.json>
import fs from 'node:fs';
const g = JSON.parse( fs.readFileSync( process.argv[ 2 ], 'utf8' ) );
const RULES = [
	[ 'engine/common', /^(common|cmd|cvar|zone|sys|crc|mathlib|quakedef|console|wad|pak|bspfile|anorm_dots|protocol)$/ ],
	[ 'engine/progs', /^(pr_cmds|pr_comp|pr_edict|pr_exec|progs|progdefs)$/ ],
	[ 'engine/server', /^(sv_main|sv_move|sv_phys|sv_user|server|world|pmove|host|host_cmd)$/ ],
	[ 'engine/net', /^net(_.*)?$/ ],
	[ 'engine/client', /^(cl_.*|client|chase|view|keys|sbar|screen|cd_audio|menu)$/ ],
	[ 'engine/sound', /^(snd_.*|sound)$/ ],
	[ 'engine/render', /^(gl_.*|glquake|render|vid|r_part|lit)$/ ],
	[ 'platform', /^(webxr|touch|touch_layout|in_web)$/ ],
	[ 'newer/gameplay', /^(sv_.*|respawn_.*|rend_veil_state|axe_record|shotgun_flight|v_shamblersteps|bestiary_state|face_state|powervision_state)$/ ],
	[ 'newer/sound', /^s_.*$/ ],
	[ 'newer/ui', /^(menu_webgl.*|menu_art|studio_logo|loading_.*|r_newerhud|r_playerface|playerface_manifest|r_bestiary_book|r_bestiary|bestiary_art|newer_defaults|r_facegame)$/ ],
	[ 'newer/assets', /(_bake_format|_bakes|_bundle|_prepare|_transport|_startup_packs|_worker|_presets|_store|_manifest|^prepared_.*|^startup_.*|^alias_mesh_.*|^rockfield|^normal_|^r_normalprefetch|^r_rockbakes|^r_demonbakes|^r_aliasmeshcache)/ ],
	[ 'newer/render', /^(r_.*|powervision_shaders|vision_coordinates|shadow_pose|fx_math)$/ ]
];
const mods = Object.keys( g.lines ).map( f => f.replace( /^src\//, '' ) ).filter( f => ! f.includes( '/' ) ).map( f => f.replace( /\.js$/, '' ) );
const map = {};
for ( const m of mods ) { const r = RULES.find( ( [ , re ] ) => re.test( m ) ); map[ 'src/' + m + '.js' ] = r ? 'src/' + r[ 0 ] + '/' + m + '.js' : 'UNASSIGNED'; }
const by = {}; for ( const [ f, t ] of Object.entries( map ) ) { const k = t === 'UNASSIGNED' ? t : t.split( '/' ).slice( 1, 3 ).join( '/' ); ( by[ k ] ??= [] ).push( f.replace( 'src/', '' ).replace( '.js', '' ) ); }
// cross-subsystem edges
const sub = f => ( map[ f ] || 'other' ).split( '/' ).slice( 1, 3 ).join( '/' );
const cross = {}; const graphEdges = JSON.parse( fs.readFileSync( process.argv[ 2 ], 'utf8' ) );
fs.writeFileSync( process.argv[ 3 ], JSON.stringify( { map, bySubsystem: by }, null, 1 ) );
for ( const [ k, v ] of Object.entries( by ) ) console.log( k.padEnd( 16 ), String( v.length ).padStart( 3 ), Object.keys( g.lines ).filter( f => v.includes( f.replace( 'src/', '' ).replace( '.js', '' ) ) ).reduce( ( a, f ) => a + g.lines[ f ], 0 ), 'lines' );
console.log( 'subdirs in src:', Object.keys( g.lines ).filter( f => f.split( '/' ).length > 2 ).join( ' ' ) );
