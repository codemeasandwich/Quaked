import assert from 'node:assert/strict';
import {faceWaterStage,FaceWaterState} from '../src/newer/ui/face_state.js';
import {waterSelection} from '../src/newer/ui/r_playerface.js';

Deno.test('submersion immediately shows W1 and full visor starts at ninety percent air used',()=>{
	for(let boundary=0;boundary<=90;boundary+=10){
		const expected=Math.min(10,boundary/10+1);
		assert.equal(faceWaterStage(boundary,true),expected);
		assert.equal(waterSelection({waterPercent:boundary,waterSubmerged:true}).waterStage,expected);
		if(boundary>0)assert.equal(faceWaterStage(boundary-.001,true),expected-1);
	}
	for(const percent of[90,99,100,120])assert.equal(faceWaterStage(percent,true),10);
	assert.equal(waterSelection({waterPercent:0,waterSubmerged:false}).waterStage,0,'surface clears');
	assert.equal(waterSelection({}).waterStage,0,'unknown input cannot fabricate submersion');
	assert.equal(waterSelection({waterPercent:90}).waterStage,9,'unchanged donor-preview stage selection');
});

Deno.test('surface drain reverses one frame every fifty game milliseconds and cancels on reentry',()=>{
	const state=new FaceWaterState(),epoch={};
	const frame=(time,submerged=false,stage=1,extra={})=>state.frame({time,epoch,submerged,stage,...extra});
	assert.equal(frame(1,true,10),10);assert.equal(frame(2),10);
	assert.equal(frame(2.049),10);assert.equal(frame(2.05),9);
	assert.equal(frame(2.05),9,'pause has no visual catch-up');
	for(let i=2;i<=10;i++){
		const stage=frame(2+i*.05);assert.equal(stage,10-i);
		assert.equal(waterSelection({waterPercent:0,waterSubmerged:false,waterVisualStage:stage}).waterStage,stage);
	}
	assert.equal(frame(3,true,6),6);assert.equal(frame(4),6);
	assert.equal(frame(4.05),5);assert.equal(frame(4.06,true,1),1,'reentry follows fresh native reserve');
	assert.equal(frame(5),1);assert.equal(frame(5.05),0);
	frame(6,true,10);assert.equal(frame(7,false,0,{enabled:false}),0,'death/unknown clears');
	frame(8,true,10);assert.equal(frame(1),0,'reversed clock clears');
	frame(2,true,10);assert.equal(frame(3,false,0,{epoch:{}}),0,'new world clears');
});
