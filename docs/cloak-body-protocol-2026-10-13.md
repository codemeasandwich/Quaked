# Ring of Shadows bodies over the network (13 October 2026)

Landed from the owner's main checkout with its water and vision work (card c5dc18e1 notes the
reconciliation). A player under the Ring of Shadows is, in stock Quake, sent to other clients as
the eyes model at frame 0. This port can draw the cloaked body instead (`src/newer/render/r_cloak.js`),
so the server can send the body's animation frame alongside the eyes.

## The message

- **Opt-in per connection.** A client that can draw cloaked bodies sends `prespawn cloakbody1`
  (`CLOAK_BODY_CAPABILITY`, `src/engine/common/protocol.js`) instead of a bare `prespawn`. The
  server keeps `client.cloakBodyCapability` (`src/engine/server/host_cmd.js`) and resets it at
  every serverinfo and drop, so it is negotiated again for each map and connection.
- **The field.** In `svc_playerinfo`, flag `PF_CLOAK_BODY` (bit 11) means a body-frame index
  follows the weapon frame: a byte in protocol 15, a short in the large-map protocol 1015
  (`SV_WriteIndex`/`MSG_ReadIndex`). The model and frame fields stay the eyes and 0, so the
  stock picture is unchanged. The server takes the frame from QuakeC's animation
  (`src/engine/server/sv_cloak.js`).
- **Older peers.** An older client sends a bare `prespawn` and never receives the flag. A newer
  client talking to an older server is unaffected: the old server ignores the argument.

## Open points

- **Trust.** Any client that asks receives cloaked players' body poses in its view. A modified
  client could draw them fully, which stock Quake hides; there is no server setting to turn
  this off for deathmatch. This needs an owner ruling (keep, or add a server switch).
- **Tests.** The owner's cloak tests (`tests/ring_cloak_test.js`, `cloak_observer_gap_test.js`,
  `operative_cloak_test.js`, `quad_cloak_test.js`) pass against this code but stay untracked:
  the owner asked that only files used in the game or user-facing docs be committed. They are
  kept in the snapshot `refs/claude/snapshots/main-checkout-2026-10-13`.
- **Demos.** A demo recorded on a capable connection carries bit 11; an older build would
  misread it on playback (not confirmed whether demos record playerinfo).
