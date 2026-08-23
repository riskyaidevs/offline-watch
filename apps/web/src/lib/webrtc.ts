import type { SignalData } from '@flightwatch/protocol';
import type { FWClient } from './wsClient.js';

/**
 * Audio-only WebRTC mesh: one RTCPeerConnection per peer, signaling relayed
 * by the room server. Uses the "perfect negotiation" pattern so both sides
 * can renegotiate without glare.
 *
 * iceServers stays empty on purpose: everyone is on the same hotspot.
 */
export class VoiceMesh {
  private peers = new Map<string, RTCPeerConnection>();
  private stream: MediaStream | null = null;
  private remoteAudio = new Set<HTMLAudioElement>();

  constructor(
    private readonly client: FWClient,
    private readonly selfId: string,
    private readonly onTrack: (peerId: string, stream: MediaStream) => void,
  ) {}

  setMicrophone(stream: MediaStream | null): void {
    this.stream = stream;
  }

  /** Ensure connections exist for every member id. Call on room_update. */
  sync(memberIds: string[]): void {
    const wanted = new Set(memberIds.filter((id) => id !== this.selfId));
    for (const id of wanted) {
      if (!this.peers.has(id)) {
        this.peers.set(id, this.createPeer(id));
      }
    }
    for (const [id, pc] of this.peers) {
      if (!wanted.has(id)) {
        pc.close();
        this.peers.delete(id);
      }
    }
  }

  handleSignal(fromId: string, data: SignalData): void {
    let pc = this.peers.get(fromId);
    if (!pc) {
      pc = this.createPeer(fromId);
      this.peers.set(fromId, pc);
    }
    void this.applySignal(pc, fromId, data);
  }

  private async applySignal(pc: RTCPeerConnection, fromId: string, data: SignalData) {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await pc.setLocalDescription();
        this.sendSignal(fromId, { sdp: pc.localDescription ?? undefined });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate).catch(() => {
        /* stale candidate, fine */
      });
    }
  }

  private createPeer(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: [] });
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        pc.addTrack(track, this.stream);
      }
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(peerId, { candidate: event.candidate.toJSON() });
      }
    };
    pc.onnegotiationneeded = async () => {
      // Impolite side (lexicographically smaller id) makes offers.
      if (this.selfId < peerId) {
        await pc.setLocalDescription();
        this.sendSignal(peerId, { sdp: pc.localDescription ?? undefined });
      }
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        this.onTrack(peerId, stream);
      }
    };
    return pc;
  }

  private sendSignal(targetId: string, data: SignalData): void {
    this.client.send({ type: 'signal', targetId, data });
  }

  close(): void {
    for (const pc of this.peers.values()) {
      pc.close();
    }
    this.peers.clear();
    for (const audio of this.remoteAudio) {
      audio.remove();
    }
    this.remoteAudio.clear();
  }
}
