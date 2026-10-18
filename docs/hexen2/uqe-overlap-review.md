# Paired UQE references for shared Quake and Hexen II support

The two supplied UQE repositories help identify the smallest Hexen-specific changes around shared engine algorithms. They strengthen the existing one-JavaScript-engine approach; neither becomes a second runtime, automatic feature source, or replacement for the selected corrected gamecode.

## Pinned source and comparison method

- [UQE Quake](https://github.com/jacqueskrige/uqe-quake/tree/05e1285887683cb235a1a29cb625d72df2a0bcf2), `05e1285887683cb235a1a29cb625d72df2a0bcf2`.
- [UQE Hexen II](https://github.com/jacqueskrige/uqe-hexen-ii/tree/333c0b30c410e9416f9f26d19eba3eb9e7e1fc52), `333c0b30c410e9416f9f26d19eba3eb9e7e1fc52`.

Read-only source comparison found 110 Quake and 114 Hexen `.c`/`.h` files under `engine/code`, with 107 relative filenames in common. Five complete files match after CRLF normalisation; those are mostly platform/header/archive components, not proof of wholesale engine compatibility. Independent function comparison ignoring comments/whitespace found identical core routines listed below. These are textual observations for locating reuse, not a percentage-of-work estimate or runtime test result.

## Reuse and missing-semantics map

| Subsystem | Paired UQE evidence | Required Quaked plan action |
| --- | --- | --- |
| Collision response | `ClipVelocity`: Quake `sv_phys.c:206`, Hexen `:235`, normalised body matches. | Keep the existing JS vector/clip algorithm; independently test native class movement and the caller’s velocity-limit semantics. Do not import UQE’s different overall velocity cap. |
| World traversal | `SV_HullPointContents`: `world.c:496` / `:553`; `SV_ClearWorld`: `:252` / `:282`; bodies match. | Reuse traversal/partition algorithms. Hexen class/entity hull selection, monster offsets and archive lifecycle remain explicit additions. |
| Geometry lumps | `Mod_LoadVertexes`: `gl_model.c:800` / `:791`; `Mod_LoadEdges`: `:864` / `:855`; bodies match. | Reuse the shared JS geometry loader, bounds validation and renderer structures. No parallel BSP implementation. |
| Submodels/hulls | `Mod_LoadSubmodels`: `gl_model.c:828` / `:819` has the same body, but its record type and `MAX_MAP_HULLS` differ between engines. | Parameterise Hexen’s eight-hull record layout in the existing loader. Identical C logic is not compatible binary layout; T04 checks sizes, offsets, indices and actual class collision. |
| Model formats | Hexen `gl_model.c:277` dispatches RAPO; `Mod_LoadAliasModelNew` at `:1890` handles separate geometry/UV indices. | Extend the current alias parser/material/animation path only for the missing RAPO semantics, with real native model fixtures and malformed-index controls. |
| Interpreter call ABI | Hexen `pr_exec.c:500–510` copies statement `b`/`c` vectors into parameter slots for CALL1/CALL2+. | Extend one JS interpreter; T03 tests builtins and HCode functions, nested calls, copied scalar/vector values and retained Quake argument behaviour. |
| Interpreter operand interpretation | Hexen `pr_exec.c:186–188` uses unsigned global offsets; branch handling at `:485–497` remains signed; indexed fetch bounds appear at `:457–478`. | Add explicit unsigned data/signed branch decoding and bounds checks, including indices above 32767 and backward branches. Require independent native/source-derived goldens. |
| Protocols | Quake `protocol.h:22` uses 15; Hexen `:9–11` names Raven 19 and selects UQE 20. | Keep the plan’s supported native 18/19 demo readers and private Quaked-Hexen session contract. T05 rejects UQE20 cleanly; no UQE server/demo compatibility claim. |
| Hubs and saves | Hexen `host_cmd.c` has active `SaveGamestate`, `LoadGamestate`, and `changelevel2`; superficially similar Quake `.gip` routines are conditional under `QUAKE2`. | Reuse Quaked serialization primitives with Hexen archive/client/effect contracts. Source presence in a conditional Quake build does not prove a working hub facility. |
| Shared command/variable/math code | Paired `cmd.c`, `cvar.c`, `mathlib.c`, `zone.c`, `wad.c` retain close structure with different callers and native assumptions. | Keep existing JS primitives unless a concrete Hexen caller contract proves an adaptation necessary. Similarity alone is not a reason to replace working code. |

## Reference admission and exclusions

For every consulted delta, record source pins/functions, the Quaked caller/implementation, native contract, accepted/rejected decision, minimal adaptation and public RED/GREEN assertion. Native Raven/uhexen supported-format semantics, requested jsHexen corrections and explicit Enhanced behaviour resolve conflicts. UQE output alone is not authority.

Explicit exclusions from automatic reuse:

- UQE protocol 20, extra sound-index/version semantics or server interoperability.
- Larger interpreter stacks or array limits used to conceal errors; fix the actual recursive-explosion or invalid-index behaviour.
- Vector-magnitude velocity caps replacing native component limits, which can alter movement.
- The invalid-BSP sentinel path at Hexen `gl_model.c:1473–1483`, which does not constitute a validated model.
- Unfinished vector/string/entity/function switch cases at Hexen `pr_exec.c:778–789`; unsupported instructions must have bounded errors, never a no-op success claim.
- Unrequested gamecode changes, old source snapshots or replacing the complete pinned jsHexen fix catalogue with the older bundled UQE gamecode.
- Windows/WGL, native renderer/audio/device integrations and FMOD. Both trees include GPL material and licence documents, while FMOD headers retain Firelight-specific notices; inspect individual files/dependencies rather than assigning one blanket repository licence. Retain the current WebAudio/Three/native-shell boundaries and required provenance/notices for translated code.

## Review and execution limits

This is source research and a plan amendment. No engine code, tests, compiler builds, native reference executables or gameplay runs were produced. Any future native oracle/harness is development-only, built from pinned sources and independently recorded; it is not shipped or launched as Quaked’s engine.

The second plan review additionally requires complete executable-check discovery regardless filename, independent compatibility oracles, slice-specific first-playable prerequisites and correctly typed Sunstaff/lighting/projectile bindings. These requirements and their RED/GREEN cases are part of the main plan; UQE is a useful comparison aid to fulfil them, not proof that they already pass.
