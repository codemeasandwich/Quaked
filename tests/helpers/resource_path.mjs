/** Filesystem boundary for tests of stable logical resource identifiers.
 * Runtime identifiers and immutable provenance stay unchanged; only local file
 * access resolves through the product's canonical asset layout.
 */
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {assetPath} from '../../tools/distribution/manifest.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function resourcePath(path){
 if(typeof path==='number'||!(typeof path==='string'||path instanceof URL||Buffer.isBuffer(path)))return path;
 if(path instanceof URL&&path.protocol!=='file:')return path;
 const full=resolve(path instanceof URL?fileURLToPath(path):String(path)),logical=relative(root,full);
 if(logical==='..'||logical.startsWith('../')||isAbsolute(logical))return path;
 return assetPath(root,logical.replaceAll('\\','/'));
}

/** Git trees preceding the physical migration retain their original filenames.
 * This selects names inside a Git object only; filesystem reads always use the
 * sole canonical asset tree and never fall back to legacy source directories.
 */
export function resourceGitPath(path,ref='HEAD'){
 const physical=relative(root,assetPath(root,path)).replaceAll('\\','/');
 try{execFileSync('git',['cat-file','-e',ref+':'+physical],{cwd:root,stdio:'ignore'});return physical;}
 catch{return path;}
}
