/** ZIP is download transport only: Finder presents Quaked.app as one launchable item.
 * ditto preserves the app bundle's permissions, symlinks and macOS metadata.
 * The pre-commit gate builds the app; CI also checks this downloadable archive.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
if(process.platform!=='darwin')throw Error('Mac application archives must be prepared on macOS');
const RELEASE_PACK_BASE=`https://github.com/${process.env.GITHUB_REPOSITORY??'codemeasandwich/Quaked'}/releases/download/data/`;
const root=process.cwd();
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const target=resolve(process.env.CARGO_TARGET_DIR??'src-tauri/target');
const app=join(target,'universal-apple-darwin/release/bundle/macos/Quaked.app');
const executable=join(app,'Contents/MacOS/quaked');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8'}).trim();
if(run('/usr/bin/plutil',['-extract','CFBundleShortVersionString','raw','-o','-',join(app,'Contents/Info.plist')])!==version)throw Error('Built application version does not match package.json');
const inventoryPath=resolve(process.env.QUAKED_NATIVE_INVENTORY??'dist/desktop/inventory.json');
const inventoryBytes=await readFile(inventoryPath),inventory=JSON.parse(inventoryBytes);
if(inventory.profile!=='desktop'||inventory.version!==version)throw Error('Native inventory profile/version mismatch');
if(process.env.RELEASE_COMMIT&&(inventory.sourceCommit!==process.env.RELEASE_COMMIT||inventory.source!==process.env.RELEASE_COMMIT||inventory.sourceKind!=='working-tree-based-on-commit'))throw Error('Native archive does not identify the selected release commit');
const html=await readFile(join(dirname(inventoryPath),'index.html'),'utf8');
const manifest=JSON.parse(html.match(/<script id="quaked-assets" type="application\/json">([\s\S]*?)<\/script>/)?.[1]??'null');
if(manifest?.profile!=='desktop')throw Error('Native asset manifest missing');
// the uploader's receipt (tools/distribution/upload-packs.mjs): every part this app downloads must be confirmed in it
const receiptParts=await readFile('dist/packs-receipt.json','utf8').then(text=>{const r=JSON.parse(text);if(r.base!==RELEASE_PACK_BASE)throw Error('The upload receipt is for '+r.base);return new Map(r.parts.filter(p=>p.state==='uploaded').map(p=>[p.file,p.sha256]));}).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
if(receiptParts&&manifest.packBase===RELEASE_PACK_BASE)for(const [pack,{parts=[]}] of Object.entries(manifest.packs??{}))if(pack!=='core')for(const part of parts)if(receiptParts.get(part.file)!==part.sha256)throw Error('The upload receipt does not confirm '+part.file);
const hashFile=async path=>{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');};
for(const row of inventory.files){
 const entry=manifest.files[row.path];
 if(!entry)throw Error('Native manifest missing '+row.path);
 // An app downloads its packs only from the `data` release (owner approval, 13 October 2026), which CI fills before
 // it builds the app (tools/distribution/upload-packs.mjs); one downloading from anywhere else (a local stand-in) is
 // for trials only (docs/per-game-packs-design-2026-10-13.md).
 if(entry.pack&&manifest.packBase!==RELEASE_PACK_BASE&&!process.env.QUAKED_ARCHIVE_DOWNLOADING_APP)throw Error('This app downloads '+row.path+' from '+manifest.packBase+', not the data release; release archives download only from '+RELEASE_PACK_BASE);
 if(entry.pack&&manifest.packBase===RELEASE_PACK_BASE&&!process.env.QUAKED_ARCHIVE_DOWNLOADING_APP&&!receiptParts?.size)throw Error('This app downloads from the data release, but no upload receipt (dist/packs-receipt.json) confirms its parts are there');
 if(entry.external){
  if(!/^q\d+(?:\.[a-z0-9]+)?$/i.test(entry.id))throw Error('Invalid packaged asset ID');
  if(await hashFile(join(app,'Contents/Resources/assets',entry.id))!==row.sha256)throw Error('Packaged asset mismatch: '+row.path);
 }
}
run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
run('/usr/bin/lipo',[executable,'-verify_arch','arm64','x86_64']);
const output=resolve('dist/release');await mkdir(output,{recursive:true});
const name=`Quaked_${version}_universal.zip`,archive=join(output,name);
// ditto replaces this generated archive; it never changes the built application.
run('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',app,archive]);
run('/usr/bin/unzip',['-tq',archive]);
const receipt={version,sourceCommit:inventory.sourceCommit??null,archive:name,packBase:manifest.packBase??null,downloadsPacks:Object.values(manifest.files).some(entry=>entry.pack),bytes:(await stat(archive)).size,sha256:await hashFile(archive),
 inventorySource:inventory.source,inventorySourceKind:inventory.sourceKind,
 inventorySha256:createHash('sha256').update(inventoryBytes).digest('hex'),executableSha256:await hashFile(executable),
 architectures:['arm64','x86_64'],signature:'ad-hoc; no Developer ID or notarization',
 verification:'codesign --verify --deep --strict; lipo -verify_arch; unzip -tq',
 downloadedGatekeeperTrial:false};
await writeFile(join(output,'mac-archive.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
