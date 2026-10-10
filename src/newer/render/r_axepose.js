/**
 * @module newer/render/r_axepose
 *
 * The axe's cutting edge and its movement, from the held model's animation.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; 1 module-level collection (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// The native cutting edge is vertices82–83 in the axe-head component82–97.
// Use the impact edge and its movement from the preceding animation pose.
// This approximates the instantaneous swept blade plane; QC owns hit detection.
import { CRC_Init, CRC_ProcessByte, CRC_Value } from '../../engine/common/crc.js';
import { AngleVectors } from '../../engine/common/mathlib.js';
const cache=new WeakMap();
export function R_AxeSwingNormal(bytes,frame,angles){
	if(!bytes)return null;
	let entries=cache.get(bytes.buffer);if(!entries){entries=new Map();cache.set(bytes.buffer,entries);}
	const identity=bytes.byteOffset+':'+bytes.byteLength;
	let poses=entries.get(identity);
	if(poses===undefined){
		const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);poses=null;
		let crc=CRC_Init();for(const b of bytes)crc=CRC_ProcessByte(crc,b);
		if(CRC_Value(crc)===43804&&bytes.length>=84&&view.getInt32(4,true)===6&&view.getInt32(60,true)===98&&view.getInt32(64,true)===184&&view.getInt32(68,true)===9){
			const scale=[8,12,16].map(o=>view.getFloat32(o,true)),origin=[20,24,28].map(o=>view.getFloat32(o,true));
			let off=84,valid=true;
			for(let i=0;i<view.getInt32(48,true);i++){if(view.getInt32(off,true)!==0){valid=false;break;}off+=4+view.getInt32(52,true)*view.getInt32(56,true);}
			off+=98*12+184*16;
			if(valid){poses=[];for(let i=0;i<9;i++){if(off+28+98*4>bytes.length||view.getInt32(off,true)!==0){poses=null;break;}poses.push([82,83].map(vertex=>[0,1,2].map(k=>bytes[off+28+vertex*4+k]*scale[k]+origin[k])));off+=28+98*4;}}
		}
		entries.set(identity,poses);
	}
	if(!poses)return null;
	const at=frame>=5?7:3,before=at-1,a=poses[at],b=poses[before];
	const edge=a[1].map((v,k)=>v-a[0][k]),motion=a[0].map((v,k)=>(v+a[1][k]-b[0][k]-b[1][k])/2);
	const n=[edge[1]*motion[2]-edge[2]*motion[1],edge[2]*motion[0]-edge[0]*motion[2],edge[0]*motion[1]-edge[1]*motion[0]];
	const length=Math.hypot(...n);if(length<1e-6)return null;
	const forward=[],right=[],up=[];AngleVectors(angles,forward,right,up);
	return [0,1,2].map(k=>(n[0]*forward[k]-n[1]*right[k]+n[2]*up[k])/length);
}
