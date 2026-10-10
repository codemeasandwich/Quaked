/**
 * @module engine/common/hooks
 *
 * The named points where the engine calls Newer Game: every Newer function, cvar, class or table the engine and the
 * platform use, as live bindings that `src/newer/install.js` fills once at startup. The engine imports them from
 * here, never from `src/newer/`, so the native side depends only on this list (card [44g], baseline debt D1b). Every
 * entry point that runs engine code imports `src/newer/install.js` first (the page, the room server, the test
 * harness, the trial pages and the bake tools); until then each function hook throws, naming itself, and every other
 * hook is undefined.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `R_AliasMeshLookup`, `R_AliasMeshRemember`, `R_DemonBakePrepare`, `R_DemonBakeRelease`,
 * `R_DemonBakeStatus`, `R_DemonBakeSurface`, `Axe_ParseRecord`, `Axe_ValidOwnerKey`, `PowerVisionMode`,
 * `Respawn_ParseDrop`, `Respawn_ParsePlayer`, `Respawn_ParseRemains` and 395 more; module-level variables
 * `_installed`.
 *
 * Errors: throws at 2 places.
 */

// a function hook before installation: say which, and what was not imported
function Hooks_Missing( name ) {

	return function () {

		throw new Error( `hook ${name} called before Newer was installed (import src/newer/install.js first)` );

	};

}

// newer/assets/r_aliasmeshcache.js
export let R_AliasMeshLookup = Hooks_Missing( 'R_AliasMeshLookup' );
export let R_AliasMeshRemember = Hooks_Missing( 'R_AliasMeshRemember' );

// newer/assets/r_demonbakes.js
export let R_DemonBakePrepare = Hooks_Missing( 'R_DemonBakePrepare' );
export let R_DemonBakeRelease = Hooks_Missing( 'R_DemonBakeRelease' );
export let R_DemonBakeStatus = Hooks_Missing( 'R_DemonBakeStatus' );
export let R_DemonBakeSurface = Hooks_Missing( 'R_DemonBakeSurface' );

// newer/gameplay/axe_record.js
export let Axe_ParseRecord = Hooks_Missing( 'Axe_ParseRecord' );
export let Axe_ValidOwnerKey = Hooks_Missing( 'Axe_ValidOwnerKey' );

// newer/gameplay/powervision_state.js
export let PowerVisionMode = Hooks_Missing( 'PowerVisionMode' );

// newer/gameplay/respawn_record.js
export let Respawn_ParseDrop = Hooks_Missing( 'Respawn_ParseDrop' );
export let Respawn_ParsePlayer = Hooks_Missing( 'Respawn_ParsePlayer' );
export let Respawn_ParseRemains = Hooks_Missing( 'Respawn_ParseRemains' );

// newer/gameplay/sv_axecut.js
export let SV_AxeEntitySuppressed = Hooks_Missing( 'SV_AxeEntitySuppressed' );
export let SV_AxeFunctionEnter = Hooks_Missing( 'SV_AxeFunctionEnter' );
export let SV_AxeFunctionLeave = Hooks_Missing( 'SV_AxeFunctionLeave' );
export let SV_AxeGibSeen = Hooks_Missing( 'SV_AxeGibSeen' );
export let SV_AxeReset = Hooks_Missing( 'SV_AxeReset' );

// newer/gameplay/sv_cheats.js
export let SV_CheatsFrame = Hooks_Missing( 'SV_CheatsFrame' );
export let SV_CheatsInit = Hooks_Missing( 'SV_CheatsInit' );

// newer/gameplay/sv_faceevents.js
export let SV_FaceFunctionEnter = Hooks_Missing( 'SV_FaceFunctionEnter' );
export let SV_FaceFunctionLeave = Hooks_Missing( 'SV_FaceFunctionLeave' );
export let SV_FaceReset = Hooks_Missing( 'SV_FaceReset' );
export let SV_FaceShotTrace = Hooks_Missing( 'SV_FaceShotTrace' );

// newer/gameplay/sv_gore.js
export let SV_GoreOnSetModel = Hooks_Missing( 'SV_GoreOnSetModel' );

// newer/gameplay/sv_meleespray.js
export let SV_MeleeSprayEnter = Hooks_Missing( 'SV_MeleeSprayEnter' );

// newer/gameplay/sv_pinnedzombies.js
export let SV_PinnedZombieSpawned = Hooks_Missing( 'SV_PinnedZombieSpawned' );

// newer/gameplay/sv_portal.js
export let SV_BeginPortalTouch = Hooks_Missing( 'SV_BeginPortalTouch' );
export let SV_FinishPortalTouch = Hooks_Missing( 'SV_FinishPortalTouch' );
export let SV_PreparePortalTouch = Hooks_Missing( 'SV_PreparePortalTouch' );
export let SV_RestorePortalReceiver = Hooks_Missing( 'SV_RestorePortalReceiver' );

// newer/gameplay/sv_portalmotion.js
export let SV_PortalMoveEnd = Hooks_Missing( 'SV_PortalMoveEnd' );
export let SV_PortalMoveRead = Hooks_Missing( 'SV_PortalMoveRead' );
export let SV_PortalMoveStart = Hooks_Missing( 'SV_PortalMoveStart' );
export let SV_PortalMoveStepping = Hooks_Missing( 'SV_PortalMoveStepping' );

// newer/gameplay/sv_pronezombie.js
export let SV_ProneZombieEnter = Hooks_Missing( 'SV_ProneZombieEnter' );
export let SV_ProneZombieLeave = Hooks_Missing( 'SV_ProneZombieLeave' );
export let SV_ZombieProne = Hooks_Missing( 'SV_ZombieProne' );

// newer/gameplay/sv_quadmovement.js
export let SV_QuadJumpBegin = Hooks_Missing( 'SV_QuadJumpBegin' );
export let SV_QuadJumpEnd = Hooks_Missing( 'SV_QuadJumpEnd' );
export let SV_QuadMovementScale = Hooks_Missing( 'SV_QuadMovementScale' );

// newer/gameplay/sv_rendveil.js
export let Rend_ParseRecord = Hooks_Missing( 'Rend_ParseRecord' );
export let Rend_ValidRecord = Hooks_Missing( 'Rend_ValidRecord' );
export let SV_RendVeilClientRecord = Hooks_Missing( 'SV_RendVeilClientRecord' );
export let SV_RendVeilHolding = Hooks_Missing( 'SV_RendVeilHolding' );
export let SV_RendVeilTouchBegin = Hooks_Missing( 'SV_RendVeilTouchBegin' );
export let SV_RendVeilTouchEnd = Hooks_Missing( 'SV_RendVeilTouchEnd' );

// newer/gameplay/sv_respawn.js
export let SV_RespawnCaptureTravel = Hooks_Missing( 'SV_RespawnCaptureTravel' );
export let SV_RespawnClearTravel = Hooks_Missing( 'SV_RespawnClearTravel' );
export let SV_RespawnDropTouch = Hooks_Missing( 'SV_RespawnDropTouch' );
export let SV_RespawnFinishTravel = Hooks_Missing( 'SV_RespawnFinishTravel' );
export let SV_RespawnFrame = Hooks_Missing( 'SV_RespawnFrame' );
export let SV_RespawnFunctionEnter = Hooks_Missing( 'SV_RespawnFunctionEnter' );
export let SV_RespawnFunctionLeave = Hooks_Missing( 'SV_RespawnFunctionLeave' );
export let SV_RespawnInventoryStats = Hooks_Missing( 'SV_RespawnInventoryStats' );
export let SV_RespawnPrecache = Hooks_Missing( 'SV_RespawnPrecache' );
export let SV_RespawnReserveGuards = Hooks_Missing( 'SV_RespawnReserveGuards' );
export let SV_RespawnRestoreDropModel = Hooks_Missing( 'SV_RespawnRestoreDropModel' );
export let SV_RespawnView = Hooks_Missing( 'SV_RespawnView' );
export let SV_RespawnWorldStart = Hooks_Missing( 'SV_RespawnWorldStart' );
export let SV_SetRespawnEntryHook = Hooks_Missing( 'SV_SetRespawnEntryHook' );
export let SV_SetRespawnLandedHook = Hooks_Missing( 'SV_SetRespawnLandedHook' );
export let sv_respawnguard;

// newer/gameplay/sv_seamless.js
export let SV_LevelSnapshotEntities = Hooks_Missing( 'SV_LevelSnapshotEntities' );
export let SV_LiquidLinks = Hooks_Missing( 'SV_LiquidLinks' );
export let SV_SeamlessCloseReturn = Hooks_Missing( 'SV_SeamlessCloseReturn' );
export let SV_SeamlessCrossings = Hooks_Missing( 'SV_SeamlessCrossings' );
export let SV_SeamlessEnabled = Hooks_Missing( 'SV_SeamlessEnabled' );
export let SV_SeamlessEntryYaw = Hooks_Missing( 'SV_SeamlessEntryYaw' );
export let SV_SeamlessFrame = Hooks_Missing( 'SV_SeamlessFrame' );
export let SV_SeamlessHolding = Hooks_Missing( 'SV_SeamlessHolding' );
export let SV_SeamlessPending = Hooks_Missing( 'SV_SeamlessPending' );
export let SV_SeamlessPlacePlayer = Hooks_Missing( 'SV_SeamlessPlacePlayer' );
export let SV_SeamlessSetup = Hooks_Missing( 'SV_SeamlessSetup' );
export let SV_SeamlessUseModels = Hooks_Missing( 'SV_SeamlessUseModels' );
export let SV_SetLiquidLinks = Hooks_Missing( 'SV_SetLiquidLinks' );
export let SV_SetWarmLevel = Hooks_Missing( 'SV_SetWarmLevel' );

// newer/gameplay/sv_shotdelay.js
export let SV_ShotDelayRun = Hooks_Missing( 'SV_ShotDelayRun' );
export let sv_shotdelay;

// newer/gameplay/sv_unseen.js
export let SV_UnseenFrame = Hooks_Missing( 'SV_UnseenFrame' );
export let SV_UnseenFunctionEnter = Hooks_Missing( 'SV_UnseenFunctionEnter' );
export let SV_UnseenFunctionLeave = Hooks_Missing( 'SV_UnseenFunctionLeave' );

// newer/mode.js
export let R_AnimSetClassicPass = Hooks_Missing( 'R_AnimSetClassicPass' );
export let R_ClassicPassActive = Hooks_Missing( 'R_ClassicPassActive' );
export let R_IsNewer = Hooks_Missing( 'R_IsNewer' );
export let R_NewerGame = Hooks_Missing( 'R_NewerGame' );
export let R_NewerLightingActive = Hooks_Missing( 'R_NewerLightingActive' );
export let r_newer_crates;
export let r_newer_enemies;
export let r_newer_hud;
export let r_newer_lighting;
export let r_newer_normals;
export let r_newer_portals;
export let r_newer_shadows;
export let r_newer_textures;
export let r_newer_water;

// newer/render/enemy_face.js
export let Face_Assign = Hooks_Missing( 'Face_Assign' );
export let Face_ParseSeed = Hooks_Missing( 'Face_ParseSeed' );
export let Face_Seed = Hooks_Missing( 'Face_Seed' );

// newer/render/gl_portal.js
export let R_BoxInPortalReceiver = Hooks_Missing( 'R_BoxInPortalReceiver' );
export let R_BuildPortals = Hooks_Missing( 'R_BuildPortals' );
export let R_GetPortals = Hooks_Missing( 'R_GetPortals' );
export let R_ImpactPortalPlanes = Hooks_Missing( 'R_ImpactPortalPlanes' );
export let R_LevelPortalMatrix = Hooks_Missing( 'R_LevelPortalMatrix' );
export let R_PortalMaterial = Hooks_Missing( 'R_PortalMaterial' );
export let R_PortalNoteVisible = Hooks_Missing( 'R_PortalNoteVisible' );
export let R_PortalsActive = Hooks_Missing( 'R_PortalsActive' );
export let R_PortalsBeginFrame = Hooks_Missing( 'R_PortalsBeginFrame' );
export let R_RenderPortals = Hooks_Missing( 'R_RenderPortals' );
export let r_portals;

// newer/render/gl_post.js
export let R_BuildSunOccluder = Hooks_Missing( 'R_BuildSunOccluder' );
export let R_BuildWorldLights = Hooks_Missing( 'R_BuildWorldLights' );
export let R_DynResScale = Hooks_Missing( 'R_DynResScale' );
export let R_FireFlicker = Hooks_Missing( 'R_FireFlicker' );
export let R_GetLiquidLinks = Hooks_Missing( 'R_GetLiquidLinks' );
export let R_GetWorldLights = Hooks_Missing( 'R_GetWorldLights' );
export let R_GlowBoostForTexture = Hooks_Missing( 'R_GlowBoostForTexture' );
export let R_IsWaterTextureName = Hooks_Missing( 'R_IsWaterTextureName' );
export let R_LiquidOpacity = Hooks_Missing( 'R_LiquidOpacity' );
export let R_MapHasSky = Hooks_Missing( 'R_MapHasSky' );
export let R_PointShadowStatus = Hooks_Missing( 'R_PointShadowStatus' );
export let R_PostActive = Hooks_Missing( 'R_PostActive' );
export let R_PostBegin = Hooks_Missing( 'R_PostBegin' );
export let R_PostBind = Hooks_Missing( 'R_PostBind' );
export let R_PostFinish = Hooks_Missing( 'R_PostFinish' );
export let R_PostInstallGBufferPatch = Hooks_Missing( 'R_PostInstallGBufferPatch' );
export let R_PostLightsFrame = Hooks_Missing( 'R_PostLightsFrame' );
export let R_PostNoteSky = Hooks_Missing( 'R_PostNoteSky' );
export let R_PostSetPortraitLight = Hooks_Missing( 'R_PostSetPortraitLight' );
export let R_PostSetSplit = Hooks_Missing( 'R_PostSetSplit' );
export let R_PostSetUnderwater = Hooks_Missing( 'R_PostSetUnderwater' );
export let R_RefreshDetail = Hooks_Missing( 'R_RefreshDetail' );
export let R_RegisterDetail = Hooks_Missing( 'R_RegisterDetail' );
export let R_RegisterGlow = Hooks_Missing( 'R_RegisterGlow' );
export let R_WaterActive = Hooks_Missing( 'R_WaterActive' );
export let R_WaterProbesFrame = Hooks_Missing( 'R_WaterProbesFrame' );
export let R_WaterStartupStatus = Hooks_Missing( 'R_WaterStartupStatus' );
export let SUN_SHADOW_LAYER;
export let classicLook;
export let r_bloom;
export let r_bounce;
export let r_caustics;
export let r_cloudspeed;
export let r_dynres;
export let r_fps_target;
export let r_hdr;
export let r_heathaze;
export let r_mist;
export let r_newbright;
export let r_newcontrast;
export let r_newdark;
export let r_newedges;
export let r_pillars;
export let r_pointshadows;
export let r_reflect;
export let r_reflect_screen;
export let r_volumetric;
export let r_water_look;

// newer/render/r_anim.js
export let R_AliasPoseBlend = Hooks_Missing( 'R_AliasPoseBlend' );
export let R_AnimEnabled = Hooks_Missing( 'R_AnimEnabled' );
export let R_BlendArrays = Hooks_Missing( 'R_BlendArrays' );
export let R_SmoothMove = Hooks_Missing( 'R_SmoothMove' );
export let r_lerpmodels;

// newer/render/r_archframe.js
export let R_ArchHiddenRevision = Hooks_Missing( 'R_ArchHiddenRevision' );
export let R_ArchModelHidden = Hooks_Missing( 'R_ArchModelHidden' );
export let R_ArchSurfaceHidden = Hooks_Missing( 'R_ArchSurfaceHidden' );
export let R_HasArchHidden = Hooks_Missing( 'R_HasArchHidden' );

// newer/render/r_axecorpses.js
export let R_AxeCorpsesFrame = Hooks_Missing( 'R_AxeCorpsesFrame' );
export let R_ClearAxeCorpses = Hooks_Missing( 'R_ClearAxeCorpses' );

// newer/render/r_classicstate.js
export let R_ClassicMaterial = Hooks_Missing( 'R_ClassicMaterial' );
export let R_SaveClassicScene = Hooks_Missing( 'R_SaveClassicScene' );

// newer/render/r_cratevariants.js
export let R_CratePlan = Hooks_Missing( 'R_CratePlan' );
export let R_IsCrateSide = Hooks_Missing( 'R_IsCrateSide' );

// newer/render/r_decals.js
export let R_DecalBloodLanded = Hooks_Missing( 'R_DecalBloodLanded' );
export let R_DecalBloodPool = Hooks_Missing( 'R_DecalBloodPool' );
export let R_DecalBloodSpray = Hooks_Missing( 'R_DecalBloodSpray' );
export let R_DecalGibTrack = Hooks_Missing( 'R_DecalGibTrack' );
export let R_DecalScorch = Hooks_Missing( 'R_DecalScorch' );
export let R_DecalShot = Hooks_Missing( 'R_DecalShot' );
export let R_DecalsClear = Hooks_Missing( 'R_DecalsClear' );
export let R_DecalsFrame = Hooks_Missing( 'R_DecalsFrame' );
export let R_DecalsSetup = Hooks_Missing( 'R_DecalsSetup' );
export let r_decals;

// newer/render/r_demonrelief.js
export let DEMON_TEXTURES;
export let R_DemonSurfaceData = Hooks_Missing( 'R_DemonSurfaceData' );

// newer/render/r_demosplit.js
export let R_DemoSplitActive = Hooks_Missing( 'R_DemoSplitActive' );
export let R_DemoSplitClassic = Hooks_Missing( 'R_DemoSplitClassic' );
export let R_DemoSplitEnd = Hooks_Missing( 'R_DemoSplitEnd' );
export let R_DemoSplitFull = Hooks_Missing( 'R_DemoSplitFull' );
export let R_DemoSplitRelease = Hooks_Missing( 'R_DemoSplitRelease' );
export let R_DemoSplitStart = Hooks_Missing( 'R_DemoSplitStart' );
export let r_demosplit;

// newer/render/r_dof.js
export let R_DofClear = Hooks_Missing( 'R_DofClear' );
export let R_DofFrame = Hooks_Missing( 'R_DofFrame' );
export let R_DofSetup = Hooks_Missing( 'R_DofSetup' );
export let r_dof;

// newer/render/r_fireball.js
export let R_FireballClear = Hooks_Missing( 'R_FireballClear' );
export let R_FireballFrame = Hooks_Missing( 'R_FireballFrame' );
export let R_FireballReplacesSprite = Hooks_Missing( 'R_FireballReplacesSprite' );
export let R_FireballSetup = Hooks_Missing( 'R_FireballSetup' );
export let R_FireballSpawn = Hooks_Missing( 'R_FireballSpawn' );
export let R_SmokeTrail = Hooks_Missing( 'R_SmokeTrail' );
export let r_fireball;
export let r_fireballalpha;
export let r_smoketrails;

// newer/render/r_flashlight.js
export let R_FlashlightBeam = Hooks_Missing( 'R_FlashlightBeam' );
export let R_FlashlightInit = Hooks_Missing( 'R_FlashlightInit' );
export let R_FlashlightToggle = Hooks_Missing( 'R_FlashlightToggle' );
export let R_FlashlightUpdate = Hooks_Missing( 'R_FlashlightUpdate' );
export let r_flashlight;

// newer/render/r_flashlightrun.js
export let R_FlashlightNewRun = Hooks_Missing( 'R_FlashlightNewRun' );
export let R_FlashlightRunEnd = Hooks_Missing( 'R_FlashlightRunEnd' );
export let R_FlashlightRunLoaded = Hooks_Missing( 'R_FlashlightRunLoaded' );
export let R_FlashlightRunMap = Hooks_Missing( 'R_FlashlightRunMap' );
export let R_FlashlightSkillSelected = Hooks_Missing( 'R_FlashlightSkillSelected' );

// newer/render/r_heightshadows.js
export let R_HeightShadowScope = Hooks_Missing( 'R_HeightShadowScope' );
export let r_heightshadows;

// newer/render/r_impactripples.js
export let R_ImpactMissile = Hooks_Missing( 'R_ImpactMissile' );
export let R_ImpactRippleFrame = Hooks_Missing( 'R_ImpactRippleFrame' );
export let R_ImpactRippleListen = Hooks_Missing( 'R_ImpactRippleListen' );
export let R_ImpactRippleReset = Hooks_Missing( 'R_ImpactRippleReset' );
export let R_ImpactRipplesSetup = Hooks_Missing( 'R_ImpactRipplesSetup' );
export let r_impactripples;

// newer/render/r_levelview.js
export let R_LevelViewUseSnapshots = Hooks_Missing( 'R_LevelViewUseSnapshots' );
export let R_SetupLevelViews = Hooks_Missing( 'R_SetupLevelViews' );
export let R_SyncLevelViews = Hooks_Missing( 'R_SyncLevelViews' );
export let R_UpdateLevelViewEntities = Hooks_Missing( 'R_UpdateLevelViewEntities' );

// newer/render/r_lightning.js
export let LIGHTNING;
export let R_LightningClear = Hooks_Missing( 'R_LightningClear' );
export let R_LightningFrame = Hooks_Missing( 'R_LightningFrame' );
export let R_LightningSetup = Hooks_Missing( 'R_LightningSetup' );
export let R_LightningTakesBeam = Hooks_Missing( 'R_LightningTakesBeam' );
export let r_newer_lightning;

// newer/render/r_mist.js
export let R_MistClear = Hooks_Missing( 'R_MistClear' );
export let R_MistFrame = Hooks_Missing( 'R_MistFrame' );

// newer/render/r_muzzle.js
export let R_MuzzleFlashFired = Hooks_Missing( 'R_MuzzleFlashFired' );
export let R_MuzzleFlashScale = Hooks_Missing( 'R_MuzzleFlashScale' );
export let R_MuzzleSetProbe = Hooks_Missing( 'R_MuzzleSetProbe' );
export let R_MuzzleSetView = Hooks_Missing( 'R_MuzzleSetView' );
export let R_MuzzleView = Hooks_Missing( 'R_MuzzleView' );

// newer/render/r_newerskins.js
export let R_AssetAliasMaterial = Hooks_Missing( 'R_AssetAliasMaterial' );
export let R_CloneAliasMaterial = Hooks_Missing( 'R_CloneAliasMaterial' );
export let R_EnemyAliasMaterial = Hooks_Missing( 'R_EnemyAliasMaterial' );
export let R_HeldVisionTag;
export let R_NewerAliasMaterial = Hooks_Missing( 'R_NewerAliasMaterial' );
export let R_NewerSkinsMaterials = Hooks_Missing( 'R_NewerSkinsMaterials' );
export let R_NewerSkinsNewMap = Hooks_Missing( 'R_NewerSkinsNewMap' );
export let R_NewerSkinsPrepare = Hooks_Missing( 'R_NewerSkinsPrepare' );
export let R_NewerSkinsStatus = Hooks_Missing( 'R_NewerSkinsStatus' );
export let R_NewerSkinsTextures = Hooks_Missing( 'R_NewerSkinsTextures' );
export let R_ReleaseAliasReceiver = Hooks_Missing( 'R_ReleaseAliasReceiver' );
export let r_newer_variety;

// newer/render/r_newertextures.js
export let R_ClassicTexture = Hooks_Missing( 'R_ClassicTexture' );
export let R_NewerNormalsPrepare = Hooks_Missing( 'R_NewerNormalsPrepare' );
export let R_NewerNormalsStatus = Hooks_Missing( 'R_NewerNormalsStatus' );
export let R_NewerTextureUpgrade = Hooks_Missing( 'R_NewerTextureUpgrade' );
export let R_NewerTexturesFrame = Hooks_Missing( 'R_NewerTexturesFrame' );
export let R_NewerTexturesStatus = Hooks_Missing( 'R_NewerTexturesStatus' );

// newer/render/r_perf.js
export let R_PerfFpsText = Hooks_Missing( 'R_PerfFpsText' );
export let R_PerfFrameBegin = Hooks_Missing( 'R_PerfFrameBegin' );
export let R_PerfFrameEnd = Hooks_Missing( 'R_PerfFrameEnd' );
export let R_PerfInit = Hooks_Missing( 'R_PerfInit' );
export let R_PerfProfiling = Hooks_Missing( 'R_PerfProfiling' );
export let R_PerfScreenLines = Hooks_Missing( 'R_PerfScreenLines' );
export let R_PerfStage = Hooks_Missing( 'R_PerfStage' );
export let R_PerfStop = Hooks_Missing( 'R_PerfStop' );
export let cl_showfps;

// newer/render/r_powerups.js
export let R_PowerupBegin = Hooks_Missing( 'R_PowerupBegin' );
export let R_PowerupClear = Hooks_Missing( 'R_PowerupClear' );
export let R_PowerupEnd = Hooks_Missing( 'R_PowerupEnd' );
export let R_PowerupSeen = Hooks_Missing( 'R_PowerupSeen' );
export let r_powerups;

// newer/render/r_powervision.js
export let R_PowerVisionReset = Hooks_Missing( 'R_PowerVisionReset' );

// newer/render/r_prewarm.js
export let R_WarmFrame = Hooks_Missing( 'R_WarmFrame' );
export let R_WarmLevel = Hooks_Missing( 'R_WarmLevel' );

// newer/render/r_quadvision.js
export let R_QuadVisionActive = Hooks_Missing( 'R_QuadVisionActive' );
export let R_QuadVisionReset = Hooks_Missing( 'R_QuadVisionReset' );

// newer/render/r_rendveil.js
export let R_RendVeilBegin = Hooks_Missing( 'R_RendVeilBegin' );
export let R_RendVeilCapture = Hooks_Missing( 'R_RendVeilCapture' );
export let R_RendVeilClear = Hooks_Missing( 'R_RendVeilClear' );
export let R_RendVeilEnd = Hooks_Missing( 'R_RendVeilEnd' );
export let R_RendVeilRelease = Hooks_Missing( 'R_RendVeilRelease' );
export let R_RendVeilSeen = Hooks_Missing( 'R_RendVeilSeen' );

// newer/render/r_respawn.js
export let R_RespawnCameraFrame = Hooks_Missing( 'R_RespawnCameraFrame' );

// newer/render/r_rockfield.js
export let R_RockfieldBrushSeen = Hooks_Missing( 'R_RockfieldBrushSeen' );
export let R_RockfieldBuild = Hooks_Missing( 'R_RockfieldBuild' );
export let R_RockfieldChart = Hooks_Missing( 'R_RockfieldChart' );
export let R_RockfieldGeometry = Hooks_Missing( 'R_RockfieldGeometry' );
export let R_RockfieldSetLimits = Hooks_Missing( 'R_RockfieldSetLimits' );
export let R_RockfieldStatus = Hooks_Missing( 'R_RockfieldStatus' );
export let R_RockfieldUpdate = Hooks_Missing( 'R_RockfieldUpdate' );
export let r_rockfield;

// newer/render/r_screendrops.js
export let R_ScreenDropsBloodAt = Hooks_Missing( 'R_ScreenDropsBloodAt' );
export let R_ScreenDropsReset = Hooks_Missing( 'R_ScreenDropsReset' );
export let R_ScreenDropsSetView = Hooks_Missing( 'R_ScreenDropsSetView' );
export let R_ScreenDropsView = Hooks_Missing( 'R_ScreenDropsView' );

// newer/render/r_shaderwarm.js
export let R_CompileSceneAsync = Hooks_Missing( 'R_CompileSceneAsync' );
export let R_ShaderAssetStamp = Hooks_Missing( 'R_ShaderAssetStamp' );

// newer/render/r_shells.js
export let R_ShellShot = Hooks_Missing( 'R_ShellShot' );
export let R_ShellsFrame = Hooks_Missing( 'R_ShellsFrame' );
export let R_ShellsNewMap = Hooks_Missing( 'R_ShellsNewMap' );
export let R_ShellsReset = Hooks_Missing( 'R_ShellsReset' );
export let R_ShellsRestore = Hooks_Missing( 'R_ShellsRestore' );
export let R_ShellsSetup = Hooks_Missing( 'R_ShellsSetup' );
export let R_ShellsSnapshot = Hooks_Missing( 'R_ShellsSnapshot' );

// newer/render/r_shelltrace.js
export let R_ShellTrace = Hooks_Missing( 'R_ShellTrace' );

// newer/render/r_shotgun.js
export let R_ShotgunClear = Hooks_Missing( 'R_ShotgunClear' );
export let R_ShotgunFrame = Hooks_Missing( 'R_ShotgunFrame' );
export let R_ShotgunSetup = Hooks_Missing( 'R_ShotgunSetup' );
export let r_shotgunfx;
export let viewModelMuzzles = Hooks_Missing( 'viewModelMuzzles' );

// newer/render/r_teleportfx.js
export let R_TeleportFrameEnd = Hooks_Missing( 'R_TeleportFrameEnd' );

// newer/render/r_torchfire.js
export let R_TorchFire = Hooks_Missing( 'R_TorchFire' );
export let R_TorchFireBegin = Hooks_Missing( 'R_TorchFireBegin' );
export let R_TorchFireClear = Hooks_Missing( 'R_TorchFireClear' );
export let R_TorchFireFlush = Hooks_Missing( 'R_TorchFireFlush' );
export let R_TorchFireSetup = Hooks_Missing( 'R_TorchFireSetup' );
export let TORCH_HANDLE;
export let TORCH_WHOLE;
export let r_torchfire;
export let torchParts = Hooks_Missing( 'torchParts' );

// newer/render/r_wallburn.js
export let R_AliasFrameBox = Hooks_Missing( 'R_AliasFrameBox' );
export let R_WallBurnClear = Hooks_Missing( 'R_WallBurnClear' );
export let R_WallBurnFrame = Hooks_Missing( 'R_WallBurnFrame' );
export let R_WallBurnSetup = Hooks_Missing( 'R_WallBurnSetup' );
export let R_WallBurnShot = Hooks_Missing( 'R_WallBurnShot' );
export let r_newer_wallburn;

// newer/render/r_waves.js
export let R_WaveImpact = Hooks_Missing( 'R_WaveImpact' );
export let R_WavesFrame = Hooks_Missing( 'R_WavesFrame' );
export let R_WavesReset = Hooks_Missing( 'R_WavesReset' );
export let R_WavesSetup = Hooks_Missing( 'R_WavesSetup' );

// newer/render/r_weapon_surface.js
export let R_PlayerSurfaceBlood = Hooks_Missing( 'R_PlayerSurfaceBlood' );
export let R_WeaponSurfaceBloodAt = Hooks_Missing( 'R_WeaponSurfaceBloodAt' );
export let R_WeaponSurfaceContext = Hooks_Missing( 'R_WeaponSurfaceContext' );
export let R_WeaponSurfaceFrame = Hooks_Missing( 'R_WeaponSurfaceFrame' );
export let weaponSurface;

// newer/render/r_weapons.js
export let R_WeaponAsset = Hooks_Missing( 'R_WeaponAsset' );
export let R_WeaponHeldPullback = Hooks_Missing( 'R_WeaponHeldPullback' );
export let R_WeaponMaterials = Hooks_Missing( 'R_WeaponMaterials' );
export let R_WeaponRotorFrame = Hooks_Missing( 'R_WeaponRotorFrame' );
export let R_WeaponStatus = Hooks_Missing( 'R_WeaponStatus' );
export let R_WeaponTextures = Hooks_Missing( 'R_WeaponTextures' );
export let R_WeaponsEnabled = Hooks_Missing( 'R_WeaponsEnabled' );
export let R_WeaponsPreload = Hooks_Missing( 'R_WeaponsPreload' );
export let r_newer_weapons;

// newer/render/v_shamblersteps.js
export let V_ShamblerStepShake = Hooks_Missing( 'V_ShamblerStepShake' );
export let v_shamblersteps;

// newer/sound/s_ambientgame.js
export let S_UpdateAmbientMusic = Hooks_Missing( 'S_UpdateAmbientMusic' );

// newer/sound/s_ambientmusic.js
export let S_AmbientMusicNotifyCombat = Hooks_Missing( 'S_AmbientMusicNotifyCombat' );
export let S_AmbientMusicShutdown = Hooks_Missing( 'S_AmbientMusicShutdown' );
export let S_AmbientMusicStop = Hooks_Missing( 'S_AmbientMusicStop' );
export let S_AmbientMusicUnlock = Hooks_Missing( 'S_AmbientMusicUnlock' );

// newer/sound/s_exitmachine.js
export let S_ExitMachineFalloff = Hooks_Missing( 'S_ExitMachineFalloff' );

// newer/ui/menu_art.js
export let BuildMenuTextArt = Hooks_Missing( 'BuildMenuTextArt' );
export let BuildSinglePlayerMenuArt = Hooks_Missing( 'BuildSinglePlayerMenuArt' );

// newer/ui/menu_webgl.js
export let MainMenu_Begin = Hooks_Missing( 'MainMenu_Begin' );
export let MainMenu_Destroy = Hooks_Missing( 'MainMenu_Destroy' );
export let MainMenu_End = Hooks_Missing( 'MainMenu_End' );
export let MainMenu_Glyph = Hooks_Missing( 'MainMenu_Glyph' );
export let MainMenu_Image = Hooks_Missing( 'MainMenu_Image' );
export let MainMenu_Panel = Hooks_Missing( 'MainMenu_Panel' );
export let MainMenu_SetInGame = Hooks_Missing( 'MainMenu_SetInGame' );
export let MainMenu_SetVisible = Hooks_Missing( 'MainMenu_SetVisible' );
export let MainMenu_Skinned = Hooks_Missing( 'MainMenu_Skinned' );
export let MainMenu_Slider = Hooks_Missing( 'MainMenu_Slider' );
export let MainMenu_Text = Hooks_Missing( 'MainMenu_Text' );
export let MainMenu_TextBox = Hooks_Missing( 'MainMenu_TextBox' );

// newer/ui/newer_defaults.js
export let NEWER_ENABLED_FEATURES;

// newer/ui/r_bestiary.js
export let R_BestiaryApplyCamera = Hooks_Missing( 'R_BestiaryApplyCamera' );
export let R_BestiaryFrame = Hooks_Missing( 'R_BestiaryFrame' );
export let R_BestiaryFrozen = Hooks_Missing( 'R_BestiaryFrozen' );
export let R_BestiaryInputLocked = Hooks_Missing( 'R_BestiaryInputLocked' );
export let R_BestiaryKey = Hooks_Missing( 'R_BestiaryKey' );
export let R_BestiaryObserve = Hooks_Missing( 'R_BestiaryObserve' );
export let R_BestiaryPortraitLight = Hooks_Missing( 'R_BestiaryPortraitLight' );
export let R_BestiaryTimeScale = Hooks_Missing( 'R_BestiaryTimeScale' );

// newer/ui/r_bestiary_book.js
export let R_BestiaryBookCorner = Hooks_Missing( 'R_BestiaryBookCorner' );
export let R_BestiaryBookDraw = Hooks_Missing( 'R_BestiaryBookDraw' );
export let R_BestiaryBookKey = Hooks_Missing( 'R_BestiaryBookKey' );
export let R_BestiaryBookOpen = Hooks_Missing( 'R_BestiaryBookOpen' );
export let R_BestiaryBookTouch = Hooks_Missing( 'R_BestiaryBookTouch' );
export let R_BestiaryEncounterDraw = Hooks_Missing( 'R_BestiaryEncounterDraw' );

// newer/ui/r_demoloading.js
export let R_DemoLoadingAttract = Hooks_Missing( 'R_DemoLoadingAttract' );
export let R_DemoLoadingCancel = Hooks_Missing( 'R_DemoLoadingCancel' );
export let R_DemoLoadingConsoleClosed = Hooks_Missing( 'R_DemoLoadingConsoleClosed' );
export let R_DemoLoadingConsoleDrawn = Hooks_Missing( 'R_DemoLoadingConsoleDrawn' );
export let R_DemoLoadingConsoleOverride = Hooks_Missing( 'R_DemoLoadingConsoleOverride' );
export let R_DemoLoadingConsoleSpeed = Hooks_Missing( 'R_DemoLoadingConsoleSpeed' );
export let R_DemoLoadingFrame = Hooks_Missing( 'R_DemoLoadingFrame' );
export let R_DemoLoadingFreeze = Hooks_Missing( 'R_DemoLoadingFreeze' );
export let R_DemoLoadingHolding = Hooks_Missing( 'R_DemoLoadingHolding' );
export let R_DemoLoadingWelcome = Hooks_Missing( 'R_DemoLoadingWelcome' );
export let R_IntroLoadingHolding = Hooks_Missing( 'R_IntroLoadingHolding' );
export let R_IntroReadinessChecks = Hooks_Missing( 'R_IntroReadinessChecks' );
export let R_WelcomeLoadingHolding = Hooks_Missing( 'R_WelcomeLoadingHolding' );

// newer/ui/r_facegame.js
export let R_FaceDamage = Hooks_Missing( 'R_FaceDamage' );
export let R_FaceGameReset = Hooks_Missing( 'R_FaceGameReset' );
export let R_FaceHealthChanged = Hooks_Missing( 'R_FaceHealthChanged' );
export let R_FaceInventory = Hooks_Missing( 'R_FaceInventory' );
export let R_FaceSecret = Hooks_Missing( 'R_FaceSecret' );
export let R_PlayerFaceFrame = Hooks_Missing( 'R_PlayerFaceFrame' );

// newer/ui/r_newerhud.js
export let R_NewerHudCanvas = Hooks_Missing( 'R_NewerHudCanvas' );
export let R_NewerHudPreload = Hooks_Missing( 'R_NewerHudPreload' );
export let R_NewerHudStatus = Hooks_Missing( 'R_NewerHudStatus' );

// newer/ui/r_playerface.js
export let R_PlayerFaceCompose = Hooks_Missing( 'R_PlayerFaceCompose' );
export let R_PlayerFacePreload = Hooks_Missing( 'R_PlayerFacePreload' );

// newer/ui/respawn_notice.js
export let Respawn_NoticeAt = Hooks_Missing( 'Respawn_NoticeAt' );

// newer/ui/studio_logo.js
export let Draw_StudioLogo = Hooks_Missing( 'Draw_StudioLogo' );

const HOOK_NAMES = Object.freeze( [
	'R_AliasMeshLookup', 'R_AliasMeshRemember',
	'R_DemonBakePrepare', 'R_DemonBakeRelease', 'R_DemonBakeStatus', 'R_DemonBakeSurface',
	'Axe_ParseRecord', 'Axe_ValidOwnerKey',
	'PowerVisionMode',
	'Respawn_ParseDrop', 'Respawn_ParsePlayer', 'Respawn_ParseRemains',
	'SV_AxeEntitySuppressed', 'SV_AxeFunctionEnter', 'SV_AxeFunctionLeave', 'SV_AxeGibSeen', 'SV_AxeReset',
	'SV_CheatsFrame', 'SV_CheatsInit',
	'SV_FaceFunctionEnter', 'SV_FaceFunctionLeave', 'SV_FaceReset', 'SV_FaceShotTrace',
	'SV_GoreOnSetModel',
	'SV_MeleeSprayEnter',
	'SV_PinnedZombieSpawned',
	'SV_BeginPortalTouch', 'SV_FinishPortalTouch', 'SV_PreparePortalTouch', 'SV_RestorePortalReceiver',
	'SV_PortalMoveEnd', 'SV_PortalMoveRead', 'SV_PortalMoveStart', 'SV_PortalMoveStepping',
	'SV_ProneZombieEnter', 'SV_ProneZombieLeave', 'SV_ZombieProne',
	'SV_QuadJumpBegin', 'SV_QuadJumpEnd', 'SV_QuadMovementScale',
	'Rend_ParseRecord', 'Rend_ValidRecord', 'SV_RendVeilClientRecord', 'SV_RendVeilHolding', 'SV_RendVeilTouchBegin', 'SV_RendVeilTouchEnd',
	'SV_RespawnCaptureTravel', 'SV_RespawnClearTravel', 'SV_RespawnDropTouch', 'SV_RespawnFinishTravel', 'SV_RespawnFrame', 'SV_RespawnFunctionEnter', 'SV_RespawnFunctionLeave', 'SV_RespawnInventoryStats', 'SV_RespawnPrecache', 'SV_RespawnReserveGuards', 'SV_RespawnRestoreDropModel', 'SV_RespawnView', 'SV_RespawnWorldStart', 'SV_SetRespawnEntryHook', 'SV_SetRespawnLandedHook', 'sv_respawnguard',
	'SV_LevelSnapshotEntities', 'SV_LiquidLinks', 'SV_SeamlessCloseReturn', 'SV_SeamlessCrossings', 'SV_SeamlessEnabled', 'SV_SeamlessEntryYaw', 'SV_SeamlessFrame', 'SV_SeamlessHolding', 'SV_SeamlessPending', 'SV_SeamlessPlacePlayer', 'SV_SeamlessSetup', 'SV_SeamlessUseModels', 'SV_SetLiquidLinks', 'SV_SetWarmLevel',
	'SV_ShotDelayRun', 'sv_shotdelay',
	'SV_UnseenFrame', 'SV_UnseenFunctionEnter', 'SV_UnseenFunctionLeave',
	'R_AnimSetClassicPass', 'R_ClassicPassActive', 'R_IsNewer', 'R_NewerGame', 'R_NewerLightingActive', 'r_newer_crates', 'r_newer_enemies', 'r_newer_hud', 'r_newer_lighting', 'r_newer_normals', 'r_newer_portals', 'r_newer_shadows', 'r_newer_textures', 'r_newer_water',
	'Face_Assign', 'Face_ParseSeed', 'Face_Seed',
	'R_BoxInPortalReceiver', 'R_BuildPortals', 'R_GetPortals', 'R_ImpactPortalPlanes', 'R_LevelPortalMatrix', 'R_PortalMaterial', 'R_PortalNoteVisible', 'R_PortalsActive', 'R_PortalsBeginFrame', 'R_RenderPortals', 'r_portals',
	'R_BuildSunOccluder', 'R_BuildWorldLights', 'R_DynResScale', 'R_FireFlicker', 'R_GetLiquidLinks', 'R_GetWorldLights', 'R_GlowBoostForTexture', 'R_IsWaterTextureName', 'R_LiquidOpacity', 'R_MapHasSky', 'R_PointShadowStatus', 'R_PostActive', 'R_PostBegin', 'R_PostBind', 'R_PostFinish', 'R_PostInstallGBufferPatch', 'R_PostLightsFrame', 'R_PostNoteSky', 'R_PostSetPortraitLight', 'R_PostSetSplit', 'R_PostSetUnderwater', 'R_RefreshDetail', 'R_RegisterDetail', 'R_RegisterGlow', 'R_WaterActive', 'R_WaterProbesFrame', 'R_WaterStartupStatus', 'SUN_SHADOW_LAYER', 'classicLook', 'r_bloom', 'r_bounce', 'r_caustics', 'r_cloudspeed', 'r_dynres', 'r_fps_target', 'r_hdr', 'r_heathaze', 'r_mist', 'r_newbright', 'r_newcontrast', 'r_newdark', 'r_newedges', 'r_pillars', 'r_pointshadows', 'r_reflect', 'r_reflect_screen', 'r_volumetric', 'r_water_look',
	'R_AliasPoseBlend', 'R_AnimEnabled', 'R_BlendArrays', 'R_SmoothMove', 'r_lerpmodels',
	'R_ArchHiddenRevision', 'R_ArchModelHidden', 'R_ArchSurfaceHidden', 'R_HasArchHidden',
	'R_AxeCorpsesFrame', 'R_ClearAxeCorpses',
	'R_ClassicMaterial', 'R_SaveClassicScene',
	'R_CratePlan', 'R_IsCrateSide',
	'R_DecalBloodLanded', 'R_DecalBloodPool', 'R_DecalBloodSpray', 'R_DecalGibTrack', 'R_DecalScorch', 'R_DecalShot', 'R_DecalsClear', 'R_DecalsFrame', 'R_DecalsSetup', 'r_decals',
	'DEMON_TEXTURES', 'R_DemonSurfaceData',
	'R_DemoSplitActive', 'R_DemoSplitClassic', 'R_DemoSplitEnd', 'R_DemoSplitFull', 'R_DemoSplitRelease', 'R_DemoSplitStart', 'r_demosplit',
	'R_DofClear', 'R_DofFrame', 'R_DofSetup', 'r_dof',
	'R_FireballClear', 'R_FireballFrame', 'R_FireballReplacesSprite', 'R_FireballSetup', 'R_FireballSpawn', 'R_SmokeTrail', 'r_fireball', 'r_fireballalpha', 'r_smoketrails',
	'R_FlashlightBeam', 'R_FlashlightInit', 'R_FlashlightToggle', 'R_FlashlightUpdate', 'r_flashlight',
	'R_FlashlightNewRun', 'R_FlashlightRunEnd', 'R_FlashlightRunLoaded', 'R_FlashlightRunMap', 'R_FlashlightSkillSelected',
	'R_HeightShadowScope', 'r_heightshadows',
	'R_ImpactMissile', 'R_ImpactRippleFrame', 'R_ImpactRippleListen', 'R_ImpactRippleReset', 'R_ImpactRipplesSetup', 'r_impactripples',
	'R_LevelViewUseSnapshots', 'R_SetupLevelViews', 'R_SyncLevelViews', 'R_UpdateLevelViewEntities',
	'LIGHTNING', 'R_LightningClear', 'R_LightningFrame', 'R_LightningSetup', 'R_LightningTakesBeam', 'r_newer_lightning',
	'R_MistClear', 'R_MistFrame',
	'R_MuzzleFlashFired', 'R_MuzzleFlashScale', 'R_MuzzleSetProbe', 'R_MuzzleSetView', 'R_MuzzleView',
	'R_AssetAliasMaterial', 'R_CloneAliasMaterial', 'R_EnemyAliasMaterial', 'R_HeldVisionTag', 'R_NewerAliasMaterial', 'R_NewerSkinsMaterials', 'R_NewerSkinsNewMap', 'R_NewerSkinsPrepare', 'R_NewerSkinsStatus', 'R_NewerSkinsTextures', 'R_ReleaseAliasReceiver', 'r_newer_variety',
	'R_ClassicTexture', 'R_NewerNormalsPrepare', 'R_NewerNormalsStatus', 'R_NewerTextureUpgrade', 'R_NewerTexturesFrame', 'R_NewerTexturesStatus',
	'R_PerfFpsText', 'R_PerfFrameBegin', 'R_PerfFrameEnd', 'R_PerfInit', 'R_PerfProfiling', 'R_PerfScreenLines', 'R_PerfStage', 'R_PerfStop', 'cl_showfps',
	'R_PowerupBegin', 'R_PowerupClear', 'R_PowerupEnd', 'R_PowerupSeen', 'r_powerups',
	'R_PowerVisionReset',
	'R_WarmFrame', 'R_WarmLevel',
	'R_QuadVisionActive', 'R_QuadVisionReset',
	'R_RendVeilBegin', 'R_RendVeilCapture', 'R_RendVeilClear', 'R_RendVeilEnd', 'R_RendVeilRelease', 'R_RendVeilSeen',
	'R_RespawnCameraFrame',
	'R_RockfieldBrushSeen', 'R_RockfieldBuild', 'R_RockfieldChart', 'R_RockfieldGeometry', 'R_RockfieldSetLimits', 'R_RockfieldStatus', 'R_RockfieldUpdate', 'r_rockfield',
	'R_ScreenDropsBloodAt', 'R_ScreenDropsReset', 'R_ScreenDropsSetView', 'R_ScreenDropsView',
	'R_CompileSceneAsync', 'R_ShaderAssetStamp',
	'R_ShellShot', 'R_ShellsFrame', 'R_ShellsNewMap', 'R_ShellsReset', 'R_ShellsRestore', 'R_ShellsSetup', 'R_ShellsSnapshot',
	'R_ShellTrace',
	'R_ShotgunClear', 'R_ShotgunFrame', 'R_ShotgunSetup', 'r_shotgunfx', 'viewModelMuzzles',
	'R_TeleportFrameEnd',
	'R_TorchFire', 'R_TorchFireBegin', 'R_TorchFireClear', 'R_TorchFireFlush', 'R_TorchFireSetup', 'TORCH_HANDLE', 'TORCH_WHOLE', 'r_torchfire', 'torchParts',
	'R_AliasFrameBox', 'R_WallBurnClear', 'R_WallBurnFrame', 'R_WallBurnSetup', 'R_WallBurnShot', 'r_newer_wallburn',
	'R_WaveImpact', 'R_WavesFrame', 'R_WavesReset', 'R_WavesSetup',
	'R_PlayerSurfaceBlood', 'R_WeaponSurfaceBloodAt', 'R_WeaponSurfaceContext', 'R_WeaponSurfaceFrame', 'weaponSurface',
	'R_WeaponAsset', 'R_WeaponHeldPullback', 'R_WeaponMaterials', 'R_WeaponRotorFrame', 'R_WeaponStatus', 'R_WeaponTextures', 'R_WeaponsEnabled', 'R_WeaponsPreload', 'r_newer_weapons',
	'V_ShamblerStepShake', 'v_shamblersteps',
	'S_UpdateAmbientMusic',
	'S_AmbientMusicNotifyCombat', 'S_AmbientMusicShutdown', 'S_AmbientMusicStop', 'S_AmbientMusicUnlock',
	'S_ExitMachineFalloff',
	'BuildMenuTextArt', 'BuildSinglePlayerMenuArt',
	'MainMenu_Begin', 'MainMenu_Destroy', 'MainMenu_End', 'MainMenu_Glyph', 'MainMenu_Image', 'MainMenu_Panel', 'MainMenu_SetInGame', 'MainMenu_SetVisible', 'MainMenu_Skinned', 'MainMenu_Slider', 'MainMenu_Text', 'MainMenu_TextBox',
	'NEWER_ENABLED_FEATURES',
	'R_BestiaryApplyCamera', 'R_BestiaryFrame', 'R_BestiaryFrozen', 'R_BestiaryInputLocked', 'R_BestiaryKey', 'R_BestiaryObserve', 'R_BestiaryPortraitLight', 'R_BestiaryTimeScale',
	'R_BestiaryBookCorner', 'R_BestiaryBookDraw', 'R_BestiaryBookKey', 'R_BestiaryBookOpen', 'R_BestiaryBookTouch', 'R_BestiaryEncounterDraw',
	'R_DemoLoadingAttract', 'R_DemoLoadingCancel', 'R_DemoLoadingConsoleClosed', 'R_DemoLoadingConsoleDrawn', 'R_DemoLoadingConsoleOverride', 'R_DemoLoadingConsoleSpeed', 'R_DemoLoadingFrame', 'R_DemoLoadingFreeze', 'R_DemoLoadingHolding', 'R_DemoLoadingWelcome', 'R_IntroLoadingHolding', 'R_IntroReadinessChecks', 'R_WelcomeLoadingHolding',
	'R_FaceDamage', 'R_FaceGameReset', 'R_FaceHealthChanged', 'R_FaceInventory', 'R_FaceSecret', 'R_PlayerFaceFrame',
	'R_NewerHudCanvas', 'R_NewerHudPreload', 'R_NewerHudStatus',
	'R_PlayerFaceCompose', 'R_PlayerFacePreload',
	'Respawn_NoticeAt',
	'Draw_StudioLogo',
] );

let _installed = false;

/**
 * Whether `Hooks_Install` has filled the hooks (`src/newer/install.js` checks it to install once).
 *
 * @returns {boolean} true once installed, for the rest of the page's or process's life
 */
export function Hooks_Installed() {

	return _installed;

}

/**
 * Fills every hook from Newer's table, once.
 *
 * @param {Record<string, unknown>} table one entry per hook name
 * @throws {Error} when a hook is missing from `table` or `table` names one this module does not declare
 */
export function Hooks_Install( table ) {

	const missing = HOOK_NAMES.filter( n => ! Object.hasOwn( table, n ) ), unknown = Object.keys( table ).filter( n => ! HOOK_NAMES.includes( n ) );
	if ( missing.length > 0 || unknown.length > 0 ) throw new Error( `Hooks_Install: missing ${missing.join( ', ' ) || 'none'}; unknown ${unknown.join( ', ' ) || 'none'}` );
	R_AliasMeshLookup = table.R_AliasMeshLookup; R_AliasMeshRemember = table.R_AliasMeshRemember;
	R_DemonBakePrepare = table.R_DemonBakePrepare; R_DemonBakeRelease = table.R_DemonBakeRelease; R_DemonBakeStatus = table.R_DemonBakeStatus; R_DemonBakeSurface = table.R_DemonBakeSurface;
	Axe_ParseRecord = table.Axe_ParseRecord; Axe_ValidOwnerKey = table.Axe_ValidOwnerKey;
	PowerVisionMode = table.PowerVisionMode;
	Respawn_ParseDrop = table.Respawn_ParseDrop; Respawn_ParsePlayer = table.Respawn_ParsePlayer; Respawn_ParseRemains = table.Respawn_ParseRemains;
	SV_AxeEntitySuppressed = table.SV_AxeEntitySuppressed; SV_AxeFunctionEnter = table.SV_AxeFunctionEnter; SV_AxeFunctionLeave = table.SV_AxeFunctionLeave; SV_AxeGibSeen = table.SV_AxeGibSeen; SV_AxeReset = table.SV_AxeReset;
	SV_CheatsFrame = table.SV_CheatsFrame; SV_CheatsInit = table.SV_CheatsInit;
	SV_FaceFunctionEnter = table.SV_FaceFunctionEnter; SV_FaceFunctionLeave = table.SV_FaceFunctionLeave; SV_FaceReset = table.SV_FaceReset; SV_FaceShotTrace = table.SV_FaceShotTrace;
	SV_GoreOnSetModel = table.SV_GoreOnSetModel;
	SV_MeleeSprayEnter = table.SV_MeleeSprayEnter;
	SV_PinnedZombieSpawned = table.SV_PinnedZombieSpawned;
	SV_BeginPortalTouch = table.SV_BeginPortalTouch; SV_FinishPortalTouch = table.SV_FinishPortalTouch; SV_PreparePortalTouch = table.SV_PreparePortalTouch; SV_RestorePortalReceiver = table.SV_RestorePortalReceiver;
	SV_PortalMoveEnd = table.SV_PortalMoveEnd; SV_PortalMoveRead = table.SV_PortalMoveRead; SV_PortalMoveStart = table.SV_PortalMoveStart; SV_PortalMoveStepping = table.SV_PortalMoveStepping;
	SV_ProneZombieEnter = table.SV_ProneZombieEnter; SV_ProneZombieLeave = table.SV_ProneZombieLeave; SV_ZombieProne = table.SV_ZombieProne;
	SV_QuadJumpBegin = table.SV_QuadJumpBegin; SV_QuadJumpEnd = table.SV_QuadJumpEnd; SV_QuadMovementScale = table.SV_QuadMovementScale;
	Rend_ParseRecord = table.Rend_ParseRecord; Rend_ValidRecord = table.Rend_ValidRecord; SV_RendVeilClientRecord = table.SV_RendVeilClientRecord; SV_RendVeilHolding = table.SV_RendVeilHolding; SV_RendVeilTouchBegin = table.SV_RendVeilTouchBegin; SV_RendVeilTouchEnd = table.SV_RendVeilTouchEnd;
	SV_RespawnCaptureTravel = table.SV_RespawnCaptureTravel; SV_RespawnClearTravel = table.SV_RespawnClearTravel; SV_RespawnDropTouch = table.SV_RespawnDropTouch; SV_RespawnFinishTravel = table.SV_RespawnFinishTravel; SV_RespawnFrame = table.SV_RespawnFrame; SV_RespawnFunctionEnter = table.SV_RespawnFunctionEnter; SV_RespawnFunctionLeave = table.SV_RespawnFunctionLeave; SV_RespawnInventoryStats = table.SV_RespawnInventoryStats; SV_RespawnPrecache = table.SV_RespawnPrecache; SV_RespawnReserveGuards = table.SV_RespawnReserveGuards; SV_RespawnRestoreDropModel = table.SV_RespawnRestoreDropModel; SV_RespawnView = table.SV_RespawnView; SV_RespawnWorldStart = table.SV_RespawnWorldStart; SV_SetRespawnEntryHook = table.SV_SetRespawnEntryHook; SV_SetRespawnLandedHook = table.SV_SetRespawnLandedHook; sv_respawnguard = table.sv_respawnguard;
	SV_LevelSnapshotEntities = table.SV_LevelSnapshotEntities; SV_LiquidLinks = table.SV_LiquidLinks; SV_SeamlessCloseReturn = table.SV_SeamlessCloseReturn; SV_SeamlessCrossings = table.SV_SeamlessCrossings; SV_SeamlessEnabled = table.SV_SeamlessEnabled; SV_SeamlessEntryYaw = table.SV_SeamlessEntryYaw; SV_SeamlessFrame = table.SV_SeamlessFrame; SV_SeamlessHolding = table.SV_SeamlessHolding; SV_SeamlessPending = table.SV_SeamlessPending; SV_SeamlessPlacePlayer = table.SV_SeamlessPlacePlayer; SV_SeamlessSetup = table.SV_SeamlessSetup; SV_SeamlessUseModels = table.SV_SeamlessUseModels; SV_SetLiquidLinks = table.SV_SetLiquidLinks; SV_SetWarmLevel = table.SV_SetWarmLevel;
	SV_ShotDelayRun = table.SV_ShotDelayRun; sv_shotdelay = table.sv_shotdelay;
	SV_UnseenFrame = table.SV_UnseenFrame; SV_UnseenFunctionEnter = table.SV_UnseenFunctionEnter; SV_UnseenFunctionLeave = table.SV_UnseenFunctionLeave;
	R_AnimSetClassicPass = table.R_AnimSetClassicPass; R_ClassicPassActive = table.R_ClassicPassActive; R_IsNewer = table.R_IsNewer; R_NewerGame = table.R_NewerGame; R_NewerLightingActive = table.R_NewerLightingActive; r_newer_crates = table.r_newer_crates; r_newer_enemies = table.r_newer_enemies; r_newer_hud = table.r_newer_hud; r_newer_lighting = table.r_newer_lighting; r_newer_normals = table.r_newer_normals; r_newer_portals = table.r_newer_portals; r_newer_shadows = table.r_newer_shadows; r_newer_textures = table.r_newer_textures; r_newer_water = table.r_newer_water;
	Face_Assign = table.Face_Assign; Face_ParseSeed = table.Face_ParseSeed; Face_Seed = table.Face_Seed;
	R_BoxInPortalReceiver = table.R_BoxInPortalReceiver; R_BuildPortals = table.R_BuildPortals; R_GetPortals = table.R_GetPortals; R_ImpactPortalPlanes = table.R_ImpactPortalPlanes; R_LevelPortalMatrix = table.R_LevelPortalMatrix; R_PortalMaterial = table.R_PortalMaterial; R_PortalNoteVisible = table.R_PortalNoteVisible; R_PortalsActive = table.R_PortalsActive; R_PortalsBeginFrame = table.R_PortalsBeginFrame; R_RenderPortals = table.R_RenderPortals; r_portals = table.r_portals;
	R_BuildSunOccluder = table.R_BuildSunOccluder; R_BuildWorldLights = table.R_BuildWorldLights; R_DynResScale = table.R_DynResScale; R_FireFlicker = table.R_FireFlicker; R_GetLiquidLinks = table.R_GetLiquidLinks; R_GetWorldLights = table.R_GetWorldLights; R_GlowBoostForTexture = table.R_GlowBoostForTexture; R_IsWaterTextureName = table.R_IsWaterTextureName; R_LiquidOpacity = table.R_LiquidOpacity; R_MapHasSky = table.R_MapHasSky; R_PointShadowStatus = table.R_PointShadowStatus; R_PostActive = table.R_PostActive; R_PostBegin = table.R_PostBegin; R_PostBind = table.R_PostBind; R_PostFinish = table.R_PostFinish; R_PostInstallGBufferPatch = table.R_PostInstallGBufferPatch; R_PostLightsFrame = table.R_PostLightsFrame; R_PostNoteSky = table.R_PostNoteSky; R_PostSetPortraitLight = table.R_PostSetPortraitLight; R_PostSetSplit = table.R_PostSetSplit; R_PostSetUnderwater = table.R_PostSetUnderwater; R_RefreshDetail = table.R_RefreshDetail; R_RegisterDetail = table.R_RegisterDetail; R_RegisterGlow = table.R_RegisterGlow; R_WaterActive = table.R_WaterActive; R_WaterProbesFrame = table.R_WaterProbesFrame; R_WaterStartupStatus = table.R_WaterStartupStatus; SUN_SHADOW_LAYER = table.SUN_SHADOW_LAYER; classicLook = table.classicLook; r_bloom = table.r_bloom; r_bounce = table.r_bounce; r_caustics = table.r_caustics; r_cloudspeed = table.r_cloudspeed; r_dynres = table.r_dynres; r_fps_target = table.r_fps_target; r_hdr = table.r_hdr; r_heathaze = table.r_heathaze; r_mist = table.r_mist; r_newbright = table.r_newbright; r_newcontrast = table.r_newcontrast; r_newdark = table.r_newdark; r_newedges = table.r_newedges; r_pillars = table.r_pillars; r_pointshadows = table.r_pointshadows; r_reflect = table.r_reflect; r_reflect_screen = table.r_reflect_screen; r_volumetric = table.r_volumetric; r_water_look = table.r_water_look;
	R_AliasPoseBlend = table.R_AliasPoseBlend; R_AnimEnabled = table.R_AnimEnabled; R_BlendArrays = table.R_BlendArrays; R_SmoothMove = table.R_SmoothMove; r_lerpmodels = table.r_lerpmodels;
	R_ArchHiddenRevision = table.R_ArchHiddenRevision; R_ArchModelHidden = table.R_ArchModelHidden; R_ArchSurfaceHidden = table.R_ArchSurfaceHidden; R_HasArchHidden = table.R_HasArchHidden;
	R_AxeCorpsesFrame = table.R_AxeCorpsesFrame; R_ClearAxeCorpses = table.R_ClearAxeCorpses;
	R_ClassicMaterial = table.R_ClassicMaterial; R_SaveClassicScene = table.R_SaveClassicScene;
	R_CratePlan = table.R_CratePlan; R_IsCrateSide = table.R_IsCrateSide;
	R_DecalBloodLanded = table.R_DecalBloodLanded; R_DecalBloodPool = table.R_DecalBloodPool; R_DecalBloodSpray = table.R_DecalBloodSpray; R_DecalGibTrack = table.R_DecalGibTrack; R_DecalScorch = table.R_DecalScorch; R_DecalShot = table.R_DecalShot; R_DecalsClear = table.R_DecalsClear; R_DecalsFrame = table.R_DecalsFrame; R_DecalsSetup = table.R_DecalsSetup; r_decals = table.r_decals;
	DEMON_TEXTURES = table.DEMON_TEXTURES; R_DemonSurfaceData = table.R_DemonSurfaceData;
	R_DemoSplitActive = table.R_DemoSplitActive; R_DemoSplitClassic = table.R_DemoSplitClassic; R_DemoSplitEnd = table.R_DemoSplitEnd; R_DemoSplitFull = table.R_DemoSplitFull; R_DemoSplitRelease = table.R_DemoSplitRelease; R_DemoSplitStart = table.R_DemoSplitStart; r_demosplit = table.r_demosplit;
	R_DofClear = table.R_DofClear; R_DofFrame = table.R_DofFrame; R_DofSetup = table.R_DofSetup; r_dof = table.r_dof;
	R_FireballClear = table.R_FireballClear; R_FireballFrame = table.R_FireballFrame; R_FireballReplacesSprite = table.R_FireballReplacesSprite; R_FireballSetup = table.R_FireballSetup; R_FireballSpawn = table.R_FireballSpawn; R_SmokeTrail = table.R_SmokeTrail; r_fireball = table.r_fireball; r_fireballalpha = table.r_fireballalpha; r_smoketrails = table.r_smoketrails;
	R_FlashlightBeam = table.R_FlashlightBeam; R_FlashlightInit = table.R_FlashlightInit; R_FlashlightToggle = table.R_FlashlightToggle; R_FlashlightUpdate = table.R_FlashlightUpdate; r_flashlight = table.r_flashlight;
	R_FlashlightNewRun = table.R_FlashlightNewRun; R_FlashlightRunEnd = table.R_FlashlightRunEnd; R_FlashlightRunLoaded = table.R_FlashlightRunLoaded; R_FlashlightRunMap = table.R_FlashlightRunMap; R_FlashlightSkillSelected = table.R_FlashlightSkillSelected;
	R_HeightShadowScope = table.R_HeightShadowScope; r_heightshadows = table.r_heightshadows;
	R_ImpactMissile = table.R_ImpactMissile; R_ImpactRippleFrame = table.R_ImpactRippleFrame; R_ImpactRippleListen = table.R_ImpactRippleListen; R_ImpactRippleReset = table.R_ImpactRippleReset; R_ImpactRipplesSetup = table.R_ImpactRipplesSetup; r_impactripples = table.r_impactripples;
	R_LevelViewUseSnapshots = table.R_LevelViewUseSnapshots; R_SetupLevelViews = table.R_SetupLevelViews; R_SyncLevelViews = table.R_SyncLevelViews; R_UpdateLevelViewEntities = table.R_UpdateLevelViewEntities;
	LIGHTNING = table.LIGHTNING; R_LightningClear = table.R_LightningClear; R_LightningFrame = table.R_LightningFrame; R_LightningSetup = table.R_LightningSetup; R_LightningTakesBeam = table.R_LightningTakesBeam; r_newer_lightning = table.r_newer_lightning;
	R_MistClear = table.R_MistClear; R_MistFrame = table.R_MistFrame;
	R_MuzzleFlashFired = table.R_MuzzleFlashFired; R_MuzzleFlashScale = table.R_MuzzleFlashScale; R_MuzzleSetProbe = table.R_MuzzleSetProbe; R_MuzzleSetView = table.R_MuzzleSetView; R_MuzzleView = table.R_MuzzleView;
	R_AssetAliasMaterial = table.R_AssetAliasMaterial; R_CloneAliasMaterial = table.R_CloneAliasMaterial; R_EnemyAliasMaterial = table.R_EnemyAliasMaterial; R_HeldVisionTag = table.R_HeldVisionTag; R_NewerAliasMaterial = table.R_NewerAliasMaterial; R_NewerSkinsMaterials = table.R_NewerSkinsMaterials; R_NewerSkinsNewMap = table.R_NewerSkinsNewMap; R_NewerSkinsPrepare = table.R_NewerSkinsPrepare; R_NewerSkinsStatus = table.R_NewerSkinsStatus; R_NewerSkinsTextures = table.R_NewerSkinsTextures; R_ReleaseAliasReceiver = table.R_ReleaseAliasReceiver; r_newer_variety = table.r_newer_variety;
	R_ClassicTexture = table.R_ClassicTexture; R_NewerNormalsPrepare = table.R_NewerNormalsPrepare; R_NewerNormalsStatus = table.R_NewerNormalsStatus; R_NewerTextureUpgrade = table.R_NewerTextureUpgrade; R_NewerTexturesFrame = table.R_NewerTexturesFrame; R_NewerTexturesStatus = table.R_NewerTexturesStatus;
	R_PerfFpsText = table.R_PerfFpsText; R_PerfFrameBegin = table.R_PerfFrameBegin; R_PerfFrameEnd = table.R_PerfFrameEnd; R_PerfInit = table.R_PerfInit; R_PerfProfiling = table.R_PerfProfiling; R_PerfScreenLines = table.R_PerfScreenLines; R_PerfStage = table.R_PerfStage; R_PerfStop = table.R_PerfStop; cl_showfps = table.cl_showfps;
	R_PowerupBegin = table.R_PowerupBegin; R_PowerupClear = table.R_PowerupClear; R_PowerupEnd = table.R_PowerupEnd; R_PowerupSeen = table.R_PowerupSeen; r_powerups = table.r_powerups;
	R_PowerVisionReset = table.R_PowerVisionReset;
	R_WarmFrame = table.R_WarmFrame; R_WarmLevel = table.R_WarmLevel;
	R_QuadVisionActive = table.R_QuadVisionActive; R_QuadVisionReset = table.R_QuadVisionReset;
	R_RendVeilBegin = table.R_RendVeilBegin; R_RendVeilCapture = table.R_RendVeilCapture; R_RendVeilClear = table.R_RendVeilClear; R_RendVeilEnd = table.R_RendVeilEnd; R_RendVeilRelease = table.R_RendVeilRelease; R_RendVeilSeen = table.R_RendVeilSeen;
	R_RespawnCameraFrame = table.R_RespawnCameraFrame;
	R_RockfieldBrushSeen = table.R_RockfieldBrushSeen; R_RockfieldBuild = table.R_RockfieldBuild; R_RockfieldChart = table.R_RockfieldChart; R_RockfieldGeometry = table.R_RockfieldGeometry; R_RockfieldSetLimits = table.R_RockfieldSetLimits; R_RockfieldStatus = table.R_RockfieldStatus; R_RockfieldUpdate = table.R_RockfieldUpdate; r_rockfield = table.r_rockfield;
	R_ScreenDropsBloodAt = table.R_ScreenDropsBloodAt; R_ScreenDropsReset = table.R_ScreenDropsReset; R_ScreenDropsSetView = table.R_ScreenDropsSetView; R_ScreenDropsView = table.R_ScreenDropsView;
	R_CompileSceneAsync = table.R_CompileSceneAsync; R_ShaderAssetStamp = table.R_ShaderAssetStamp;
	R_ShellShot = table.R_ShellShot; R_ShellsFrame = table.R_ShellsFrame; R_ShellsNewMap = table.R_ShellsNewMap; R_ShellsReset = table.R_ShellsReset; R_ShellsRestore = table.R_ShellsRestore; R_ShellsSetup = table.R_ShellsSetup; R_ShellsSnapshot = table.R_ShellsSnapshot;
	R_ShellTrace = table.R_ShellTrace;
	R_ShotgunClear = table.R_ShotgunClear; R_ShotgunFrame = table.R_ShotgunFrame; R_ShotgunSetup = table.R_ShotgunSetup; r_shotgunfx = table.r_shotgunfx; viewModelMuzzles = table.viewModelMuzzles;
	R_TeleportFrameEnd = table.R_TeleportFrameEnd;
	R_TorchFire = table.R_TorchFire; R_TorchFireBegin = table.R_TorchFireBegin; R_TorchFireClear = table.R_TorchFireClear; R_TorchFireFlush = table.R_TorchFireFlush; R_TorchFireSetup = table.R_TorchFireSetup; TORCH_HANDLE = table.TORCH_HANDLE; TORCH_WHOLE = table.TORCH_WHOLE; r_torchfire = table.r_torchfire; torchParts = table.torchParts;
	R_AliasFrameBox = table.R_AliasFrameBox; R_WallBurnClear = table.R_WallBurnClear; R_WallBurnFrame = table.R_WallBurnFrame; R_WallBurnSetup = table.R_WallBurnSetup; R_WallBurnShot = table.R_WallBurnShot; r_newer_wallburn = table.r_newer_wallburn;
	R_WaveImpact = table.R_WaveImpact; R_WavesFrame = table.R_WavesFrame; R_WavesReset = table.R_WavesReset; R_WavesSetup = table.R_WavesSetup;
	R_PlayerSurfaceBlood = table.R_PlayerSurfaceBlood; R_WeaponSurfaceBloodAt = table.R_WeaponSurfaceBloodAt; R_WeaponSurfaceContext = table.R_WeaponSurfaceContext; R_WeaponSurfaceFrame = table.R_WeaponSurfaceFrame; weaponSurface = table.weaponSurface;
	R_WeaponAsset = table.R_WeaponAsset; R_WeaponHeldPullback = table.R_WeaponHeldPullback; R_WeaponMaterials = table.R_WeaponMaterials; R_WeaponRotorFrame = table.R_WeaponRotorFrame; R_WeaponStatus = table.R_WeaponStatus; R_WeaponTextures = table.R_WeaponTextures; R_WeaponsEnabled = table.R_WeaponsEnabled; R_WeaponsPreload = table.R_WeaponsPreload; r_newer_weapons = table.r_newer_weapons;
	V_ShamblerStepShake = table.V_ShamblerStepShake; v_shamblersteps = table.v_shamblersteps;
	S_UpdateAmbientMusic = table.S_UpdateAmbientMusic;
	S_AmbientMusicNotifyCombat = table.S_AmbientMusicNotifyCombat; S_AmbientMusicShutdown = table.S_AmbientMusicShutdown; S_AmbientMusicStop = table.S_AmbientMusicStop; S_AmbientMusicUnlock = table.S_AmbientMusicUnlock;
	S_ExitMachineFalloff = table.S_ExitMachineFalloff;
	BuildMenuTextArt = table.BuildMenuTextArt; BuildSinglePlayerMenuArt = table.BuildSinglePlayerMenuArt;
	MainMenu_Begin = table.MainMenu_Begin; MainMenu_Destroy = table.MainMenu_Destroy; MainMenu_End = table.MainMenu_End; MainMenu_Glyph = table.MainMenu_Glyph; MainMenu_Image = table.MainMenu_Image; MainMenu_Panel = table.MainMenu_Panel; MainMenu_SetInGame = table.MainMenu_SetInGame; MainMenu_SetVisible = table.MainMenu_SetVisible; MainMenu_Skinned = table.MainMenu_Skinned; MainMenu_Slider = table.MainMenu_Slider; MainMenu_Text = table.MainMenu_Text; MainMenu_TextBox = table.MainMenu_TextBox;
	NEWER_ENABLED_FEATURES = table.NEWER_ENABLED_FEATURES;
	R_BestiaryApplyCamera = table.R_BestiaryApplyCamera; R_BestiaryFrame = table.R_BestiaryFrame; R_BestiaryFrozen = table.R_BestiaryFrozen; R_BestiaryInputLocked = table.R_BestiaryInputLocked; R_BestiaryKey = table.R_BestiaryKey; R_BestiaryObserve = table.R_BestiaryObserve; R_BestiaryPortraitLight = table.R_BestiaryPortraitLight; R_BestiaryTimeScale = table.R_BestiaryTimeScale;
	R_BestiaryBookCorner = table.R_BestiaryBookCorner; R_BestiaryBookDraw = table.R_BestiaryBookDraw; R_BestiaryBookKey = table.R_BestiaryBookKey; R_BestiaryBookOpen = table.R_BestiaryBookOpen; R_BestiaryBookTouch = table.R_BestiaryBookTouch; R_BestiaryEncounterDraw = table.R_BestiaryEncounterDraw;
	R_DemoLoadingAttract = table.R_DemoLoadingAttract; R_DemoLoadingCancel = table.R_DemoLoadingCancel; R_DemoLoadingConsoleClosed = table.R_DemoLoadingConsoleClosed; R_DemoLoadingConsoleDrawn = table.R_DemoLoadingConsoleDrawn; R_DemoLoadingConsoleOverride = table.R_DemoLoadingConsoleOverride; R_DemoLoadingConsoleSpeed = table.R_DemoLoadingConsoleSpeed; R_DemoLoadingFrame = table.R_DemoLoadingFrame; R_DemoLoadingFreeze = table.R_DemoLoadingFreeze; R_DemoLoadingHolding = table.R_DemoLoadingHolding; R_DemoLoadingWelcome = table.R_DemoLoadingWelcome; R_IntroLoadingHolding = table.R_IntroLoadingHolding; R_IntroReadinessChecks = table.R_IntroReadinessChecks; R_WelcomeLoadingHolding = table.R_WelcomeLoadingHolding;
	R_FaceDamage = table.R_FaceDamage; R_FaceGameReset = table.R_FaceGameReset; R_FaceHealthChanged = table.R_FaceHealthChanged; R_FaceInventory = table.R_FaceInventory; R_FaceSecret = table.R_FaceSecret; R_PlayerFaceFrame = table.R_PlayerFaceFrame;
	R_NewerHudCanvas = table.R_NewerHudCanvas; R_NewerHudPreload = table.R_NewerHudPreload; R_NewerHudStatus = table.R_NewerHudStatus;
	R_PlayerFaceCompose = table.R_PlayerFaceCompose; R_PlayerFacePreload = table.R_PlayerFacePreload;
	Respawn_NoticeAt = table.Respawn_NoticeAt;
	Draw_StudioLogo = table.Draw_StudioLogo;
	_installed = true;

}
