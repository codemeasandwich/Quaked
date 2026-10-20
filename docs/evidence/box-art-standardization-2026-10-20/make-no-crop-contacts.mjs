/** QA contact sheets from actual browser screenshots; contain never crops art. */
import sharp from 'sharp';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GAME_BOXES} from '../../../src/newer/ui/game_shelf.js';
const out=dirname(fileURLToPath(import.meta.url));
const ids=Object.keys(GAME_BOXES),cell={width:220,height:330};
for(const viewport of ['large','small'])for(const face of ['front','back','spine']){
 const layers=[];
 for(const [index,id]of ids.entries()){
  const left=(index%6)*cell.width,top=Math.floor(index/6)*cell.height;
  const label=Buffer.from(`<svg width="220" height="30"><rect width="220" height="30" fill="#222"/><text x="5" y="19" fill="white" font-size="11">${id} ${face}</text></svg>`);
  const image=sharp(resolve(out,`no-crop-${viewport}-${id}-${face}.jpg`));
  // All normalized boxes share exact geometry. Preserve generous margins
  // around the selected panel when extracting it from the full UI screenshot.
  if(face!=='spine')image.extract(viewport==='large'?{left:470,top:180,width:500,height:610}:{left:75,top:270,width:240,height:280});
  const input=await image.resize({width:210,height:295,fit:'contain',background:'#111'}).png().toBuffer();
  layers.push({input:label,left,top},{input,left:left+5,top:top+30});
 }
 await sharp({create:{width:cell.width*6,height:cell.height*Math.ceil(ids.length/6),channels:3,background:'#222'}}).composite(layers).png().toFile(resolve(out,`no-crop-ui-${viewport}-${face}-contact.png`));
}
