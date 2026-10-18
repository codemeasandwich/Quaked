Deno.test('real held rock3_8 sibling remains native across all recorded PAK occurrences', () => imagesFixture(async f => {
 const metadataPath='tools/texture_sheets/sources/official-world-2026-10-12/native-rock3_8.json';
 const held=JSON.parse(read(metadataPath)), source=held.source, entry={name:source.name,source};
 same(source.key,'64x64:57663646989d1874','explicit held sibling');
 const accepted=rockReceipt.entries.find(e=>e.name==='rock3_8');check(accepted,'registered rock3_8 source');same(accepted.key,'64x64:5b26cfca296c1fa8','explicit accepted base sibling');
 check(!index.ordinaryVariants?.rock3_8?.[source.key],'held sibling has no ordinary variant');check(!index.sources?.rock3_8?.includes(source.key),'held sibling has no base guard permission');check(!index.glass?.rock3_8?.[source.key],'held sibling has no glass override');
 const nativePNG='tools/texture_sheets/sources/official-world-2026-10-12/native-rock3_8.png';same(sha256(read(nativePNG)),held.referenceSha256,'held original PNG digest');const decoded=await f.decode(nativePNG,true);
 const base=await nativeSource(accepted);
 try { for(const use of source.uses) {
  const actual=await nativeSource(entry,use), original=actual.texture.image;
  try {
   same(actual.key,source.key,'actual held source identity '+use.game+'/'+use.map);same(sha256(actual.rgba),source.pixelSha256,'actual held source pixels');bytesEqual(decoded.data,actual.rgba,'held PNG depicts actual PAK texture');
   same(actual.width,base.width,'held width');same(actual.height,base.height,'held height');let changed=0;for(let i=0;i<actual.rgba.length;i+=4)if(actual.rgba[i]!==base.rgba[i]||actual.rgba[i+1]!==base.rgba[i+1]||actual.rgba[i+2]!==base.rgba[i+2])changed++;
   same(changed,378,'real sibling differs in378 native pixels, not a fabricated single-byte mutation');
   f.api.R_NewerTextureUpgrade(source.name,actual.texture);await terminal(f.api,source.name,actual.texture);
   same(actual.texture.userData.newerFallback,true,'real sibling uses native fallback');same(actual.texture.image,original,'real sibling original image preserved');same(actual.texture.userData.newerHeight,undefined,'real sibling gets no mismatched relief');same(f.requests.length,0,'real sibling requests no replacement art');
  } finally {dispose(actual.texture);}
 }} finally {dispose(base.texture);}
 same(source.uses.length,5,'all five recorded held-source uses checked');
}));
