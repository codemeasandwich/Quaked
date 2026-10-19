import {register} from 'node:module';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root='/Users/bri/SOURCE/Quaked';
const output=await mkdtemp('/private/tmp/quaked-native-id-contract-review-');
const sourcePath=root+'/src-tauri/src/library.rs';
const original=await readFile(sourcePath,'utf8');
const suitePath=root+'/tests/game_selection_test.js';
const suite=await readFile(suitePath,'utf8');
const registrations=[];
let activePath=sourcePath;
globalThis.Deno={
 test:(name,fn)=>registrations.push({name,fn}),
 readTextFile:path=>readFile(fileURLToPath(path)===sourcePath?activePath:path,'utf8'),
 readFile:path=>readFile(path),
};
register('data:text/javascript,'+encodeURIComponent(`let three;export function initialize(data){three=data.three;}export function resolve(specifier,context,next){return specifier==='three'?{url:three,shortCircuit:true}:next(specifier,context);}`),{data:{three:pathToFileURL(root+'/node_modules/three/build/three.module.js').href}});
await import(pathToFileURL(root+'/src/engine/render/gl_rsurf.js').href);
await import(pathToFileURL(root+'/src/newer/install.js').href);
await import(pathToFileURL(suitePath).href);
const test=registrations.find(t=>t.name==="the app library gives loose files to exactly the catalogue's add-ons");
if(!test)throw Error('Maintained public contract callback not found');
const table=/pub const GAMES:[^=]+?=\s*&\[([\s\S]*?)\n\];/.exec(original);
if(!table)throw Error('Native GAMES table missing before mutation');
const row=/^\s*\("quake", &\[[^\n]*\]\),\n/m.exec(table[0]);
if(!row)throw Error('Concrete quake row absent before mutation');
const cases=[
 ['baseline',original,true],
 ['unrelated-face-tuple',original+'\n// Independent shelf table:\nconst REVIEW_FACES: &[(&str, &[&str])] = &[("review_face", &["front"])];\n',true],
 ['insert-game-id',original.replace(table[0],table[0].replace('= &[','= &[\n    ("review_unexpected", &["review_unexpected"]),')),false],
 ['remove-game-id',original.replace(table[0],table[0].replace(row[0],'')),false],
 ['duplicate-game-id',original.replace(table[0],table[0].replace(row[0],row[0]+row[0])),false],
 ['remove-games-table',original.replace(table[0],''),false],
];
const results=[];
for(const [name,text,expectedPass] of cases){
 activePath=output+'/'+name+'.rs';await writeFile(activePath,text,{flag:'wx'});
 let passed=true,error=null;
 try{await test.fn();}catch(e){passed=false;error=e.message;}
 results.push({name,expectedPass,passed,correct:passed===expectedPass,error});
}
const receipt={sourcePath,suitePath,sourceSha256:createHash('sha256').update(original).digest('hex'),suiteSha256:createHash('sha256').update(suite).digest('hex'),method:'Unmodified maintained public callback; only Deno.readTextFile supplied temporary Rust source mutations. No repository writes.',results};
await writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,...receipt},null,2));
if(results.some(r=>!r.correct))process.exitCode=1;
