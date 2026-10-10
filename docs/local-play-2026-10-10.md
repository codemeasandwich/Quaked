# Local play across windows: cards [37a] to [37c], 10 October 2026

## What the owner asked

> "so for now show the multiplayer but when you go into it. There will be local (split screen) and online. The online
> option will be faded out & Disabled from the menu"

The owner then chose to build split screen now, and gave its form:

> "I'm actually thinking the best thing to do is when they start a split screen that we just opened another browser
> tab or window that would allow them to drag that window to another screen if they have multiple screen settled."

So **Multiplayer > Local (split screen)** gives each player after the first a browser window of their own. Player 1
plays in the page they started from. Up to four players can take part.

## How to try it

1. Serve the checkout: `python3 tools/serve.py 8000`, then open `http://127.0.0.1:8000/`.
2. Go to **Multiplayer → Local (split screen)**.
3. Choose **Players** (2 to 4) and **Game Type** (Cooperative or Deathmatch) with the arrow keys.
4. Choose **Start local play**. The game starts on e1m1 in Newer Game, and player 2's window opens. Drag it to another
   screen, or anywhere. If the browser blocks it, allow pop-ups for the site.
5. For a third or fourth player, open **Multiplayer → Local** again in player 1's page and choose **Open player N's
   window**. Browsers open only one window per key press, which is why each window has its own step.
6. Each window has its own keyboard, mouse, sound, view and status bar. Click into a window to play in it.
7. To stop:
   - **End local play** on player 1's Local screen ends the game for everyone and closes the players' windows.
   - **Leave local play** on a player's own Local screen, or simply closing their window, takes out just that player.

## How it works

### The window driver (`src/engine/net/net_window.js`)

A native network driver, like loopback (`net_loop.js`) and WebTransport (`net_webtransport.js`).

- **Registration.** `NET_Init` registers it in the next free driver slot wherever `BroadcastChannel` exists.
- **Addresses.** `NET_Connect` sends `window:<session>` addresses to it. The remote route now finds WebTransport by
  name, so a page without WebTransport never hands it a remote address.
- **The channel.** Both ends of a session talk over a same-origin `BroadcastChannel` named
  `quaked-window-<session>`. Messages are plain objects: `join`, `accept`, `refuse`, `msg` and `close`.
- **Hosting.** The command `windowhost <session>` (or `windowhost -`) names the session the page's server accepts
  players on. Joins are taken while listening: `maxplayers` above 1 runs `listen 1`.
- **Joining.** A player's window asks every 250 ms until it is accepted, refused (the server is full) or 25 s pass.
  It asks repeatedly because its host page may still be loading.
- **Ordering.** The channel neither drops nor reorders, so reliable messages need no sequencing. When the receiver
  has an unbroken run of unread unreliable messages, only the newest is kept. This bounds the queue of a window that
  isn't reading, such as a hidden or minimised one.
- **Closing.** A closing page (`pagehide`) tells its peers, and `NET_Close` tells the other end.
  - When the host ends the game, a player's end usually closes first, on reading the native `svc_disconnect`.
  - So a closed player end keeps listening for 3 s for the host's own close. That close is what
    `Window_SetHostGoneListener` reports.
- **Unchanged.** Everything above the driver is the native engine: the same signon, protocol, prediction, HUD and
  renderer as any client.

### Hosting and windows (`src/engine/client/local_play.js`)

- **Start.** `LocalPlay_Start` queues these commands, then opens player 2's window:
  `disconnect`, `windowhost -`, `maxplayers N`, `coop`/`deathmatch`, `windowhost <new session>`, `map e1m1`.
  The mode is set after `maxplayers`, because `maxplayers` sets `deathmatch 1`.
- **Player windows.** Each opens at `index.html?window=<session>&player=<n>` as a `popup,noopener` window. With no
  opener, the browser may give it a process of its own.
- **Ending.** `LocalPlay_End` runs `disconnect`, `windowhost -` and `maxplayers 1`.
- **The next window.** `LocalPlay_NextPlayer` picks the lowest player number with no window in the game, going by
  the names the windows gave themselves (`Player <n>`).

### A player's window (`main.js`)

For an address with `?window=<session>&player=<n>`:

- **Settings.** `Cvar_SetStorageWritable( false )` runs before anything else. The window reads player 1's saved
  settings but never writes the cvars, the configuration or the defaults-migration marker. Its name "Player n" and
  its colours therefore never replace player 1's in the shared browser storage.
- **No attract demo.** Like a room join, it skips the attract demo's and the hub's prefetches. It waits for the same
  UI barrier, then `M_LocalPlayerJoin` sets Newer Game, its name and colours, and connects.
- **When the host goes.** If player 1 ends local play or closes their page, the window closes itself. If the browser
  keeps it open (for a window opened by hand), it shows the main menu instead of a frozen last frame.
- **Its title** is "Quaked: Player n".

### The Local screen (`menu.js`, `m_splitscreen`)

It has three forms:

| This page is | The Local screen offers |
|---|---|
| Not hosting | **Start local play**, **Players**, **Game Type**, and a note about windows and pop-ups |
| Player 1, hosting | **Open player N's window** (faded "Every player is in" when full), **End local play**, and the list of players |
| A player's window | "This window is Player N" and **Leave local play** (disconnects and closes the window) |

## Decisions and limits

- **Separate engines, not one engine with four views.** Each window is a full, separate engine instance. Rendering
  four views in one page would have meant reworking the client's single `cl`/`cls`, camera, HUD and render state:
  - one Newer Game instance in e1m1 uses about 6 ms of script per frame;
  - four same-origin frames in one page share one thread, and reached about 11 fps each, measured during the attract
    demo (headless and headful);
  - separate `noopener` windows can run in their own processes.

  Each window loads the game itself (memory about 0.9 GB each with Newer Game's art), but the HTTP cache shares the
  downloads.
- **Map and mode.** Local play starts on e1m1, which has co-op and deathmatch starts in the shareware and the full
  game. The mode is the native rules (`coop`, `deathmatch`); nothing new was invented. Choosing a map is a later step.
- **Newer Game.** Local play runs in Newer Game in every window, as Newer Game's single-player start does
  (`r_hdr 1` and its defaults).
- **Single-player features.** Features built for one local player keep their own conditions. Those that check the
  loopback driver (the Bestiary, the arrival hold, the respawn sequence) do not run for window players.
- **Input.** Keyboard and mouse belong to the focused window. Controllers are shared across the windows (card [37c],
  `src/platform/pad_share.js` and `pad_assign.js`):
  - Every window of a session reads the controllers it can see. Where the browser shows them only to the focused
    window, only that one can. A window that reads any shares a snapshot of them on `quaked-pads-<session>`.
  - Player 1's page decides who has which, and shares the table every second and on every change:
    - A controller goes to the lowest-numbered player without one, players 2 and up first, because player 1 has the
      keyboard and mouse. Player 1 gets one only when every other player has one.
    - The players counted are all those the game was set up for (1 to Players), so a controller waits for a window
      that is still opening.
    - A controller keeps its player while connected. One that comes back returns to its player, if still free.
    - Extra controllers play nobody.
    - When there are standard-layout controllers, only those are handed out. A controller's motion sensor or
      touchpad, listed as a device of its own, is left out.
  - Each window plays only the controller given to its player. It reads it directly when it can see it, or else
    from the freshest shared snapshot, which counts only when under half a second old.
  - A controller is known by its browser index and id. Chrome numbers controllers the same in every window, so the
    key names one physical controller everywhere. A browser that numbers them per document could break that, so
    local play's controllers are checked in Chrome.
  - When a window loses focus, the other windows keep playing its last shared snapshot for up to half a second. A
    button held at that moment counts as held that long, then is released.
  - A single page outside local play is unchanged.
  - Not proven: real paired controllers. The checks use mocked ones (below), so what Chrome reports to unfocused
    windows on real hardware still needs a trial with the owner's controllers.
- **Shared progress.** Settings are protected; two kinds of progress are shared on purpose:
  - A player's window still records Bestiary entries (`quaked.bestiary.v1`). This is shared progress, and its
    `unlock` reloads before writing, so it merges.
  - It writes the game choice (`quaked.game.v1`) only through an explicit `game` command.
  - It cannot save a game, because saving needs a running server.
- **Driver level.** `NET_Init` now ends on driver level 0 (loopback). A socket taken without `NET_Connect`, such as
  a direct `Loop_Connect` in a test, would otherwise be stamped with the last driver's index, the window driver's.
- **A join given up leaves no ghost.** A player's window that stops asking reports it to the host:
  - when it is refused, times out, is closed by `NET_Close`, or its page closes;
  - the host then drops that window's queued join;
  - otherwise the host would have taken a connection for a window that had gone, and held its slot until
    `net_messagetimeout`.
- **A shutdown freeze fixed.** `NET_SendToAll`, which the server uses to tell every client it is shutting down,
  started each slot as "not yet sent". That included free slots with no connection, so a listen server with a free
  slot waited out the whole 5 s block, frozen.
  - It showed as player 1's page stalling on **End local play**.
  - In that time the players' windows had already closed their ends, so they missed the host's close.
  - Slots now start as done, and only active remote clients wait.
- **A join cancelled.** `NET_Close` on a join the host has not answered yet (at shutdown, say) stops it asking and
  rejects it, instead of freeing the socket a second time later.
- **Pointer lock.** When a player's window opens, player 1's page loses focus and a pointer-lock request is refused.
  `requestPointerLock` now ignores the refusal (it was an unhandled promise rejection); a click locks the mouse again.

## Checks

- `tests/net_window_test.js` (3 tests) covers the driver through the public net layer:
  - a join, messages both ways, unreliable coalescing and close in both directions;
  - a window that loads before its host still gets in;
  - a full server refuses;
  - the host-gone listener fires even when the player's end closed first, and not when the player leaves;
  - whatever a test leaves open is closed when it ends, passed or failed, so a failure cannot hang the run;
  - invalid addresses are refused.
- `tests/window_play_native_test.js`: two windows sign on to the actual native e1m1 co-op server.
  - Each gets its own edict and name.
  - Each one's moves and aim drive only its own player.
  - One player's `kill` costs only that player (QuakeC's −2 frags and respawn).
  - Closing one window drops only that player.
  - With a slot free, `NET_SendToAll` reaches the remaining player at once. A mutation check: with the old start
    state it fails, in 10 s, without hanging.
- `tests/local_play_test.js` (3 tests) covers the Local screen through the menu's keys:
  - Start's exact commands and player 2's window;
  - the next missing player's window, "every player is in", and End's commands;
  - a player window's address, its start-up commands, and Leave.
- `tests/pad_assign_test.js` (2 tests):
  - the assignment rule: players 2 and up first, sticky, a controller returns to its player, a leaver's controller
    is freed, and extras play nobody;
  - two windows on real BroadcastChannels: a player's window that reads no controllers plays its own from player 1's
    reading and assignment, and a stale reading lapses.
- `tests/gamepad_test.js`: in local play, player 1's page plays only player 1's controller. With one controller, it
  is player 2's.
- `tests/net_window_test.js` also has a case for a window that gives up before it is taken: the host takes nobody
  for it. A mutation check: without the host dropping the queued join, the case fails.
- A mocked-controller browser trial (`/tmp/claude-qk/local37c.mjs`): only player 1's page could read the one
  controller, as a focus-gated browser does.
  - The controller was assigned to player 2 in both windows.
  - Its left stick moved player 2 by 533 units while player 1 stayed.
  - This is mocked devices, not paired hardware.
- `tests/startup_preload_test.js`: a player's window stops saving settings first, skips the attract prefetches, and
  joins after the UI barrier.
  - A mutation check: without the read-only switch or the skip, the test fails.
- The browser trial (`/tmp/claude-qk/local37.mjs`, Playwright with real Chromium windows, served by `tools/serve.py`)
  ran with no page errors:
  - Start with 3 players opened player 2's window, which signed on as view entity 2.
  - Its arrow key walked player 2 (origin 432,-296 → 432,~250) while player 1 stood.
  - **Open player 3's window** brought in view entity 3; the host's screen then showed "Every player is in".
  - Closing player 2's window dropped only player 2.
  - **Leave local play** closed player 3's window, and the host dropped player 3.
  - A reopened player 2's window closed itself when the host chose **End local play**.
    - Before the `NET_SendToAll` fix, this failed four runs in a row. The channel log showed the host's close
      arriving 5 s after its disconnect message.
    - After the fix, three runs in a row passed.
  - The host ended with `maxplayers 1` and no session.
  - The saved name and configuration in browser storage carried no "Player n".

## What remains

- **[37c] input:** the proof on real paired controllers (the owner's trial). The Local screen could also show who has
  which controller.
- **More setup:** choosing the map, and skill for co-op.
- **Owner decisions:** whether each window should get lower quality settings by default when four play on one
  computer, and whether Online should also be closed to its console commands (see
  `docs/multiplayer-menu-2026-10-10.md`).
