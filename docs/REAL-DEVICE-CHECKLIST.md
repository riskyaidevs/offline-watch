# Real-device checklist (cannot be automated)

Everything here is `[HUMAN]`-verified. The agent has done and tested all
localhost-verifiable work; the items below need the actual hotspot hardware.

## Before the flight (at home, on the real hotspot)

- [ ] Android hotspot on; Termux running `scripts/start-host.sh`
- [ ] Two real phones reach `https://<hotspot-ip>:8443` and can join a room
- [ ] Each phone accepts the self-signed certificate warning (once per device)
- [ ] Airplane mode ON, Wi-Fi manually re-enabled, zero internet: app fully works
- [ ] "Tap to join playback" actually unblocks synced playback on each client
      (autoplay policy — without the tap, `video.play()` is rejected)
- [ ] Drift correction feels right on real Wi-Fi (not just localhost)
- [ ] mDNS ICE candidates resolve between the two phones (check PTT audio
      actually flows). If your hotspot breaks mDNS, P2P voice may fail even
      though chat/sync work — test this on the exact hardware you're bringing.
- [ ] PTT audio round-trips, including two people talking at once
- [ ] Client reconnects after Wi-Fi drops for a few seconds
- [ ] Host leaving: host role is reassigned to the longest-present member
- [ ] PWA install-to-homescreen works after accepting the cert
- [ ] Browsers: Chrome Android, Safari iOS, Chrome desktop, Safari macOS

## Notes

- The app never uses mDNS for anything load-bearing. The IP URL always works;
  `flightparty.local` is a nicety only.
- The movie file is never transmitted. Everyone needs their own local copy.
  Confirm everyone has the *same* file (same cut/length) before boarding.
