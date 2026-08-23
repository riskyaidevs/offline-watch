# ✈️ Flight Watch Party

Watch a movie together on a plane — no internet, no backend, no accounts.
One Android phone runs a hotspot + this server; everyone else just opens a
browser. Each participant uses their own local copy of the movie file (it is
**never** transmitted), playback stays in sync over the LAN, text chat works,
and push-to-talk voice runs over WebRTC peer-to-peer.

## How it works

```
Android host (192.168.x.1)
├── Wi-Fi hotspot
├── HTTPS server (self-signed cert) serving this app
└── WebSocket: rooms, playback sync, chat, WebRTC signaling

Each participant's browser
├── <video> playing their OWN local file (File API, never uploaded)
├── WebSocket client (sync + chat)
└── WebRTC audio-only mesh (push-to-talk), signaling via the host
```

- **Protocol**: shared types + zod schemas in `packages/protocol` — one source
  of truth for the wire format.
- **Sync**: NTP-style clock offset (5 ping/pong samples, median), then drift
  correction: <100 ms ignored, 100–500 ms playback-rate nudge, >500 ms seek.
- **Host controls**: only the host can play/pause/seek by default; a toggle
  opens control to everyone.

## Quickstart (development)

```bash
npm install
npm test                  # all unit + integration tests
npm run build             # build the web app

bash scripts/gen-cert.sh  # self-signed certs -> ./certs
npm start                 # HTTPS server on 0.0.0.0:8443, prints join QR codes
```

Then open `https://<your-lan-ip>:8443` on another device on the same network
(accept the certificate warning once — that's expected with a self-signed cert).

## On the plane (Android host)

```bash
# In Termux, with the hotspot already on:
pkg install nodejs openssl
bash scripts/start-host.sh
```

Everyone connects to the hotspot (airplane mode + Wi-Fi back on), scans the QR
code or types the room code, picks their local copy of the movie, and taps
**"Tap to join playback"** (required once per device — browsers block autoplay
without a user gesture).

See [docs/REAL-DEVICE-CHECKLIST.md](docs/REAL-DEVICE-CHECKLIST.md) for what
still needs testing on real hardware — real-network drift, mDNS ICE behavior,
PTT audio, and browser coverage cannot be verified without the actual phones.

## Repo layout

```
apps/web          React/Vite SPA (PWA)
apps/server       Node/Fastify + ws server (HTTPS, rooms, relay)
packages/protocol Shared wire types, zod schemas, sync math
scripts/          gen-cert.sh, start-host.sh, gen-icons.mjs
docs/             Real-device checklist
```

## Security model

- No upload endpoint exists at all — videos physically cannot leave a device.
- Chat is length-capped, rate-limited, and rendered as text only.
- The WebSocket schema (zod) rejects anything that isn't a known message.
- HTTPS everywhere, because mic access and service workers require a secure
  context; the cert is self-signed, so the trust check is "are you on the
  right hotspot," not a CA.
