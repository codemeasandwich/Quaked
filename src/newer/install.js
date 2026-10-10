/**
 * @module newer/install
 *
 * Plugs Newer Game into the engine: passes every Newer function, cvar, class and table the engine calls to
 * `Hooks_Install` (`src/engine/common/hooks.js`, card [44g], baseline debt D1b). Imported first by every entry point
 * that runs engine code; importing it twice installs once.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Loading it throws when `Hooks_Install` refuses its table (a hook missing from it, or a name `hooks.js` does not
 * declare), so a broken hook list fails at startup, not at the first call.
 */

import { Hooks_Install, Hooks_Installed } from '../engine/common/hooks.js';
import { R_AliasMeshLookup, R_AliasMeshRemember } from './assets/r_aliasmeshcache.js';
import { R_DemonBakePrepare, R_DemonBakeRelease, R_DemonBakeStatus, R_DemonBakeSurface } from './assets/r_demonbakes.js';
import { Axe_ParseRecord, Axe_ValidOwnerKey } from './gameplay/axe_record.js';
import { PowerVisionMode } from './gameplay/powervision_state.js';
import { Respawn_ParseDrop, Respawn_ParsePlayer, Respawn_ParseRemains } from './gameplay/respawn_record.js';
import { SV_AxeEntitySuppressed, SV_AxeFunctionEnter, SV_AxeFunctionLeave, SV_AxeGibSeen, SV_AxeReset } from './gameplay/sv_axecut.js';
import { SV_CheatsFrame, SV_CheatsInit } from './gameplay/sv_cheats.js';
import { SV_FaceFunctionEnter, SV_FaceFunctionLeave, SV_FaceReset, SV_FaceShotTrace } from './gameplay/sv_faceevents.js';
import { SV_GoreOnSetModel } from './gameplay/sv_gore.js';
import { SV_MeleeSprayEnter } from './gameplay/sv_meleespray.js';
import { SV_PinnedZombieSpawned } from './gameplay/sv_pinnedzombies.js';
import { SV_BeginPortalTouch, SV_FinishPortalTouch, SV_PreparePortalTouch, SV_RestorePortalReceiver } from './gameplay/sv_portal.js';
import { SV_PortalMoveEnd, SV_PortalMoveRead, SV_PortalMoveStart, SV_PortalMoveStepping } from './gameplay/sv_portalmotion.js';
import { SV_ProneZombieEnter, SV_ProneZombieLeave, SV_ZombieProne } from './gameplay/sv_pronezombie.js';
import { SV_QuadJumpBegin, SV_QuadJumpEnd, SV_QuadMovementScale } from './gameplay/sv_quadmovement.js';
import { Rend_ParseRecord, Rend_ValidRecord, SV_RendVeilClientRecord, SV_RendVeilHolding, SV_RendVeilTouchBegin, SV_RendVeilTouchEnd } from './gameplay/sv_rendveil.js';
import { SV_RespawnCaptureTravel, SV_RespawnClearTravel, SV_RespawnDropTouch, SV_RespawnFinishTravel, SV_RespawnFrame, SV_RespawnFunctionEnter, SV_RespawnFunctionLeave, SV_RespawnInventoryStats, SV_RespawnPrecache, SV_RespawnReserveGuards, SV_RespawnRestoreDropModel, SV_RespawnView, SV_RespawnWorldStart, SV_SetRespawnEntryHook, SV_SetRespawnLandedHook, sv_respawnguard } from './gameplay/sv_respawn.js';
import { SV_LevelSnapshotEntities, SV_LiquidLinks, SV_SeamlessCloseReturn, SV_SeamlessCrossings, SV_SeamlessEnabled, SV_SeamlessEntryYaw, SV_SeamlessFrame, SV_SeamlessHolding, SV_SeamlessPending, SV_SeamlessPlacePlayer, SV_SeamlessSetup, SV_SeamlessUseModels, SV_SetLiquidLinks, SV_SetWarmLevel } from './gameplay/sv_seamless.js';
import { SV_ShotDelayRun, sv_shotdelay } from './gameplay/sv_shotdelay.js';
import { SV_UnseenFrame, SV_UnseenFunctionEnter, SV_UnseenFunctionLeave } from './gameplay/sv_unseen.js';
import { R_AnimSetClassicPass, R_ClassicPassActive, R_IsNewer, R_NewerGame, R_NewerLightingActive, r_newer_crates, r_newer_enemies, r_newer_hud, r_newer_lighting, r_newer_normals, r_newer_portals, r_newer_shadows, r_newer_textures, r_newer_water } from './mode.js';
import { Face_Assign, Face_ParseSeed, Face_Seed } from './render/enemy_face.js';
import { R_BoxInPortalReceiver, R_BuildPortals, R_GetPortals, R_ImpactPortalPlanes, R_LevelPortalMatrix, R_PortalMaterial, R_PortalNoteVisible, R_PortalsActive, R_PortalsBeginFrame, R_RenderPortals, r_portals } from './render/gl_portal.js';
import { R_BuildSunOccluder, R_BuildWorldLights, R_DynResScale, R_FireFlicker, R_GetLiquidLinks, R_GetWorldLights, R_GlowBoostForTexture, R_IsWaterTextureName, R_LiquidOpacity, R_MapHasSky, R_PointShadowStatus, R_PostActive, R_PostBegin, R_PostBind, R_PostFinish, R_PostInstallGBufferPatch, R_PostLightsFrame, R_PostNoteSky, R_PostSetPortraitLight, R_PostSetSplit, R_PostSetUnderwater, R_RefreshDetail, R_RegisterDetail, R_RegisterGlow, R_WaterActive, R_WaterProbesFrame, R_WaterStartupStatus, SUN_SHADOW_LAYER, classicLook, r_bloom, r_bounce, r_caustics, r_cloudspeed, r_dynres, r_fps_target, r_hdr, r_heathaze, r_mist, r_newbright, r_newcontrast, r_newdark, r_newedges, r_pillars, r_pointshadows, r_reflect, r_reflect_screen, r_volumetric, r_water_look } from './render/gl_post.js';
import { R_AliasPoseBlend, R_AnimEnabled, R_BlendArrays, R_SmoothMove, r_lerpmodels } from './render/r_anim.js';
import { R_ArchHiddenRevision, R_ArchModelHidden, R_ArchSurfaceHidden, R_HasArchHidden } from './render/r_archframe.js';
import { R_AxeCorpsesFrame, R_ClearAxeCorpses } from './render/r_axecorpses.js';
import { R_ClassicMaterial, R_SaveClassicScene } from './render/r_classicstate.js';
import { R_CratePlan, R_IsCrateSide } from './render/r_cratevariants.js';
import { R_DecalBloodLanded, R_DecalBloodPool, R_DecalBloodSpray, R_DecalGibTrack, R_DecalScorch, R_DecalShot, R_DecalsClear, R_DecalsFrame, R_DecalsSetup, r_decals } from './render/r_decals.js';
import { DEMON_TEXTURES, R_DemonSurfaceData } from './render/r_demonrelief.js';
import { R_DemoSplitActive, R_DemoSplitClassic, R_DemoSplitEnd, R_DemoSplitFull, R_DemoSplitRelease, R_DemoSplitStart, r_demosplit } from './render/r_demosplit.js';
import { R_DofClear, R_DofFrame, R_DofSetup, r_dof } from './render/r_dof.js';
import { R_FireballClear, R_FireballFrame, R_FireballReplacesSprite, R_FireballSetup, R_FireballSpawn, R_SmokeTrail, r_fireball, r_fireballalpha, r_smoketrails } from './render/r_fireball.js';
import { R_FlashlightBeam, R_FlashlightInit, R_FlashlightToggle, R_FlashlightUpdate, r_flashlight } from './render/r_flashlight.js';
import { R_FlashlightNewRun, R_FlashlightRunEnd, R_FlashlightRunLoaded, R_FlashlightRunMap, R_FlashlightSkillSelected } from './render/r_flashlightrun.js';
import { R_HeightShadowScope, r_heightshadows } from './render/r_heightshadows.js';
import { R_ImpactMissile, R_ImpactRippleFrame, R_ImpactRippleListen, R_ImpactRippleReset, R_ImpactRipplesSetup, r_impactripples } from './render/r_impactripples.js';
import { R_LevelViewUseSnapshots, R_SetupLevelViews, R_SyncLevelViews, R_UpdateLevelViewEntities } from './render/r_levelview.js';
import { LIGHTNING, R_LightningClear, R_LightningFrame, R_LightningSetup, R_LightningTakesBeam, r_newer_lightning } from './render/r_lightning.js';
import { R_MistClear, R_MistFrame } from './render/r_mist.js';
import { R_MuzzleFlashFired, R_MuzzleFlashScale, R_MuzzleSetProbe, R_MuzzleSetView, R_MuzzleView } from './render/r_muzzle.js';
import { R_AssetAliasMaterial, R_CloneAliasMaterial, R_EnemyAliasMaterial, R_HeldVisionTag, R_NewerAliasMaterial, R_NewerSkinsMaterials, R_NewerSkinsNewMap, R_NewerSkinsPrepare, R_NewerSkinsStatus, R_NewerSkinsTextures, R_ReleaseAliasReceiver, r_newer_variety } from './render/r_newerskins.js';
import { R_ClassicTexture, R_NewerNormalsPrepare, R_NewerNormalsStatus, R_NewerTextureUpgrade, R_NewerTexturesFrame, R_NewerTexturesStatus } from './render/r_newertextures.js';
import { R_PerfFpsText, R_PerfFrameBegin, R_PerfFrameEnd, R_PerfInit, R_PerfProfiling, R_PerfScreenLines, R_PerfStage, R_PerfStop, cl_showfps } from './render/r_perf.js';
import { R_PowerupBegin, R_PowerupClear, R_PowerupEnd, R_PowerupSeen, r_powerups } from './render/r_powerups.js';
import { R_PowerVisionReset } from './render/r_powervision.js';
import { R_WarmFrame, R_WarmLevel } from './render/r_prewarm.js';
import { R_QuadVisionActive, R_QuadVisionReset } from './render/r_quadvision.js';
import { R_RendVeilBegin, R_RendVeilCapture, R_RendVeilClear, R_RendVeilEnd, R_RendVeilRelease, R_RendVeilSeen } from './render/r_rendveil.js';
import { R_RespawnCameraFrame } from './render/r_respawn.js';
import { R_RockfieldBrushSeen, R_RockfieldBuild, R_RockfieldChart, R_RockfieldGeometry, R_RockfieldSetLimits, R_RockfieldStatus, R_RockfieldUpdate, r_rockfield } from './render/r_rockfield.js';
import { R_ScreenDropsBloodAt, R_ScreenDropsReset, R_ScreenDropsSetView, R_ScreenDropsView } from './render/r_screendrops.js';
import { R_CompileSceneAsync, R_ShaderAssetStamp } from './render/r_shaderwarm.js';
import { R_ShellShot, R_ShellsFrame, R_ShellsNewMap, R_ShellsReset, R_ShellsRestore, R_ShellsSetup, R_ShellsSnapshot } from './render/r_shells.js';
import { R_ShellTrace } from './render/r_shelltrace.js';
import { R_ShotgunClear, R_ShotgunFrame, R_ShotgunSetup, r_shotgunfx, viewModelMuzzles } from './render/r_shotgun.js';
import { R_TeleportFrameEnd } from './render/r_teleportfx.js';
import { R_TorchFire, R_TorchFireBegin, R_TorchFireClear, R_TorchFireFlush, R_TorchFireSetup, TORCH_HANDLE, TORCH_WHOLE, r_torchfire, torchParts } from './render/r_torchfire.js';
import { R_AliasFrameBox, R_WallBurnClear, R_WallBurnFrame, R_WallBurnSetup, R_WallBurnShot, r_newer_wallburn } from './render/r_wallburn.js';
import { R_WaveImpact, R_WavesFrame, R_WavesReset, R_WavesSetup } from './render/r_waves.js';
import { R_PlayerSurfaceBlood, R_WeaponSurfaceBloodAt, R_WeaponSurfaceContext, R_WeaponSurfaceFrame, weaponSurface } from './render/r_weapon_surface.js';
import { R_WeaponAsset, R_WeaponHeldPullback, R_WeaponMaterials, R_WeaponRotorFrame, R_WeaponStatus, R_WeaponTextures, R_WeaponsEnabled, R_WeaponsPreload, r_newer_weapons } from './render/r_weapons.js';
import { V_ShamblerStepShake, v_shamblersteps } from './render/v_shamblersteps.js';
import { S_UpdateAmbientMusic } from './sound/s_ambientgame.js';
import { S_AmbientMusicNotifyCombat, S_AmbientMusicShutdown, S_AmbientMusicStop, S_AmbientMusicUnlock } from './sound/s_ambientmusic.js';
import { S_ExitMachineFalloff } from './sound/s_exitmachine.js';
import { BuildMenuTextArt, BuildSinglePlayerMenuArt } from './ui/menu_art.js';
import { MainMenu_Begin, MainMenu_Destroy, MainMenu_End, MainMenu_Glyph, MainMenu_Image, MainMenu_Panel, MainMenu_SetInGame, MainMenu_SetVisible, MainMenu_Skinned, MainMenu_Slider, MainMenu_Text, MainMenu_TextBox } from './ui/menu_webgl.js';
import { NEWER_ENABLED_FEATURES } from './ui/newer_defaults.js';
import { R_BestiaryApplyCamera, R_BestiaryFrame, R_BestiaryFrozen, R_BestiaryInputLocked, R_BestiaryKey, R_BestiaryObserve, R_BestiaryPortraitLight, R_BestiaryTimeScale } from './ui/r_bestiary.js';
import { R_BestiaryBookCorner, R_BestiaryBookDraw, R_BestiaryBookKey, R_BestiaryBookOpen, R_BestiaryBookTouch, R_BestiaryEncounterDraw } from './ui/r_bestiary_book.js';
import { R_DemoLoadingAttract, R_DemoLoadingCancel, R_DemoLoadingConsoleClosed, R_DemoLoadingConsoleDrawn, R_DemoLoadingConsoleOverride, R_DemoLoadingConsoleSpeed, R_DemoLoadingFrame, R_DemoLoadingFreeze, R_DemoLoadingHolding, R_DemoLoadingWelcome, R_IntroLoadingHolding, R_IntroReadinessChecks, R_WelcomeLoadingHolding } from './ui/r_demoloading.js';
import { R_FaceDamage, R_FaceGameReset, R_FaceHealthChanged, R_FaceInventory, R_FaceSecret, R_PlayerFaceFrame } from './ui/r_facegame.js';
import { R_NewerHudCanvas, R_NewerHudPreload, R_NewerHudStatus } from './ui/r_newerhud.js';
import { R_PlayerFaceCompose, R_PlayerFacePreload } from './ui/r_playerface.js';
import { Respawn_NoticeAt } from './ui/respawn_notice.js';
import { Draw_StudioLogo } from './ui/studio_logo.js';

if ( ! Hooks_Installed() ) Hooks_Install( {
	R_AliasMeshLookup, R_AliasMeshRemember,
	R_DemonBakePrepare, R_DemonBakeRelease, R_DemonBakeStatus, R_DemonBakeSurface,
	Axe_ParseRecord, Axe_ValidOwnerKey,
	PowerVisionMode,
	Respawn_ParseDrop, Respawn_ParsePlayer, Respawn_ParseRemains,
	SV_AxeEntitySuppressed, SV_AxeFunctionEnter, SV_AxeFunctionLeave, SV_AxeGibSeen, SV_AxeReset,
	SV_CheatsFrame, SV_CheatsInit,
	SV_FaceFunctionEnter, SV_FaceFunctionLeave, SV_FaceReset, SV_FaceShotTrace,
	SV_GoreOnSetModel,
	SV_MeleeSprayEnter,
	SV_PinnedZombieSpawned,
	SV_BeginPortalTouch, SV_FinishPortalTouch, SV_PreparePortalTouch, SV_RestorePortalReceiver,
	SV_PortalMoveEnd, SV_PortalMoveRead, SV_PortalMoveStart, SV_PortalMoveStepping,
	SV_ProneZombieEnter, SV_ProneZombieLeave, SV_ZombieProne,
	SV_QuadJumpBegin, SV_QuadJumpEnd, SV_QuadMovementScale,
	Rend_ParseRecord, Rend_ValidRecord, SV_RendVeilClientRecord, SV_RendVeilHolding, SV_RendVeilTouchBegin, SV_RendVeilTouchEnd,
	SV_RespawnCaptureTravel, SV_RespawnClearTravel, SV_RespawnDropTouch, SV_RespawnFinishTravel, SV_RespawnFrame, SV_RespawnFunctionEnter, SV_RespawnFunctionLeave, SV_RespawnInventoryStats, SV_RespawnPrecache, SV_RespawnReserveGuards, SV_RespawnRestoreDropModel, SV_RespawnView, SV_RespawnWorldStart, SV_SetRespawnEntryHook, SV_SetRespawnLandedHook, sv_respawnguard,
	SV_LevelSnapshotEntities, SV_LiquidLinks, SV_SeamlessCloseReturn, SV_SeamlessCrossings, SV_SeamlessEnabled, SV_SeamlessEntryYaw, SV_SeamlessFrame, SV_SeamlessHolding, SV_SeamlessPending, SV_SeamlessPlacePlayer, SV_SeamlessSetup, SV_SeamlessUseModels, SV_SetLiquidLinks, SV_SetWarmLevel,
	SV_ShotDelayRun, sv_shotdelay,
	SV_UnseenFrame, SV_UnseenFunctionEnter, SV_UnseenFunctionLeave,
	R_AnimSetClassicPass, R_ClassicPassActive, R_IsNewer, R_NewerGame, R_NewerLightingActive, r_newer_crates, r_newer_enemies, r_newer_hud, r_newer_lighting, r_newer_normals, r_newer_portals, r_newer_shadows, r_newer_textures, r_newer_water,
	Face_Assign, Face_ParseSeed, Face_Seed,
	R_BoxInPortalReceiver, R_BuildPortals, R_GetPortals, R_ImpactPortalPlanes, R_LevelPortalMatrix, R_PortalMaterial, R_PortalNoteVisible, R_PortalsActive, R_PortalsBeginFrame, R_RenderPortals, r_portals,
	R_BuildSunOccluder, R_BuildWorldLights, R_DynResScale, R_FireFlicker, R_GetLiquidLinks, R_GetWorldLights, R_GlowBoostForTexture, R_IsWaterTextureName, R_LiquidOpacity, R_MapHasSky, R_PointShadowStatus, R_PostActive, R_PostBegin, R_PostBind, R_PostFinish, R_PostInstallGBufferPatch, R_PostLightsFrame, R_PostNoteSky, R_PostSetPortraitLight, R_PostSetSplit, R_PostSetUnderwater, R_RefreshDetail, R_RegisterDetail, R_RegisterGlow, R_WaterActive, R_WaterProbesFrame, R_WaterStartupStatus, SUN_SHADOW_LAYER, classicLook, r_bloom, r_bounce, r_caustics, r_cloudspeed, r_dynres, r_fps_target, r_hdr, r_heathaze, r_mist, r_newbright, r_newcontrast, r_newdark, r_newedges, r_pillars, r_pointshadows, r_reflect, r_reflect_screen, r_volumetric, r_water_look,
	R_AliasPoseBlend, R_AnimEnabled, R_BlendArrays, R_SmoothMove, r_lerpmodels,
	R_ArchHiddenRevision, R_ArchModelHidden, R_ArchSurfaceHidden, R_HasArchHidden,
	R_AxeCorpsesFrame, R_ClearAxeCorpses,
	R_ClassicMaterial, R_SaveClassicScene,
	R_CratePlan, R_IsCrateSide,
	R_DecalBloodLanded, R_DecalBloodPool, R_DecalBloodSpray, R_DecalGibTrack, R_DecalScorch, R_DecalShot, R_DecalsClear, R_DecalsFrame, R_DecalsSetup, r_decals,
	DEMON_TEXTURES, R_DemonSurfaceData,
	R_DemoSplitActive, R_DemoSplitClassic, R_DemoSplitEnd, R_DemoSplitFull, R_DemoSplitRelease, R_DemoSplitStart, r_demosplit,
	R_DofClear, R_DofFrame, R_DofSetup, r_dof,
	R_FireballClear, R_FireballFrame, R_FireballReplacesSprite, R_FireballSetup, R_FireballSpawn, R_SmokeTrail, r_fireball, r_fireballalpha, r_smoketrails,
	R_FlashlightBeam, R_FlashlightInit, R_FlashlightToggle, R_FlashlightUpdate, r_flashlight,
	R_FlashlightNewRun, R_FlashlightRunEnd, R_FlashlightRunLoaded, R_FlashlightRunMap, R_FlashlightSkillSelected,
	R_HeightShadowScope, r_heightshadows,
	R_ImpactMissile, R_ImpactRippleFrame, R_ImpactRippleListen, R_ImpactRippleReset, R_ImpactRipplesSetup, r_impactripples,
	R_LevelViewUseSnapshots, R_SetupLevelViews, R_SyncLevelViews, R_UpdateLevelViewEntities,
	LIGHTNING, R_LightningClear, R_LightningFrame, R_LightningSetup, R_LightningTakesBeam, r_newer_lightning,
	R_MistClear, R_MistFrame,
	R_MuzzleFlashFired, R_MuzzleFlashScale, R_MuzzleSetProbe, R_MuzzleSetView, R_MuzzleView,
	R_AssetAliasMaterial, R_CloneAliasMaterial, R_EnemyAliasMaterial, R_HeldVisionTag, R_NewerAliasMaterial, R_NewerSkinsMaterials, R_NewerSkinsNewMap, R_NewerSkinsPrepare, R_NewerSkinsStatus, R_NewerSkinsTextures, R_ReleaseAliasReceiver, r_newer_variety,
	R_ClassicTexture, R_NewerNormalsPrepare, R_NewerNormalsStatus, R_NewerTextureUpgrade, R_NewerTexturesFrame, R_NewerTexturesStatus,
	R_PerfFpsText, R_PerfFrameBegin, R_PerfFrameEnd, R_PerfInit, R_PerfProfiling, R_PerfScreenLines, R_PerfStage, R_PerfStop, cl_showfps,
	R_PowerupBegin, R_PowerupClear, R_PowerupEnd, R_PowerupSeen, r_powerups,
	R_PowerVisionReset,
	R_WarmFrame, R_WarmLevel,
	R_QuadVisionActive, R_QuadVisionReset,
	R_RendVeilBegin, R_RendVeilCapture, R_RendVeilClear, R_RendVeilEnd, R_RendVeilRelease, R_RendVeilSeen,
	R_RespawnCameraFrame,
	R_RockfieldBrushSeen, R_RockfieldBuild, R_RockfieldChart, R_RockfieldGeometry, R_RockfieldSetLimits, R_RockfieldStatus, R_RockfieldUpdate, r_rockfield,
	R_ScreenDropsBloodAt, R_ScreenDropsReset, R_ScreenDropsSetView, R_ScreenDropsView,
	R_CompileSceneAsync, R_ShaderAssetStamp,
	R_ShellShot, R_ShellsFrame, R_ShellsNewMap, R_ShellsReset, R_ShellsRestore, R_ShellsSetup, R_ShellsSnapshot,
	R_ShellTrace,
	R_ShotgunClear, R_ShotgunFrame, R_ShotgunSetup, r_shotgunfx, viewModelMuzzles,
	R_TeleportFrameEnd,
	R_TorchFire, R_TorchFireBegin, R_TorchFireClear, R_TorchFireFlush, R_TorchFireSetup, TORCH_HANDLE, TORCH_WHOLE, r_torchfire, torchParts,
	R_AliasFrameBox, R_WallBurnClear, R_WallBurnFrame, R_WallBurnSetup, R_WallBurnShot, r_newer_wallburn,
	R_WaveImpact, R_WavesFrame, R_WavesReset, R_WavesSetup,
	R_PlayerSurfaceBlood, R_WeaponSurfaceBloodAt, R_WeaponSurfaceContext, R_WeaponSurfaceFrame, weaponSurface,
	R_WeaponAsset, R_WeaponHeldPullback, R_WeaponMaterials, R_WeaponRotorFrame, R_WeaponStatus, R_WeaponTextures, R_WeaponsEnabled, R_WeaponsPreload, r_newer_weapons,
	V_ShamblerStepShake, v_shamblersteps,
	S_UpdateAmbientMusic,
	S_AmbientMusicNotifyCombat, S_AmbientMusicShutdown, S_AmbientMusicStop, S_AmbientMusicUnlock,
	S_ExitMachineFalloff,
	BuildMenuTextArt, BuildSinglePlayerMenuArt,
	MainMenu_Begin, MainMenu_Destroy, MainMenu_End, MainMenu_Glyph, MainMenu_Image, MainMenu_Panel, MainMenu_SetInGame, MainMenu_SetVisible, MainMenu_Skinned, MainMenu_Slider, MainMenu_Text, MainMenu_TextBox,
	NEWER_ENABLED_FEATURES,
	R_BestiaryApplyCamera, R_BestiaryFrame, R_BestiaryFrozen, R_BestiaryInputLocked, R_BestiaryKey, R_BestiaryObserve, R_BestiaryPortraitLight, R_BestiaryTimeScale,
	R_BestiaryBookCorner, R_BestiaryBookDraw, R_BestiaryBookKey, R_BestiaryBookOpen, R_BestiaryBookTouch, R_BestiaryEncounterDraw,
	R_DemoLoadingAttract, R_DemoLoadingCancel, R_DemoLoadingConsoleClosed, R_DemoLoadingConsoleDrawn, R_DemoLoadingConsoleOverride, R_DemoLoadingConsoleSpeed, R_DemoLoadingFrame, R_DemoLoadingFreeze, R_DemoLoadingHolding, R_DemoLoadingWelcome, R_IntroLoadingHolding, R_IntroReadinessChecks, R_WelcomeLoadingHolding,
	R_FaceDamage, R_FaceGameReset, R_FaceHealthChanged, R_FaceInventory, R_FaceSecret, R_PlayerFaceFrame,
	R_NewerHudCanvas, R_NewerHudPreload, R_NewerHudStatus,
	R_PlayerFaceCompose, R_PlayerFacePreload,
	Respawn_NoticeAt,
	Draw_StudioLogo,
} );
