/**
 * @module newer/ui/bestiary_state
 *
 * The Bestiary's journal: which creatures have been discovered, kept in the browser profile.
 *
 * Types: exported classes `BestiaryJournal`, `BestiaryEncounter`.
 *
 * State: no mutable exports; 2 module-level collections (Map/Set); browser storage.
 *
 * Errors: throws at 1 place; catches at 3 places.
 *
 * Discovery is stored in localStorage (`quaked.bestiary.v1`).
 */
// Persistent discovery belongs to the browser profile, not a game/save/map.
/**
 * Whether a monster's body faces the player, a condition of its discovery (`R_BestiaryObserve`, r_bestiary.js): the
 * player must be within 89 degrees of the monster's forward axis. Alias +X uses Rz(yaw)*Ry(-pitch)*Rx(roll), so its
 * forward Z is +sin(pitch). Body orientation and native origins are independent of pose bounds/camera borrowing. The
 * tiny dot tolerance accommodates native float coordinates.
 *
 * @param {Array<number>} angles the monster's `v.angles` (pitch, yaw, roll in degrees)
 * @param {Array<number>} origin the monster's `v.origin` (world space, Quake units)
 * @param {Array<number>} playerOrigin the player's `v.origin` (world space, Quake units)
 * @returns {boolean} true when facing; false for non-finite input or coincident origins
 */
export function Bestiary_FacesPlayer(angles,origin,playerOrigin) {
 for(let i=0;i<3;i++)if(!Number.isFinite(angles?.[i])||!Number.isFinite(origin?.[i])||!Number.isFinite(playerOrigin?.[i]))return false;
 const dx=playerOrigin[0]-origin[0],dy=playerOrigin[1]-origin[1],dz=playerOrigin[2]-origin[2],distance=Math.hypot(dx,dy,dz);
 if(distance<1e-6)return false;
 // Alias +X uses Rz(yaw)*Ry(-pitch)*Rx(roll), so its forward Z is +sin(pitch).
 // Body orientation and native origins are independent of pose bounds/camera
 // borrowing. The tiny dot tolerance accommodates native float coordinates.
 const pitch=angles[0]*Math.PI/180,yaw=angles[1]*Math.PI/180,cp=Math.cos(pitch);
 return (cp*Math.cos(yaw)*dx+cp*Math.sin(yaw)*dy+Math.sin(pitch)*dz)/distance>=Math.cos(89*Math.PI/180)-1e-7;
}
export const BESTIARY_ENTRIES = Object.freeze( [
 ['dog','The Rottweiler',['monster_dog'],'rottweiler.png'],
 ['grunt','The Grunt',['monster_army'],'grunt.png'],
 ['enforcer','The Enforcer',['monster_enforcer'],'enforcer.png'],
 ['knight','The Knight',['monster_knight'],'knight.png'],
 ['death_knight','The Death Knight',['monster_hell_knight'],'death-knight.png'],
 ['rotfish','The Rotfish',['monster_fish'],'rotfish.png'],
 ['zombie','The Zombie',['monster_zombie'],'zombie.png'],
 ['scrag','The Scrag',['monster_wizard'],'scrag.png'],
 ['ogre','The Ogre',['monster_ogre','monster_ogre_marksman'],'ogre.png'],
 ['spawn','The Spawn',['monster_tarbaby'],'spawn.png'],
 ['fiend','The Fiend',['monster_demon1'],'fiend.png'],
 ['vore','The Vore',['monster_shalrath'],'vore.png'],
 ['shambler','The Shambler',['monster_shambler'],'shambler.png'],
 ['chthon','Chthon',['monster_boss'],'chthon.png'],
 ['shub','Shub-Niggurath',['monster_oldone'],'shub.png'],
 ['centroid','The Centroid',['monster_scourge'],'centroid.png',16],
 ['electric_eel','The Electric Eel',['monster_eel'],'electric-eel.png',20],
 ['phantom_swordsman','Phantom Swordsman',['monster_sword'],'phantom-swordsman.png',21],
 ['multi_grenade_ogre','Multi-Grenade Ogre',['monster_ogre'],'multi-grenade-ogre.png',22],
 ['chthon_sleeper','Chthon — The Sleeper',['monster_boss'],'chthon-sleeper.png',46],
 ['shub_awakened','Shub-Niggurath — Awakened',['monster_oldone_new'],'shub-awakened.png',47],
 ['splitting_spawn','The Splitting Spawn',['monster_tarbaby'],'splitting-spawn.png',45],
 ['infected_death_knight','The Infected Death Knight',['monster_hell_knight'],'infected-death-knight.png',44],
 ['overlord','The Overlord',['monster_super_wrath'],'overlord.png',29],
 ['infected_enforcer','The Infected Enforcer',['monster_enforcer'],'infected-enforcer.png',43],
 ['egyptian_guardian','The Egyptian Guardian',['monster_morph'],'egyptian-guardian.png',32],
 ['dragon','The Dragon',['monster_dragon'],'dragon.png',34],
 ['infected_knight','The Infected Knight',['monster_knight'],'infected-knight.png',42],
 ['infected_grunt','The Infected Grunt',['monster_army'],'infected-grunt.png',41],
 ['ranged_death_knight','The Ranged Death Knight',['monster_ranged_knight'],'ranged-death-knight.png',40],
 ['demo_dog','The Demo Dog',['monster_dog'],'demo-dog.png',37],
 ['mummy','The Mummy',['monster_mummy'],'mummy.png',28],
 ['statue_knight','The Statue Knight',['monster_knight'],'statue-knight.png',26],
 ['statue_death_knight','Statue Death Knight',['monster_hell_knight'],'statue-death-knight.png',27],
 ['rocket_ogre','The Rocket Ogre',['monster_ogre'],'rocket-ogre.png',36],
 ['gremlin','The Gremlin',['monster_gremlin'],'gremlin.png',17],
 ['blood_shambler','The Blood Shambler',['monster_super_shambler'],'blood-shambler.png',38],
 ['hell_spawn','The Hell Spawn',['monster_tarbaby'],'hell-spawn.png',23],
 ['wrath','The Wrath',['monster_wrath'],'wrath.png',24],
 ['spike_mine','The Spike Mine',['trap_spike_mine'],'spike-mine.png',18],
 ['orb','The Orb',['monster_orb'],'orb.png',39],
 ['armagon','Armagon',['monster_armagon'],'armagon.png',19],
 ['hephaestus','Hephaestus',['monster_lava_man'],'hephaestus.png',30],
 ['chthon_vengeance','Chthon — Vengeance',['monster_boss'],'chthon-vengeance.png',35],
 ['guardian','The Guardian',['monster_morph'],'guardian.png',25],
 ['quakes_guardian','Quake’s Guardian',['monster_morph'],'quakes-guardian.png',31],
 ['quakes_high_priest','Quake’s High Priest',['monster_morph'],'quakes-high-priest.png',33]
 ].map( ( [ id,title,classes,image,folio ],i ) => Object.freeze( { id,title,classes:Object.freeze(classes),image,folio:folio??i+1 } ) ) );
// The book's spreads (card [19]): a base creature on the left page and its relative on the right, families in consecutive
// spreads. Display order only: discoveries stay keyed by entry id and every entry's folio number is unchanged. null is a
// deliberate blank page (parchment): the Rocket Ogre has no fourth ogre beside it, Armagon and Chthon the Sleeper no relative
// left. The table of contents artwork (contents.png) follows the old order and is stale until the owner regenerates it.
export const BESTIARY_SPREADS = Object.freeze( [
 [ 'dog', 'demo_dog' ], [ 'grunt', 'infected_grunt' ], [ 'enforcer', 'infected_enforcer' ],
 [ 'knight', 'infected_knight' ], [ 'statue_knight', 'phantom_swordsman' ],
 [ 'death_knight', 'infected_death_knight' ], [ 'statue_death_knight', 'ranged_death_knight' ],
 [ 'ogre', 'multi_grenade_ogre' ], [ 'rocket_ogre', null ],
 [ 'zombie', 'mummy' ], [ 'rotfish', 'electric_eel' ], [ 'scrag', 'orb' ], [ 'wrath', 'overlord' ],
 [ 'spawn', 'hell_spawn' ], [ 'splitting_spawn', 'spike_mine' ], [ 'fiend', 'gremlin' ], [ 'vore', 'centroid' ],
 [ 'shambler', 'blood_shambler' ], [ 'guardian', 'egyptian_guardian' ], [ 'quakes_guardian', 'quakes_high_priest' ],
 [ 'dragon', 'hephaestus' ], [ 'armagon', null ],
 [ 'chthon', 'chthon_vengeance' ], [ 'chthon_sleeper', null ], [ 'shub', 'shub_awakened' ]
].map( pair => Object.freeze( pair.map( id => id === null ? null : BESTIARY_ENTRIES.find( e => e.id === id ) ) ) ) );
/**
 * The final mapping, for the owner's new contents page: book spread, page side, entry id, title, folio, one row per
 * page of `BESTIARY_SPREADS`.
 *
 * @returns {Array<{spread: number, side: string, id: ?string, title: ?string, folio: ?number}>} new rows; `spread`
 *   counts book spreads from 3 (the first creature spread), `side` is 'left' or 'right', and a deliberate blank page
 *   has null id, title and folio
 */
export function Bestiary_SpreadMapping() {
 return BESTIARY_SPREADS.flatMap( ( pair, i ) => pair.map( ( entry, side ) => ( { spread: i + 3, side: side ? 'right' : 'left', id: entry?.id ?? null, title: entry?.title ?? null, folio: entry?.folio ?? null } ) ) );
}

// Rogue reuses Ogre's classname. Do not attribute a base-game Ogre to the
// expansion merely because a map sets an otherwise unused spawnflag/skin.
const variants=new Set(['multi_grenade_ogre','chthon_sleeper','shub_awakened','splitting_spawn','infected_death_knight','overlord','infected_enforcer','egyptian_guardian','dragon','infected_knight',
 'infected_grunt','ranged_death_knight','demo_dog','mummy','statue_knight','statue_death_knight','rocket_ogre','gremlin','blood_shambler','hell_spawn','wrath','spike_mine','orb','armagon','hephaestus','chthon_vengeance','guardian','quakes_guardian','quakes_high_priest']);
const additionalModels={monster_ranged_knight:['ranged_death_knight','progs/rknight.mdl'],monster_mummy:['mummy','progs/mummy.mdl'],monster_gremlin:['gremlin','progs/grem.mdl'],monster_super_shambler:['blood_shambler','progs/shambler_blood.mdl'],monster_wrath:['wrath','progs/wrath.mdl'],monster_orb:['orb','progs/teleporter_eye_blink.mdl'],monster_armagon:['armagon','progs/armalegs.mdl'],monster_lava_man:['hephaestus','progs/lavaman.mdl']};
/**
 * Which Bestiary entry a native monster is, from its classname plus the native state and QC callback identity that
 * tell variants apart (`nativeEntry`, r_bestiary.js). Rogue reuses Ogre's classname, so a base-game Ogre is never
 * attributed to the expansion merely because a map sets an otherwise unused spawnflag/skin. The earlier Chthon and
 * the final-boss Sleeper are separate pages (the final initializer rewrites its class; its death callback stays
 * distinct). Dawn rewrites infected/slime initializers to ordinary classnames, so actual native state and callback
 * identity distinguish them before base fallback. Guardian children inherit the boss model but have an owner; they are
 * told apart by ownership, never damage-dependent health or changing skin/effects.
 *
 * @param {string} classname the entity's `v.classname`
 * @param {{rogueOgre?: boolean, spawnflags?: number, model?: string, skin?: number, infected?: number, slime?: number,
 *   deathFunction?: string, hellSpawn?: boolean, splittingSpawn?: boolean, rogueStatues?: boolean, owner?: number}}
 *   [native] the native facts: `model` its model path, `spawnflags` / `skin` / `owner` (an edict number, 0 none) its
 *   fields, `infected` / `slime` its mission-pack fields, `deathFunction` the name of its `th_die`, and the flags for
 *   which mission-pack progs are loaded (Rogue's multi-grenade ogre and statues, Hell Spawn, Splitting Spawn)
 * @returns {?object} the frozen `BESTIARY_ENTRIES` entry, or null for a creature not in the book
 */
export function Bestiary_Identify(classname,{rogueOgre=false,spawnflags=0,model='',skin=0,infected=0,slime=0,deathFunction='',hellSpawn=false,splittingSpawn=false,rogueStatues=false,owner=0}={}){
 const entry=id=>BESTIARY_ENTRIES.find(e=>e.id===id);
 // Owner keeps the earlier Chthon and final-boss Sleeper as separate pages.
 // The final initializer rewrites its class; its death callback stays distinct.
 if(classname==='monster_boss'&&model==='progs/boss.mdl'&&deathFunction==='boss_final_death1')return entry('chthon_sleeper');
 if(classname==='monster_boss'&&model==='progs/boss.mdl'&&(spawnflags&2)&&deathFunction==='boss_death1')return entry('chthon_vengeance');
 // Dawn rewrites infected/slime initializers to ordinary classnames. Actual
 // native state and callback identity distinguish them before base fallback.
 if(infected===1){
  if(classname==='monster_army'&&model==='progs/soldier.mdl'&&deathFunction==='army_infected_die')return entry('infected_grunt');
  if(classname==='monster_knight'&&model==='progs/knight.mdl'&&deathFunction==='knight_infected_die')return entry('infected_knight');
  if(classname==='monster_enforcer'&&model==='progs/enforcer.mdl'&&deathFunction==='enforcer_infected_die')return entry('infected_enforcer');
  if(classname==='monster_hell_knight'&&model==='progs/hknight.mdl'&&deathFunction==='hknight_infected_die')return entry('infected_death_knight');
 }
 if(classname==='monster_dog'&&model==='progs/dog_explosive.mdl'&&deathFunction==='demodog_die')return entry('demo_dog');
 if(classname==='monster_ogre'&&model==='progs/ogre_rocket.mdl')return entry('rocket_ogre');
 if(rogueStatues&&(spawnflags&2)&&skin===1){
  if(classname==='monster_knight'&&model==='progs/knight.mdl')return entry('statue_knight');
  if(classname==='monster_hell_knight'&&model==='progs/hknight.mdl')return entry('statue_death_knight');
 }
 if(classname==='monster_tarbaby'&&model==='progs/tarbaby.mdl'&&splittingSpawn&&slime>0)return entry('splitting_spawn');
 // The original temporarily disables th_pain during mitosis, and offspring
 // keep the Hell Spawn skin without dividing. Loaded QC plus skin is stable.
 if(classname==='monster_tarbaby'&&model==='progs/tarbaby.mdl'&&(skin===1||skin===2)&&hellSpawn)return entry('hell_spawn');
 if(classname==='monster_oldone_new'&&model==='progs/oldone.mdl')return entry('shub_awakened');
 if(classname==='monster_super_wrath'&&model==='progs/s_wrath.mdl')return entry('overlord');
 if(classname==='monster_dragon'&&model==='progs/dragon.mdl')return entry('dragon');
 // Guardian children inherit the boss model but have an owner. Distinguish
 // them by ownership, never damage-dependent health or changing skin/effects.
 if(classname==='monster_morph'&&['progs/morph_eg.mdl','progs/morph_gr.mdl','progs/morph_az.mdl'].includes(model)){
  if(owner>0)return entry('guardian');
  if(owner===0)return entry(model==='progs/morph_eg.mdl'?'egyptian_guardian':model==='progs/morph_gr.mdl'?'quakes_guardian':'quakes_high_priest');
 }
 if(classname==='trap_spike_mine'&&model==='progs/spikmine.mdl'&&deathFunction==='spikemine_Touch')return entry('spike_mine');
 const additional=Object.hasOwn(additionalModels,classname)&&additionalModels[classname];
 if(additional&&model===additional[1])return entry(additional[0]);
 if(classname==='monster_ogre'&&rogueOgre&&(spawnflags&2)&&model==='progs/ogre.mdl'&&skin===1)return BESTIARY_ENTRIES.find(e=>e.id==='multi_grenade_ogre');
 return BESTIARY_ENTRIES.find(e=>!variants.has(e.id)&&e.classes.includes(classname))||null;
}
// The owner's Contents defines completion independently of art loading or
// installed mission packs. Existing browser-profile IDs stay stable.
export const BESTIARY_COLLECTION_IDS = Object.freeze([
 'grunt','infected_grunt','enforcer','infected_enforcer','knight','infected_knight',
 'death_knight','ranged_death_knight','infected_death_knight','dog','demo_dog',
 'rotfish','electric_eel','dragon','zombie','mummy','phantom_swordsman',
 'statue_knight','statue_death_knight','scrag','ogre','multi_grenade_ogre',
 'rocket_ogre','fiend','gremlin','vore','shambler','blood_shambler','spawn',
 'hell_spawn','splitting_spawn','wrath','overlord','centroid','spike_mine','orb',
 'armagon','hephaestus','chthon','chthon_vengeance','chthon_sleeper','guardian',
 'quakes_guardian','egyptian_guardian','quakes_high_priest','shub','shub_awakened'
]);
const known=new Set(BESTIARY_COLLECTION_IDS),catalogKnown=new Set(BESTIARY_ENTRIES.map(e=>e.id)),encounterKnown=new Set(BESTIARY_ENTRIES.filter(e=>e.classes.length).map(e=>e.id));
export class BestiaryJournal {
 /**
  * Opens the journal and reads it at once. One journal lives for the page (r_bestiary.js); discovery belongs to the
  * browser profile, not a game, save or map.
  *
  * @param {{storage?: (Storage|function(): Storage), key?: string}} [options] `storage` (or a function returning it,
  *   so a throwing `localStorage` getter is caught) defaults to `globalThis.localStorage`; `key` defaults to
  *   'quaked.bestiary.v1'
  */
 constructor({storage=()=>globalThis.localStorage,key='quaked.bestiary.v1'}={}){this.storage=storage;this.key=key;this.unlocked=new Set();this.storageStatus='ready';this.reload();}
 _store(){try{const store=typeof this.storage==='function'?this.storage():this.storage;if(!store?.getItem||!store?.setItem)throw Error('Storage unavailable');return store;}catch{this.storageStatus='unavailable';return null;}}
 /**
  * Merges the stored discoveries into this journal (never forgets one already held), so another tab's unlocks are
  * seen; called before each snapshot, discovery scan and unlock. Ignores a missing, malformed or other-version record
  * (`{version: 1, unlocked: [ids]}`) and ids not in `BESTIARY_COLLECTION_IDS`; a read error sets `storageStatus` to
  * 'unavailable'.
  */
 reload(){const store=this._store();if(!store)return;try{const text=store.getItem(this.key);if(!text)return;const data=JSON.parse(text);if(data?.version!==1||!Array.isArray(data.unlocked)||data.unlocked.some(id=>typeof id!=='string'))return;for(const id of data.unlocked)if(known.has(id))this.unlocked.add(id);}catch{this.storageStatus='unavailable';}}
 /**
  * @param {string} id an entry id
  * @returns {boolean} whether it has been discovered (as of the last reload)
  */
 has(id){return this.unlocked.has(id);}
 /**
  * Records a discovery and writes the whole sorted list back to storage (`{version: 1, unlocked}` as JSON under
  * `key`). Reloads first so concurrent tabs' unlocks are kept. A write failure keeps the unlock in memory for this
  * page and sets `storageStatus` 'unavailable'.
  *
  * @param {string} id an id from `BESTIARY_COLLECTION_IDS`
  * @returns {boolean} true when newly discovered; false for an unknown id or one already held
  */
 unlock(id){if(!known.has(id))return false;this.reload();if(this.has(id))return false;this.unlocked.add(id);const store=this._store();if(store)try{store.setItem(this.key,JSON.stringify({version:1,unlocked:[...this.unlocked].sort()}));this.storageStatus='ready';}catch{this.storageStatus='unavailable';}return true;}
 /**
  * @returns {boolean} true when every `BESTIARY_COLLECTION_IDS` entry is discovered. The owner's Contents defines
  *   completion independently of art loading or installed mission packs.
  */
 complete(){return BESTIARY_COLLECTION_IDS.every(id=>this.has(id));}
 /**
  * @returns {{unlocked: Array<string>, complete: boolean, storageStatus: string}} discovered ids in book entry order
  *   (a new array), whether the collection is complete, and 'ready' or 'unavailable' storage
  */
 snapshot(){return {unlocked:[...BESTIARY_ENTRIES.map(e=>e.id),...BESTIARY_COLLECTION_IDS.filter(id=>!catalogKnown.has(id))].filter(id=>this.has(id)),complete:this.complete(),storageStatus:this.storageStatus};}
}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export class BestiaryEncounter {
 /**
  * The page's encounter animation: idle, 'enter' (0.75 s: the paper rolls in, the game slows to a stop), 'hold' until
  * dismissed, 'return' (0.45 s), then idle again. One lives for the page (r_bestiary.js). Starts idle.
  *
  * @param {{random?: function(): number}} [options] `random` 0..1 picks the page side (default `Math.random`)
  */
 constructor({random=Math.random}={}){this.random=random;this.cancel();}
 /**
  * Begins the encounter for a newly discovered creature, on a random side.
  *
  * @param {object} entry a `BESTIARY_ENTRIES` entry with native classes
  * @param {number} now the Bestiary clock, seconds
  * @returns {boolean} false when an encounter is already running or the entry is not encounterable
  */
 start(entry,now){if(this.phase!=='idle'||!entry||!encounterKnown.has(entry.id))return false;this.entry=entry;this.side=this.random()<.5?'left':'right';this.at=now;this.phase='enter';this.tick(now);return true;}
 /**
  * Starts the return from 'hold' (a key or touch, `R_BestiaryKey`); the drawing stays as far as it had got while the
  * page fades.
  *
  * @param {number} now the Bestiary clock, seconds
  * @returns {boolean} false unless holding
  */
 dismiss(now){if(this.phase!=='hold')return false;this.heldPaused=this.value.paused;this.phase='return';this.at=now;this.tick(now);return true;}
 /**
  * Ends any encounter at once and resets to idle.
  *
  * @returns {object} the new idle value (as `tick`)
  */
 cancel(){this.phase='idle';this.entry=null;this.side='left';this.at=0;this.value={phase:'idle',entry:null,side:'left',progress:0,opacity:0,scale:1,t:0,paused:0};return this.value;}
 /**
  * Advances the phases to `now` and computes the animation value; called every frame (`R_BestiaryFrame`) and by
  * start/dismiss.
  *
  * @param {number} now the Bestiary clock, seconds (it must not go backwards; earlier times count as 0 s into the phase)
  * @returns {{phase: string, entry: ?object, side: string, progress: number, opacity: number, scale: number,
  *   t: number, paused: number}} the new value (also kept for `snapshot`): `progress` and `opacity` 0..1 of the page,
  *   `scale` the game's time scale 1..0 (0 from .55 s into 'enter'), `t` seconds in this phase, `paused` seconds since
  *   the game came to a stop, the page's own clocks (card [1]: the paper rolls up with the camera, the drawing begins
  *   when the game stops)
  */
 tick(now){let t=Math.max(0,now-this.at);if(this.phase==='enter'&&t>=.75){this.phase='hold';this.at=now;t=0;}if(this.phase==='return'&&t>=.45)return this.cancel();let progress=0,opacity=0,scale=1;
  if(this.phase==='enter'){progress=smooth(t/.65);opacity=smooth((t-.25)/.5);scale=1-smooth(t/.55);}
  if(this.phase==='hold'){progress=opacity=1;scale=0;}
  if(this.phase==='return'){progress=1-smooth(t/.45);opacity=1-smooth(t/.18);scale=0;}
  // t: seconds in this phase; paused: seconds since the game came to a stop (its time scale reaches 0 at .55 s into the enter
  // phase), the page's own clocks (card [1]: the paper rolls up with the camera, the drawing begins when the game stops)
  // (dismissed: the drawing stays as far as it had got while the page fades)
  const paused=this.phase==='enter'?Math.max(0,t-.55):this.phase==='hold'?.2+t:this.heldPaused??Infinity;
  return this.value={phase:this.phase,entry:this.entry,side:this.side,progress,opacity,scale,t,paused};
 }
 /**
  * @returns {object} the value computed by the last `tick` / `cancel` (the same object; do not mutate)
  */
 snapshot(){return this.value;}
}
