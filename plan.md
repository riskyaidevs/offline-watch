# Flight Watch Party — Implementation Plan (OpenHands-ready)

## 0. Read this first — how this plan differs from the original

The original plan is a good product spec but conflates two very different kinds of
verification:

- **Agent-verifiable**: unit tests, integration tests against a local Node server,
  multi-tab/multi-context browser automation (Playwright) on `localhost`.
- **Human-only-verifiable**: real Android hotspot, real phones, real airplane mode,
  real microphones/speakers, real Wi-Fi mDNS behavior.

OpenHands (or any sandboxed coding agent) can build, run, and test the first kind on
its own. It **cannot** create a Wi-Fi hotspot, hold a phone, or listen to audio.
Every phase below is tagged `[AGENT]` or `[HUMAN]` so the agent knows when it has
actually reached "done" versus when it needs to stop and hand off to you with a
checklist.

Two browser-security issues must be designed in from day one, not bolted on later:

1. **Secure context requirement**: `getUserMedia()` (microphone) and Service Worker
   registration require HTTPS or `localhost`. `http://192.168.x.x:8080` is treated
   as insecure by Chrome/Safari — mic and PWA install will silently fail there.
   → The Android host must serve HTTPS with a self-signed cert (`mkcert` or `openssl`
   in Termux); each client accepts the certificate warning once on first join.
2. **Autoplay policy**: a `PLAY` command arriving over WebSocket is not a user
   gesture on the receiving device, so `video.play()` can be blocked. Every client
   needs an explicit "Tap to join playback" button that satisfies the gesture
   requirement before sync begins.

A third thing to test explicitly rather than assume: Chrome/Safari obfuscate local
IPs as `.local` mDNS ICE candidates by default; some hotspot configurations don't
resolve mDNS reliably between clients on the same subnet, which can break WebRTC
P2P even though the network otherwise works. Treat this as a named test in Phase 8,
not a footnote.

---

## 1. Goal (unchanged from original)

A **Flight Watch Party** app running entirely on a local Wi-Fi network created by
one Android phone acting as hotspot + local server. Other participants join with
just a browser. Each participant supplies their own local copy of the movie file
(never transmitted). Playback is synced over the local network; text chat is local;
voice is WebRTC P2P push-to-talk. No internet, no external backend, ever.

---

## 2. Architecture

```
Android Host (192.168.x.1)
├── Wi-Fi Hotspot
├── HTTPS server (self-signed cert) serving the SPA
├── WebSocket server: room mgmt, playback sync, chat, WebRTC signaling
└── optional mDNS discovery (never load-bearing)

Clients (Chrome/Safari, phone or desktop)
├── HTML5 <video>, local file via File API (never uploaded)
├── WebSocket client
└── WebRTC (audio-only, mesh) — signaling via host, media P2P
```

---

## 3. Stack

- **Frontend**: TypeScript + React + Vite, PWA. No heavy framework.
- **Backend**: Node.js + TypeScript, Fastify or Express, `ws` for WebSocket.
- **Shared**: a `packages/protocol` workspace with the wire-format types, so both
  sides import the same source of truth instead of duplicating message shapes.
- No Firebase/Supabase/AWS/CDN — everything must run fully offline.

---

## 4. Repo structure

```
flight-watch-party/
├── apps/
│   ├── web/          (React/Vite SPA)
│   └── server/        (Node/Fastify + ws)
├── packages/
│   └── protocol/      (shared TS types + zod schemas for wire messages)
├── docs/
├── scripts/           (cert generation, hotspot start helper, QR generator)
└── README.md
```

Use npm workspaces (or pnpm) so `protocol` is a real importable dependency, not
copy-pasted types.

---

## 5. Phased plan

Each phase has an explicit **Done when** condition and a **Verified by** tag.

### Phase 1 — Local HTTPS server `[AGENT]`
- Fastify/Express server on `0.0.0.0:8443` serving the built SPA, with a
  self-signed cert generated via a `scripts/gen-cert.sh`.
- **Done when**: `curl -k https://localhost:8443` returns the SPA HTML, and a
  unit test confirms the server binds to `0.0.0.0` not just `127.0.0.1`.
- **Verified by**: agent (automated).

### Phase 2 — Rooms `[AGENT]`
- `Room { id, hostId, users }`, create/join/leave over WebSocket, protocol types
  in `packages/protocol`.
- **Done when**: integration test opens 3 WebSocket connections against the local
  server, creates a room, joins it twice, and asserts participant list updates.
- **Verified by**: agent (automated, `localhost` only).

### Phase 3 — Local video selection `[AGENT]`
- `<input type="file">` → `URL.createObjectURL`. No upload endpoint exists at all
  (assert this with a test that hits `/upload` or similar and expects 404).
- **Done when**: component test confirms the object URL is used locally and no
  network request is made when a file is selected.
- **Verified by**: agent (automated).

### Phase 4 — Playback sync + clock offset `[AGENT]`
- Implement the ping/pong clock-offset handshake, but sample it **several times**
  (e.g. 5 round trips, take the median) rather than once — a single sample is
  noisy on real Wi-Fi.
- `PlaybackState { state, position, timestamp, playbackRate }` broadcast on
  play/pause/seek.
- Drift correction: <100ms ignore, 100–500ms playbackRate nudge, >500ms hard seek.
- **Done when**: unit tests cover the offset calculation and drift-correction
  decision function as pure logic (no network needed to test the math). A
  Playwright test with two browser contexts on `localhost` confirms both video
  elements converge within tolerance after a simulated play/seek.
- **Verified by**: agent (automated on localhost — real-network drift behavior
  is re-checked in Phase 9).

### Phase 5 — Host controls `[AGENT]`
- Default: only host can play/pause/seek/change rate. Add "anyone can control"
  toggle after MVP works.
- **Done when**: integration test confirms non-host control messages are rejected
  by default and accepted after the toggle.
- **Verified by**: agent (automated).

### Phase 6 — Chat `[AGENT]`
- `CHAT_MESSAGE` over WebSocket, length cap, rate limit, no HTML rendered
  (sanitize/escape on render, not just on send).
- **Done when**: tests cover message length rejection, rate-limit rejection, and
  that a message containing `<script>` renders as literal text in the DOM.
- **Verified by**: agent (automated).

### Phase 7 — WebRTC signaling `[AGENT]`
- Server relays SDP offer/answer/ICE candidates only — never touches media.
- **Done when**: two Playwright browser contexts on `localhost` complete an
  ICE connection with `iceServers: []` (no STUN/TURN) and no ICE candidates
  fail to gather within a timeout.
- **Verified by**: agent (automated on localhost loopback).

### Phase 8 — Push-to-talk `[AGENT]` + `[HUMAN]`
- `track.enabled` toggling (not connection teardown) on `pointerdown`/`pointerup`,
  handling `pointercancel` and app-hidden/backgrounded state (force mute).
- **Done when (agent)**: unit tests cover the state machine (mic on/off
  transitions, forced-mute on visibility change) without needing a real mic.
- **Done when (human)**: with two real phones on the actual hotspot, PTT audio is
  audible round-trip, and mDNS ICE candidates actually resolve between the two
  devices (this is the item the original plan didn't call out explicitly — test
  it deliberately, on the actual hotspot hardware you'll use in the plane).
- **Verified by**: agent for logic, **you** for real audio + real mDNS behavior.

### Phase 9 — Real network / real device testing `[HUMAN]`
This phase cannot be done by the agent at all. Checklist:
- [ ] Android hotspot + Termux/Node server reachable from 2+ real devices
- [ ] Airplane mode + Wi-Fi on, zero internet, app still fully functional
- [ ] Certificate warning accepted on each client (Phase 1's HTTPS requirement)
- [ ] Autoplay gesture button actually unblocks sync'd playback on each client
- [ ] Drift correction feels right on real Wi-Fi (not just localhost)
- [ ] PTT audio round-trips on real hardware; simultaneous PTT from 2 people
- [ ] Client reconnect after dropping Wi-Fi briefly
- [ ] Host leaving room is handled (reassign or gracefully end)
- [ ] Chrome Android, Safari iOS, Chrome desktop, Safari macOS all checked

### Phase 10 — PWA `[AGENT]` (logic) + `[HUMAN]` (real install)
- Manifest + Service Worker caching HTML/JS/CSS/icons/fonts — **never** the video.
- **Done when (agent)**: Lighthouse/PWA checks pass against the localhost HTTPS
  server; Service Worker registers only in secure context.
- **Done when (human)**: install-to-homescreen actually works on a real phone
  after accepting the self-signed cert.

### Phase 11 — Android host packaging `[HUMAN]` (with agent-written scripts)
- Start with Termux + a startup script the agent writes (`scripts/start-host.sh`):
  hotspot check, cert check, `npm start`, print IP + QR code.
- Only after that works reliably should you consider a native "Flight Watch Host"
  Android app. Don't let the agent build a native Android app before the Termux
  path is proven — that's a much bigger, mostly-`[HUMAN]`-verified undertaking.

### Phase 12 — QR code + mDNS convenience `[AGENT]`
- QR code linking to `https://192.168.x.x:8443/?room=XXXX`.
- Optional `flightparty.local` via mDNS — never load-bearing; IP must always work.
- **Done when**: agent confirms the app functions with mDNS disabled entirely.

---

## 6. Final MVP acceptance (split by who checks it)

**Agent self-checks (automated, localhost):**
- [ ] Server binds `0.0.0.0`, serves SPA over HTTPS
- [ ] Room create/join/leave logic correct
- [ ] No video-upload endpoint exists
- [ ] Clock-offset + drift-correction pure logic covered by unit tests
- [ ] Host-only control enforcement covered
- [ ] Chat length/rate-limit/sanitization covered
- [ ] WebRTC signaling completes over loopback with empty ICE server list
- [ ] PTT state machine (mute/unmute/forced-mute) covered
- [ ] PWA manifest + Service Worker registers in secure context

**You check on real hardware (cannot be automated by the agent):**
- [ ] Real Android hotspot + airplane mode, zero internet, full functionality
- [ ] Certificate acceptance flow is tolerable for non-technical participants
- [ ] mDNS ICE candidates resolve on your actual hotspot (or fallback confirmed)
- [ ] Autoplay gesture unblocks sync on each real client
- [ ] Real mic PTT audio, including simultaneous talkers
- [ ] Reconnect after Wi-Fi blip; host-leaves handling
- [ ] Chrome Android / Safari iOS / Chrome desktop / Safari macOS

---

## 7. Order of operations for the agent

```
1. HTTPS server        [AGENT]
2. Rooms                [AGENT]
3. Local video          [AGENT]
4. Sync + clock offset  [AGENT]
5. Host controls        [AGENT]
6. Chat                 [AGENT]
7. WebRTC signaling     [AGENT]
8. PTT logic            [AGENT]  →  PTT real-audio test  [HUMAN]
9. Real network testing [HUMAN]
10. PWA                 [AGENT] → real install [HUMAN]
11. Android host script [AGENT writes] → hotspot use [HUMAN]
12. QR / mDNS           [AGENT]
```

**Rule for the agent**: do not mark a `[HUMAN]` item as done. When a phase's
agent-verifiable work is complete, stop and report exactly what remains for
manual on-device testing, rather than assuming success.
