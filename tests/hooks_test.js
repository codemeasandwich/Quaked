// The engine's hooks into Newer Game (src/engine/common/hooks.js, card [44g], baseline debt D1b): no module in
// src/engine or src/platform imports src/newer; src/newer/install.js (loaded by the harness, as by the page) fills every
// hook with the Newer module's own export, once; and Hooks_Install refuses a table that lacks a hook or names one the
// list does not declare.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as hooks from '../src/engine/common/hooks.js';
import * as fireball from '../src/newer/render/r_fireball.js';
import { R_BestiaryInputLocked } from '../src/newer/ui/r_bestiary.js';

const root = fileURLToPath( new URL( '..', import.meta.url ) );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const walk = d => readdirSync( d ).flatMap( n => { const p = join( d, n ); return statSync( p ).isDirectory() ? walk( p ) : /\.js$/.test( n ) ? [ p ] : []; } );

Deno.test( 'no engine or platform module imports Newer, statically or dynamically', () => {

	const offenders = [];
	for ( const f of [ ...walk( join( root, 'src/engine' ) ), ...walk( join( root, 'src/platform' ) ) ] ) {

		const src = readFileSync( f, 'utf8' );
		for ( const m of src.matchAll( /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](\.[^'"]+)['"]/gm ) )
			if ( relative( root, resolve( dirname( f ), m[ 1 ] ) ).startsWith( 'src/newer/' ) ) offenders.push( relative( root, f ) + ' -> ' + m[ 1 ] );

	}
	check( offenders.length === 0, 'imports of Newer: ' + offenders.join( '; ' ) );

} );

Deno.test( 'installed: every hook is Newer\'s own export, no function hook is still its stub', () => {

	check( hooks.Hooks_Installed() === true, 'the harness installed Newer' );
	check( hooks.R_BestiaryInputLocked === R_BestiaryInputLocked, 'a function hook is the Newer function itself' );
	for ( const n of Object.keys( fireball ) ) if ( n in hooks ) check( hooks[ n ] === fireball[ n ], `${n} is r_fireball's export` );
	// a stub is the inner function of Hooks_Missing, whose text carries its message
	const stub = f => typeof f === 'function' && /called before Newer was installed/.test( String( f ) );
	const unset = Object.keys( hooks ).filter( n => ! /^Hooks_/.test( n ) && ( hooks[ n ] === undefined || stub( hooks[ n ] ) ) );
	check( unset.length === 0, 'hooks not installed: ' + unset.join( ', ' ) );

} );

Deno.test( 'Hooks_Install refuses a table with a hook missing or an unknown name, and changes nothing', () => {

	const before = hooks.R_BestiaryInputLocked;
	let error = null;
	try { hooks.Hooks_Install( { R_BestiaryInputLocked: () => true } ); } catch ( e ) { error = e; }
	check( error && /^Hooks_Install: missing \S/.test( error.message ) && ! /missing [^;]*R_BestiaryInputLocked/.test( error.message ), 'a partial table is refused, naming what is missing (not what it gave)' );
	error = null;
	const full = Object.fromEntries( Object.keys( hooks ).filter( n => ! /^Hooks_/.test( n ) ).map( n => [ n, hooks[ n ] ] ) );
	try { hooks.Hooks_Install( { ...full, R_NotAHook: 1 } ); } catch ( e ) { error = e; }
	check( error && /unknown R_NotAHook/.test( error.message ), 'an unknown name is refused' );
	check( hooks.R_BestiaryInputLocked === before, 'a refused table changes no hook' );

} );
