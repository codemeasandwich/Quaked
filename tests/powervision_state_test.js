import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PowerVisionMode, PowerVisionHistory } from '../src/newer/gameplay/powervision_state.js';
import { PowerVisionAdapt } from '../src/r_powervision.js';
import * as shaders from '../src/powervision_shaders.js';
import { IT_INVISIBILITY, IT_INVULNERABILITY, STAT_HEALTH } from '../src/engine/common/quakedef.js';

Deno.test('vision uses authoritative bits and clears on expiry, death and Classic', () => {
	const client={items:0,stats:[]}; client.stats[STAT_HEALTH]=100;
	assert.equal(PowerVisionMode(client,true),0);
	client.items=IT_INVULNERABILITY; assert.equal(PowerVisionMode(client,true),2);
	client.items|=IT_INVISIBILITY; assert.equal(PowerVisionMode(client,true),1);
	client.items&=~IT_INVISIBILITY; assert.equal(PowerVisionMode(client,true),2);
	assert.equal(PowerVisionMode(client,false),0);
	client.stats[STAT_HEALTH]=0; assert.equal(PowerVisionMode(client,true),0);
	client.stats[STAT_HEALTH]=100; client.items=0; assert.equal(PowerVisionMode(client,true),0);
});

Deno.test('history rejects mode/map/size changes, time reversal and camera cuts', () => {
	const frame={mode:1,world:{},view:1,width:640,height:480,time:10,origin:[0,0,0],forward:[1,0,0]};
	assert.equal(PowerVisionHistory(frame,{...frame,time:10.016}),true);
	assert.equal(PowerVisionHistory(frame,{...frame,time:10}),true);
	for (const change of [{mode:2},{world:{}},{view:2},{width:320},{time:9},{time:11},{origin:[100,0,0]},{forward:[-1,0,0]}])
		assert.equal(PowerVisionHistory(frame,{...frame,...change}),false,JSON.stringify(change));
});

Deno.test('donor shader bodies remain exact and ABI helpers precede their callers', () => {
	const source=readFileSync('demon-vision.html','utf8');
	for(const [name,body] of Object.entries(shaders)) {
		assert.equal(body,new RegExp('const '+name+' = `([\\s\\S]*?)`;').exec(source)[1]);
		if(name==='FULLSCREEN_VERTEX')continue;
		const adapted=PowerVisionAdapt(body);
		assert.ok(!adapted.includes('texture(tMask,'));
		assert.ok(adapted.indexOf('vec4 visionDepthPacket')<adapted.indexOf('void main()'));
		assert.ok(adapted.includes('tag>.063 && tag<.067'));
	}
});
