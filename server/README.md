# Three-Quake Dedicated Server

The multiplayer servers for Three-Quake, run headlessly with Deno over WebTransport. They run the game's own engine
(`src/`): QuakeC, physics and entities are the same code the browser runs.

* `game_server.js`, the room server: one game (a map and its players) on one port.
* `lobby_server.js`, the lobby: lists, creates and joins rooms, starting a room server process for each
  (`room_process_manager.ts`, ports 4434-4443).

## Requirements

- [Deno](https://deno.land/) 2.2 or later, for `Deno.QuicEndpoint` and `Deno.upgradeWebTransport` (behind
  `--unstable-net`). Deno 2.1 starts but never listens; checked with 2.5.6.
- A copy of `pak0.pak` from Quake
- TLS certificates (required for WebTransport)

## Quick Start

### 1. Generate TLS Certificates (Development)

For local development, generate self-signed certificates:

```bash
cd server
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -keyout key.pem -out cert.pem -days 10 -nodes -subj "/CN=localhost"
```

(ECDSA and at most 14 days, so Chrome can trust it by its key hash; see Connecting from Browser.)

### 2. Place Game Data

Make sure `pak0.pak` is in the parent directory (`../pak0.pak` from the server folder).

### 3. Run a Room Server

From the repository's root:

```bash
deno task server -cert cert.pem -key key.pem -direct   # paths from server/, where step 1 made them
```

The task runs it from `server/` (where it reads `../pak0.pak`) with the root `deno.json`, whose import map gives it the
same `three` the browser loads (the engine's modules use it as they load). The lobby spawns rooms with that same file.

`three` comes from jsDelivr, so the first start fetches it (Deno then caches it). The root `deno.lock` pins both of its
files by hash, and must stay committed: without it Deno tries to write one beside `deno.json` and fails where that
directory is read-only. On a host without outbound access, fill the cache at deploy time:

```bash
deno cache --config deno.json server/game_server.js
```

### 4. Run the Lobby (optional)

```bash
cd server
deno task lobby -cert cert.pem -key key.pem -pak ../pak0.pak
```

## Command Line Options

Room server (`game_server.js`):

| Option | Default | Description |
|--------|---------|-------------|
| `-port <port>` | 4433 | Server port |
| `-maxclients <num>` | 4 | Maximum players |
| `-map <name>` | start | Starting map |
| `-pak <path>` | ../pak0.pak | Path to pak0.pak |
| `-cert <path>` | the production certificate | TLS certificate file |
| `-key <path>` | the production key | TLS private key file |
| `-direct` | off | Accept connections directly, without the lobby protocol |
| `-room <id>` | none | Set by the lobby: the room this process serves (implies `-direct`) |
| `-idletimeout <s>` | 300 | Seconds a lobby room waits empty before exiting |

Lobby (`lobby_server.js`): `-port` (4433), `-cert`, `-key` and `-pak` (/opt/three-quake/pak0.pak), passed on to the
rooms it starts.

### Example

```bash
deno task server -cert cert.pem -key key.pem -direct -port 4433 -map e1m1 -maxclients 8
```

## Connecting from Browser

In the Three-Quake browser client, use the `connect` command:

```
connect "wts://your-server.com:4433"
```

The quotes are needed: the console splits an unquoted word at `:`.

Or for localhost development:

```
connect "wts://127.0.0.1:4433"
```

(The server listens on IPv4 `0.0.0.0`; `localhost` may resolve to `::1` and be refused.)

Note: WebTransport requires HTTPS/TLS. For development, trust the self-signed certificate. Chrome accepts one that is
ECDSA and valid for at most 14 days when started with `--origin-to-force-quic-on=127.0.0.1:4433` and
`--ignore-certificate-errors-spki-list=<base64 SHA-256 of the certificate's public key>`:

```bash
openssl x509 -in cert.pem -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
```

## Production Deployment

For production, use proper TLS certificates from Let's Encrypt:

```bash
certbot certonly --standalone -d your-domain.com
```

Then point the lobby (and through it, every room) to the certificates:

```bash
cd server
deno task lobby \
  -cert /etc/letsencrypt/live/your-domain.com/fullchain.pem \
  -key /etc/letsencrypt/live/your-domain.com/privkey.pem
```

The rooms are started with `/root/.deno/bin/deno` and the `deno.json` beside `server/` (`room_process_manager.ts`).

## Architecture

The server uses:

- **WebTransport** over HTTP/3 (QUIC) for network transport
- **Bidirectional streams** for reliable messages (spawn data, level changes)
- **Datagrams** for unreliable messages (entity updates at 72Hz)

### Files

- `game_server.js` - Room server: the engine's host, server and progs, run headlessly
- `lobby_server.js` - Lobby: room list, create and join
- `room_process_manager.ts` - Starts, tracks and stops a room server process per room
- `net_webtransport_server.ts` - WebTransport server driver (the engine's network driver 1 on the server)
- `sys_server.ts` - Deno system interface (printing, time)
- `sys_deno.js` - an older Deno system interface that nothing imports (kept; noted in card [44g]'s review)
- `test_imports.js` - Smoke check that the engine's modules load under Deno

The older TypeScript server (`main.ts`, with its own copies of engine parts in `host_server.ts`, `mod_server.ts`,
`pak_server.ts` and `rooms.ts`) never ran and was retired in card [44g] (debt D5, by the owner's decision); it is in the
git history.

## License

GPL v2 (same as original Quake source)
