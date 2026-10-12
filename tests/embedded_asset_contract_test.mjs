import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {encode85,decode85} from '../tools/distribution/base85.js';
test('embedded binary codec preserves bytes across word boundaries and excludes HTML delimiters',()=>{
 for(const size of [0,1,2,3,4,5,255,256,257,65535,65536,65537,1024*1024]){
  const input=randomBytes(size),encoded=encode85(input),decoded=decode85(encoded,size);
  assert.equal(encoded.length,Math.ceil(size/4)*5);assert(!encoded.includes('<'));
  assert.equal(createHash('sha256').update(decoded).digest('hex'),createHash('sha256').update(input).digest('hex'));
 }
 assert.equal(encode85(new Uint8Array(4)),'!!!!!');
});
test('corrupt encoded data and impossible lengths are rejected',()=>{
 for(const [text,length]of [['<!!!!',4],['!!!!!',-1],['!!!!',4],['!!!!!',5],['~~~~~',4]])assert.throws(()=>decode85(text,length));
});
