// Validate the complete reviewed v4.4 schema before replacing native HUD art.
export function validatePlayerFaceManifest(m) {
	const fail=()=>{throw new Error('invalid v4.4.0 face manifest');};
	if(!m || m.version!=='4.4.0' || m.cell_size!==96 || m.sampling!=='nearest' ||
		m.assets?.length!==285 || m.poses?.length!==25 || m.health?.levels!==10 ||
		Object.keys(m.source_images||{}).length!==271 || m.eye_state_control?.preview_blink_ms!==150 ||
		m.water?.frames?.length!==10 || m.water?.default_body_opacity!==50)fail();
	if(m.health.stages?.length!==10 || m.health.stages.some(s=>!s||!Number.isFinite(s.default_percent)||typeof s.label!=='string') ||
		['open','blink','dead'].some(k=>!m.eye_states?.[k]||typeof m.eye_states[k]!=='object') ||
		['purple','yellow','mixed'].some(k=>!m.power_modes?.[k]||typeof m.power_modes[k]!=='object'))fail();
	const assets=new Map(m.assets.map(a=>[a.id,a])),poses=new Map(m.poses.map(p=>[p.id,p]));
	if(assets.size!==285 || poses.size!==25)fail();
	for(const expression of ['normal','focused_determined','mischievous_excited','pain','shocked'])
		for(const look of ['head_left','eyes_left','front','eyes_right','head_right']){
			const p=poses.get(expression+'_'+look),head=look==='head_left'?'left':look==='head_right'?'right':'front';
			if(!p||p.expression!==expression||p.look!==look||p.head_direction!==head)fail();
		}
	const visit=(node,chain=[])=>{
		if(node==null)return;
		if(typeof node==='string'){
			if(!assets.has(node)||chain.includes(node))fail();
			return visit(assets.get(node),[...chain,node]);
		}
		if(typeof node!=='object'||node.unavailable)fail();
		if(node.asset)visit(node.asset,chain);
		else if(node.parts){if(!Array.isArray(node.parts)||!node.parts.length)fail();node.parts.forEach(p=>visit(p,chain));}
		else {
			const source=m.source_images[node.source],r=node.source_rect;
			if(!source || !Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>source.width+.001||r[1]+r[3]>source.height+.001)fail();
		}
	};
	for(const a of m.assets){if(a.available!==true)fail();visit(a.id);}
	for(const p of m.poses){
		if(!['left','front','right'].includes(p.head_direction)||p.blood_layers?.length!==9||!p.base_asset||!p.mask_asset||p.blood_layers.some(n=>!n)||['purple','yellow','mixed'].some(k=>!p.eye_layers?.[k]))fail();
		for(const n of [p.base_asset,p.expression_asset,p.gaze_asset,p.mask_asset,...p.blood_layers,
			...['purple','yellow','mixed'].map(k=>p.eye_layers?.[k]),...['blink','dead'].map(k=>p.closure_layers?.[k]),p.equipment_layers?.diving_suit])visit(n);
		if(!p.closure_layers?.blink||!p.closure_layers?.dead||!p.equipment_layers?.diving_suit)fail();
	}
	for(let i=0;i<10;i++){if(m.water.frames[i].stage!==i+1||!m.water.frames[i].asset)fail();visit(m.water.frames[i].asset);}
	for(const type of ['helmet','diving'])for(const direction of ['left','front','right']){
		const t=m.water.targets?.[type+'_'+direction];if(!t||!t.mask_asset||t.rect?.length!==4||!t.rect.every(Number.isFinite)||t.rect[2]<=0||t.rect[3]<=0)fail();visit(t.mask_asset);
	}
	return m;
}
