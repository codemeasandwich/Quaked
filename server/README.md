# Three-Quake Dedicated Server

A dedicated server for Three-Quake that runs headlessly using Deno and WebTransport.

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
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

### 2. Place Game Data

Make sure `pak0.pak` is in the parent directory (`../pak0.pak` from the server folder).

### 3. Run the Server

The room server (`game_server.js`, the full engine: QuakeC, physics, entities) is what the lobby spawns for each room.
From the repository's root:

```bash
deno task server -cert cert.pem -key key.pem -direct   # paths from server/, where step 1 made them
```

The task runs it from `server/` (where it reads `../pak0.pak`) with the root `deno.json`, whose import map gives it the
same `three` the browser loads (the engine's modules use it as they load). The lobby (`lobby_server.js`) spawns rooms
with that same file.

The older TypeScript server below (`main.ts`) is a separate, unfinished entry point (see Status):

```bash
deno run --allow-net --allow-read --allow-env main.ts
```

Or use the task:

```bash
deno task start
```

## Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `-port <port>` | 4433 | Server port |
| `-maxclients <num>` | 16 | Maximum players |
| `-map <name>` | start | Starting map |
| `-pak <path>` | ../pak0.pak | Path to pak0.pak |
| `-cert <path>` | cert.pem | TLS certificate file |
| `-key <path>` | key.pem | TLS private key file |
| `-tickrate <hz>` | 72 | Server tick rate |

### Example

```bash
deno run --allow-net --allow-read main.ts -port 4433 -map e1m1 -maxclients 8
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
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -keyout key.pem -out cert.pem -days 10 -nodes -subj "/CN=localhost"
openssl x509 -in cert.pem -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
```

## Production Deployment

### Using Let's Encrypt

For production, use proper TLS certificates from Let's Encrypt:

```bash
certbot certonly --standalone -d your-domain.com
```

Then point the server to the certificates:

```bash
deno run --allow-net --allow-read main.ts \
  -cert /etc/letsencrypt/live/your-domain.com/fullchain.pem \
  -key /etc/letsencrypt/live/your-domain.com/privkey.pem
```

### Docker

```dockerfile
FROM denoland/deno:1.40

WORKDIR /app
COPY server/ ./server/
COPY pak0.pak ./

EXPOSE 4433

CMD ["deno", "run", "--allow-net", "--allow-read", "server/main.ts"]
```

Build and run:

```bash
docker build -t three-quake-server .
docker run -p 4433:4433 -v /path/to/certs:/app/server three-quake-server
```

## Architecture

The server uses:

- **WebTransport** over HTTP/3 (QUIC) for network transport
- **Bidirectional streams** for reliable messages (spawn data, level changes)
- **Datagrams** for unreliable messages (entity updates at 72Hz)

### Files

- `main.ts` - Entry point and server loop
- `host_server.ts` - Headless server initialization and frame processing
- `net_webtransport_server.ts` - WebTransport server driver
- `pak_server.ts` - Filesystem-based PAK file loading
- `sys_server.ts` - Deno system interface
- `mod_server.ts` - Headless BSP model loader (collision data only)

## Status

This is currently a work-in-progress. The following is implemented:

- [x] WebTransport server listening
- [x] Client connection handling
- [x] PAK file loading from filesystem
- [x] BSP collision data loading
- [ ] Full QuakeC VM integration
- [ ] Entity synchronization
- [ ] Physics simulation
- [ ] Complete game protocol

## License

GPL v2 (same as original Quake source)
