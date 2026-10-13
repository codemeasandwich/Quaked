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
const html=await readFile(join(dirname(inventoryPath),'index.html'),'utf8');
const manifest=JSON.parse(html.match(/<script id="quaked-assets" type="application\/json">([\s\S]*?)<\/script>/)?.[1]??'null');
if(manifest?.profile!=='desktop')throw Error('Native asset manifest missing');
const hashFile=async path=>{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');};
for(const row of inventory.files){
 const entry=manifest.files[row.path];
 if(!entry)throw Error('Native manifest missing '+row.path);
 // Without a pack host the app must bundle every pack (docs/per-game-packs-design-2026-10-13.md); a
 // downloading build is only for trials until the owner approves the `data` release.
 if(entry.pack&&!process.env.QUAKED_ARCHIVE_DOWNLOADING_APP)throw Error('This app downloads '+row.path+' from '+manifest.packBase+'; release archives bundle every pack');
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
const receipt={version,archive:name,bytes:(await stat(archive)).size,sha256:await hashFile(archive),
 inventorySource:inventory.source,inventorySourceKind:inventory.sourceKind,
 inventorySha256:createHash('sha256').update(inventoryBytes).digest('hex'),executableSha256:await hashFile(executable),
 architectures:['arm64','x86_64'],signature:'ad-hoc; no Developer ID or notarization',
 verification:'codesign --verify --deep --strict; lipo -verify_arch; unzip -tq',
 downloadedGatekeeperTrial:false};
await writeFile(join(output,'mac-archive.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
