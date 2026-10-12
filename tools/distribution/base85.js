/** Four bytes in five HTML-safe ASCII characters (25% overhead versus base64's
 * 33%). '<' is excluded so arbitrary payloads cannot enter HTML script states.
 * The original length is explicit; no padding or asset bytes are inferred.
 */
const alphabet=Array.from({length:94},(_,i)=>String.fromCharCode(33+i)).filter(c=>!'<>&"\'`\\/?'.includes(c)).join('');
const codes=Uint8Array.from(alphabet,c=>c.charCodeAt(0));
const values=new Int16Array(128).fill(-1);for(let i=0;i<85;i++)values[codes[i]]=i;
export function encode85(bytes){
 const out=new Uint8Array(Math.ceil(bytes.length/4)*5);
 for(let i=0,j=0;i<bytes.length;i+=4,j+=5){
  let n=(bytes[i]*16777216)+(bytes[i+1]??0)*65536+(bytes[i+2]??0)*256+(bytes[i+3]??0);
  for(let k=4;k>=0;k--){out[j+k]=codes[n%85];n=Math.floor(n/85);}
 }
 return new TextDecoder().decode(out);
}
export function decode85(text,length){
 if(!Number.isSafeInteger(length)||length<0||text.length!==Math.ceil(length/4)*5)throw Error('Invalid embedded asset length');
 const out=new Uint8Array(length);
 for(let i=0,j=0;i<text.length;i+=5,j+=4){
  let n=0;for(let k=0;k<5;k++){const code=text.charCodeAt(i+k),v=code<128?values[code]:-1;if(v<0)throw Error('Invalid embedded asset character');n=n*85+v;}
  if(n>4294967295)throw Error('Invalid embedded asset word');
  for(let k=3;k>=0;k--){if(j+k<length)out[j+k]=n%256;n=Math.floor(n/256);}
 }
 return out;
}
