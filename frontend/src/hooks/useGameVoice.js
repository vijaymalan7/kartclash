// src/hooks/useGameVoice.js
import { useEffect, useRef, useState, useCallback } from "react";

const ICE_SERVERS = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/**
 * Mesh WebRTC voice for everyone in the match. Signaling is relayed by the game WebSocket.
 */
export function useGameVoice({ myId, peerIds, enabled, micMuted, deafened, send, registerWsHandler }) {
  const pcsRef = useRef(new Map());
  const audioElsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const pendingOffersRef = useRef(new Map());
  const connectingRef = useRef(new Set());

  const [voiceError, setVoiceError] = useState(null);
  const [voiceActive, setVoiceActive] = useState(false);

  const micMutedRef = useRef(micMuted);
  micMutedRef.current = micMuted;
  const deafenedRef = useRef(deafened);
  deafenedRef.current = deafened;
  const sendRef = useRef(send);
  sendRef.current = send;
  const peerIdsRef = useRef(peerIds);
  peerIdsRef.current = peerIds;

  const cleanupPeer = useCallback((peerId) => {
    connectingRef.current.delete(peerId);
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
      pcsRef.current.delete(peerId);
    }
    const audio = audioElsRef.current.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      audioElsRef.current.delete(peerId);
    }
  }, []);

  const teardownAll = useCallback(() => {
    pendingOffersRef.current.clear();
    connectingRef.current.clear();
    for (const pid of [...pcsRef.current.keys()]) {
      cleanupPeer(pid);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setVoiceActive(false);
    setVoiceError(null);
  }, [cleanupPeer]);

  const attachRemoteAudio = useCallback((peerId, stream) => {
    let audio = audioElsRef.current.get(peerId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.dataset.voicePeer = peerId;
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioElsRef.current.set(peerId, audio);
    }
    audio.srcObject = stream;
    audio.muted = deafenedRef.current;
    audio.volume = deafenedRef.current ? 0 : 1;
    audio.play().catch(() => {});
  }, []);

  const establishCallee = useCallback(
    async (from, sdp) => {
      const stream = localStreamRef.current;
      if (!stream || from === myId || typeof sdp !== "string") return;

      cleanupPeer(from);

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcsRef.current.set(from, pc);

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (ev) => {
        if (ev.candidate && sendRef.current) {
          sendRef.current({
            type: "voice_ice",
            to: from,
            candidate: ev.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (ev) => {
        const remote = ev.streams[0];
        if (remote) attachRemoteAudio(from, remote);
      };

      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (sendRef.current) {
        sendRef.current({
          type: "voice_answer",
          to: from,
          sdp: answer.sdp,
        });
      }
    },
    [attachRemoteAudio, cleanupPeer, myId],
  );

  const establishCalleeRef = useRef(establishCallee);
  establishCalleeRef.current = establishCallee;

  const flushPendingOffers = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const entries = [...pendingOffersRef.current.entries()];
    pendingOffersRef.current.clear();
    for (const [from, sdp] of entries) {
      try {
        await establishCalleeRef.current(from, sdp);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const connectAsCaller = useCallback(
    async (peerId) => {
      const stream = localStreamRef.current;
      if (!stream || peerId === myId || pcsRef.current.has(peerId) || connectingRef.current.has(peerId)) return;
      if (!(myId < peerId)) return;

      connectingRef.current.add(peerId);
      try {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcsRef.current.set(peerId, pc);

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (ev) => {
          if (ev.candidate && sendRef.current) {
            sendRef.current({
              type: "voice_ice",
              to: peerId,
              candidate: ev.candidate.toJSON(),
            });
          }
        };

        pc.ontrack = (ev) => {
          const remote = ev.streams[0];
          if (remote) attachRemoteAudio(peerId, remote);
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (sendRef.current) {
          sendRef.current({
            type: "voice_offer",
            to: peerId,
            sdp: offer.sdp,
          });
        }
      } catch {
        cleanupPeer(peerId);
      } finally {
        connectingRef.current.delete(peerId);
      }
    },
    [attachRemoteAudio, cleanupPeer, myId],
  );

  const connectAsCallerRef = useRef(connectAsCaller);
  connectAsCallerRef.current = connectAsCaller;

  const flushPendingRef = useRef(flushPendingOffers);
  flushPendingRef.current = flushPendingOffers;

  useEffect(() => {
    const s = localStreamRef.current;
    if (!s) return;
    s.getAudioTracks().forEach((track) => {
      track.enabled = !micMuted;
    });
  }, [micMuted]);

  useEffect(() => {
    audioElsRef.current.forEach((el) => {
      el.muted = deafened;
      el.volume = deafened ? 0 : 1;
    });
  }, [deafened]);

  useEffect(() => {
    if (!registerWsHandler) return undefined;

    async function onOffer(msg) {
      if (msg.from === myId) return;
      const sdp = msg.sdp;
      if (typeof sdp !== "string") return;

      if (!localStreamRef.current) {
        pendingOffersRef.current.set(msg.from, sdp);
        return;
      }
      try {
        await establishCalleeRef.current(msg.from, sdp);
      } catch {
        /* ignore */
      }
    }

    async function onAnswer(msg) {
      if (msg.from === myId) return;
      const sdp = msg.sdp;
      if (typeof sdp !== "string") return;
      const pc = pcsRef.current.get(msg.from);
      if (!pc) return;
      try {
        await pc.setRemoteDescription({ type: "answer", sdp });
      } catch {
        /* ignore */
      }
    }

    async function onIce(msg) {
      if (msg.from === myId) return;
      const pc = pcsRef.current.get(msg.from);
      if (!pc || !msg.candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } catch {
        /* ignore */
      }
    }

    const unsubs = [
      registerWsHandler("voice_offer", onOffer),
      registerWsHandler("voice_answer", onAnswer),
      registerWsHandler("voice_ice", onIce),
    ];
    return () => unsubs.forEach((u) => u());
  }, [registerWsHandler, myId]);

  const peerIdsKey = peerIds.slice().sort().join(",");

  useEffect(() => {
    if (!enabled || peerIds.length === 0) {
      teardownAll();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          localStreamRef.current = stream;
          stream.getAudioTracks().forEach((track) => {
            track.enabled = !micMutedRef.current;
          });
          setVoiceError(null);
        }

        setVoiceActive(true);

        await flushPendingRef.current();
        if (cancelled) return;

        const peers = peerIdsRef.current;
        const set = new Set(peers);
        for (const pid of [...pcsRef.current.keys()]) {
          if (!set.has(pid)) cleanupPeer(pid);
        }

        for (const peerId of peers) {
          if (myId < peerId && !pcsRef.current.has(peerId)) {
            await connectAsCallerRef.current(peerId);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setVoiceError(e?.message || "Microphone unavailable");
          setVoiceActive(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, peerIdsKey, myId, teardownAll, cleanupPeer]);

  return { voiceError, voiceActive };
}
