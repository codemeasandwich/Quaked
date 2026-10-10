// In the Ring's Unseen World (Newer Game) the held gun is drawn and rendered as the enemies are (owner request, 9 Oct 2026):
// R_DrawViewModel no longer hides it there, it is tagged an enemy subject, and the Unseen pass no longer passes it through
// untouched (the history pass still keeps it out of the trails). Classic and Demon vision keep their behaviour.
await import( '../src/engine/render/gl_rsurf.js' );
import { readFileSync } from 'node:fs';
const skins = await import( '../src/newer/render/r_newerskins.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const read = f => readFileSync( new URL( '../src/' + f, import.meta.url ), 'utf8' );

Deno.test( 'the gun is drawn and tagged a subject only in the Unseen World', () => {
	const main = read( 'engine/render/gl_rmain.js' ); // (moved in [44d]; the old path is a one-line adapter)
	check( /const unseenWorld = R_NewerGame\(\) && PowerVisionMode\( cl, R_PostActive\(\) \) === 1;/.test( main ), 'the Unseen World is Newer Game with the Ring vision on' );
	check( /R_HeldVisionTag\.value = unseenWorld \? \.065 : \.08;/.test( main ), 'the gun is an enemy subject (.065) there, a held coat (.08) otherwise' );
	check( /if \( \( cl\.items & 524288 \) && ! unseenWorld \) \/\/ IT_INVISIBILITY\s*return;/.test( main ), 'the Ring still hides the gun outside the Unseen World (Classic)' );
	check( skins.R_HeldVisionTag.value === .08, 'default .08' );
} );

Deno.test( 'the Unseen pass renders the gun; the history pass and Demon vision keep it as it is', () => {
	const vision = read( 'newer/render/r_powervision.js' ); // (moved in [44e])
	check( /u\.uProtectViewmodel\.value=mode===1\?0:1;\s*render\(p\.materials\[mode===1\?0:2\],p\.current\);\s*u\.uProtectViewmodel\.value=1;/.test( vision ), 'unprotected only for the Unseen pass, protected again before the history pass' );
} );
