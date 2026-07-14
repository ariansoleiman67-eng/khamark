import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
} from 'react-native';
import {
  AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';
import { useVoiceMessagePlayback } from './VoiceMessagePlaybackProvider';

export type PlaybackRate = 1 | 1.5 | 2;

type UseVoiceMessagePlayerArgs = {
  id: string;
  attachmentUrl?: string | null;
  durationHint?: number;
  waveform?: number[] | null;
};

export type VoicePlayerState = {
  isLoaded: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  isSeeking: boolean;
  hasError: boolean;
  positionMillis: number;
  durationMillis: number;
};

const BAR_COUNT = 40;
const MIN_BAR_HEIGHT = 5;
const MAX_BAR_HEIGHT = 24;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatMillis = (millis: number) => {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const nextPlaybackRate = (rate: PlaybackRate): PlaybackRate => {
  if (rate === 1) return 1.5;
  if (rate === 1.5) return 2;
  return 1;
};

const buildFallbackWaveform = () =>
  Array.from({ length: BAR_COUNT }, (_, i) => {
    const seed = Math.abs(Math.sin(i * 1.37) + Math.cos(i * 0.63));
    return MIN_BAR_HEIGHT + seed * 8;
  });

const downsampleWaveform = (input: number[], targetBars: number) => {
  if (!input.length) return [];
  if (input.length === targetBars) return input;

  const chunkSize = input.length / targetBars;
  const result: number[] = [];

  for (let i = 0; i < targetBars; i += 1) {
    const start = Math.floor(i * chunkSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * chunkSize));
    const slice = input.slice(start, end);

    const avg =
      slice.reduce((sum, value) => sum + value, 0) / Math.max(slice.length, 1);

    result.push(avg);
  }

  return result;
};

const normalizeWaveform = (waveform?: number[] | null) => {
  const source =
    waveform && waveform.length > 0
      ? downsampleWaveform(waveform, BAR_COUNT)
      : buildFallbackWaveform();

  const min = Math.min(...source);
  const max = Math.max(...source);

  if (max === min) {
    return source.map(() => 12);
  }

  return source.map((value) => {
    const normalized = (value - min) / (max - min);
    return Math.round(
      MIN_BAR_HEIGHT + normalized * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT)
    );
  });
};

export const useVoiceMessagePlayer = ({
  id,
  attachmentUrl,
  durationHint = 0,
  waveform,
}: UseVoiceMessagePlayerArgs) => {
  const { activePlaybackId, setActivePlaybackId } = useVoiceMessagePlayback();

  const playerRef = useRef<AudioPlayer | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const waveformWidthRef = useRef(1);
  const scrubWasPlayingRef = useRef(false);
  const activeIdRef = useRef(activePlaybackId);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    activeIdRef.current = activePlaybackId;
  }, [activePlaybackId]);

  const [isPreparing, setIsPreparing] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const [previewPositionMillis, setPreviewPositionMillis] = useState<number | null>(null);

  const [player, setPlayer] = useState<VoicePlayerState>({
    isLoaded: false,
    isPlaying: false,
    isBuffering: false,
    isSeeking: false,
    hasError: false,
    positionMillis: 0,
    durationMillis: durationHint,
  });

  const normalizedWaveform = useMemo(
    () => normalizeWaveform(waveform),
    [waveform]
  );

  const durationMillis = player.durationMillis || durationHint || 0;
  const effectivePositionMillis =
    previewPositionMillis ?? player.positionMillis;

  const progress =
    durationMillis > 0
      ? clamp(effectivePositionMillis / durationMillis, 0, 1)
      : 0;

  const displayDurationText =
    player.isPlaying || effectivePositionMillis > 0
      ? formatMillis(effectivePositionMillis)
      : formatMillis(durationMillis);

  const statusLabel = player.hasError
    ? 'failed to load'
    : player.isBuffering
    ? 'buffering...'
    : null;

  const setPartialPlayer = useCallback((patch: Partial<VoicePlayerState>) => {
    if (!mountedRef.current) return;
    setPlayer((prev) => ({ ...prev, ...patch }));
  }, []);

  // Start polling the player's currentTime for progress updates
  const startProgressPolling = useCallback((audioPlayer: AudioPlayer) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = setInterval(() => {
      if (!mountedRef.current || !audioPlayer) return;

      try {
        const currentTimeMs = (audioPlayer.currentTime || 0) * 1000;
        const durationMs = (audioPlayer.duration || 0) * 1000;
        const isPlaying = audioPlayer.playing;
        const isBuffering = audioPlayer.isBuffering;
        const isLoaded = audioPlayer.isLoaded;

        // Check if playback finished
        if (isLoaded && !isPlaying && durationMs > 0 && currentTimeMs >= durationMs - 100) {
          // Playback finished
          if (activeIdRef.current === id) {
            setActivePlaybackId(null);
          }
          setPartialPlayer({
            isLoaded: true,
            isPlaying: false,
            isBuffering: false,
            positionMillis: 0,
            durationMillis: durationMs,
          });
          // Seek back to start
          audioPlayer.seekTo(0);
          return;
        }

        setPartialPlayer({
          isLoaded,
          isPlaying,
          isBuffering,
          positionMillis: currentTimeMs,
          durationMillis: durationMs || durationHint,
        });
      } catch {
        // ignore errors during polling
      }
    }, 100);
  }, [durationHint, id, setActivePlaybackId, setPartialPlayer]);

  const stopProgressPolling = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const applyAudioMode = useCallback(async () => {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
    });
  }, []);

  const unloadSound = useCallback(async () => {
    stopProgressPolling();

    const audioPlayer = playerRef.current;
    playerRef.current = null;

    if (activeIdRef.current === id) {
      setActivePlaybackId(null);
    }

    if (audioPlayer) {
      try {
        audioPlayer.remove();
      } catch {
        // ignore cleanup failures
      }
    }

    setPartialPlayer({
      isLoaded: false,
      isPlaying: false,
      isBuffering: false,
      isSeeking: false,
      hasError: false,
      positionMillis: 0,
      durationMillis: durationHint,
    });
  }, [durationHint, id, setActivePlaybackId, setPartialPlayer, stopProgressPolling]);

  const ensureLoaded = useCallback(async () => {
    if (!attachmentUrl) return null;
    if (playerRef.current) return playerRef.current;

    const requestId = ++requestIdRef.current;

    setIsPreparing(true);
    setPartialPlayer({ hasError: false });

    try {
      await applyAudioMode();

      const audioPlayer = createAudioPlayer(
        { uri: attachmentUrl }
      );

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        audioPlayer.remove();
        return null;
      }

      // Set initial playback rate
      audioPlayer.setPlaybackRate(playbackRate);

      playerRef.current = audioPlayer;

      // Start polling for status updates
      startProgressPolling(audioPlayer);

      return audioPlayer;
    } catch (error) {
      console.error('Failed to load voice message:', error);
      setPartialPlayer({
        hasError: true,
        isLoaded: false,
        isPlaying: false,
        isBuffering: false,
        isSeeking: false,
      });
      return null;
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setIsPreparing(false);
      }
    }
  }, [applyAudioMode, attachmentUrl, playbackRate, setPartialPlayer, startProgressPolling]);

  const pause = useCallback(
    async (releaseOwner = true) => {
      const audioPlayer = playerRef.current;
      if (!audioPlayer) return;

      try {
        if (audioPlayer.playing) {
          audioPlayer.pause();
        }

        if (releaseOwner && activeIdRef.current === id) {
          setActivePlaybackId(null);
        }
      } catch (error) {
        console.error('Failed to pause voice message:', error);
      }
    },
    [id, setActivePlaybackId]
  );

  const play = useCallback(async () => {
    const audioPlayer = await ensureLoaded();
    if (!audioPlayer) return;

    try {
      const currentTimeMs = (audioPlayer.currentTime || 0) * 1000;
      const durationMs = (audioPlayer.duration || 0) * 1000;

      // If finished, seek to start
      const finished = durationMs > 0 && currentTimeMs >= durationMs - 100;
      if (finished) {
        await audioPlayer.seekTo(0);
      }

      await applyAudioMode();
      audioPlayer.setPlaybackRate(playbackRate);

      setActivePlaybackId(id);
      audioPlayer.play();
    } catch (error) {
      console.error('Failed to play voice message:', error);
      setPartialPlayer({ hasError: true, isPlaying: false });
    }
  }, [applyAudioMode, ensureLoaded, id, playbackRate, setActivePlaybackId, setPartialPlayer]);

  const seekToProgress = useCallback(
    async (rawProgress: number, resumeAfterSeek?: boolean) => {
      if (durationMillis <= 0) return;

      const audioPlayer = await ensureLoaded();
      if (!audioPlayer) return;

      const nextProgress = clamp(rawProgress, 0, 1);
      const nextPositionMs = Math.floor(durationMillis * nextProgress);
      const nextPositionSec = nextPositionMs / 1000;

      try {
        setPreviewPositionMillis(nextPositionMs);
        setPartialPlayer({
          isSeeking: true,
          positionMillis: nextPositionMs,
        });

        const wasPlaying = audioPlayer.playing;

        if (wasPlaying) {
          audioPlayer.pause();
        }

        await audioPlayer.seekTo(nextPositionSec);

        if (resumeAfterSeek ?? wasPlaying) {
          setActivePlaybackId(id);
          audioPlayer.play();
        }
      } catch (error) {
        console.error('Failed to seek voice message:', error);
      } finally {
        setPreviewPositionMillis(null);
        setPartialPlayer({ isSeeking: false });
      }
    },
    [durationMillis, ensureLoaded, id, setActivePlaybackId, setPartialPlayer]
  );

  const handlePlayPause = useCallback(() => {
    void (async () => {
      if (!attachmentUrl || isPreparing) return;

      if (player.isPlaying) {
        await pause();
      } else {
        await play();
      }
    })();
  }, [attachmentUrl, isPreparing, pause, play, player.isPlaying]);

  const handleTogglePlaybackRate = useCallback(() => {
    const next = nextPlaybackRate(playbackRate);
    setPlaybackRate(next);

    const audioPlayer = playerRef.current;
    if (audioPlayer) {
      try {
        audioPlayer.setPlaybackRate(next);
      } catch {
        // ignore
      }
    }
  }, [playbackRate]);

  const handleWaveformPress = useCallback(
    (event: GestureResponderEvent) => {
      const width = waveformWidthRef.current || 1;
      const x = clamp(event.nativeEvent.locationX, 0, width);
      const nextProgress = x / width;

      void seekToProgress(nextProgress);
    },
    [seekToProgress]
  );

  const onWaveformLayout = useCallback((event: LayoutChangeEvent) => {
    waveformWidthRef.current = Math.max(1, event.nativeEvent.layout.width);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 6 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),

        onPanResponderGrant: (event) => {
          if (durationMillis <= 0) return;

          if (player.isPlaying) {
            scrubWasPlayingRef.current = true;
            void pause(false);
          } else {
            scrubWasPlayingRef.current = false;
          }

          const width = waveformWidthRef.current || 1;
          const x = clamp(event.nativeEvent.locationX, 0, width);
          const nextProgress = x / width;
          const nextPosition = Math.floor(durationMillis * nextProgress);

          setPreviewPositionMillis(nextPosition);
          setPartialPlayer({
            isSeeking: true,
            positionMillis: nextPosition,
          });
        },

        onPanResponderMove: (event) => {
          if (durationMillis <= 0) return;

          const width = waveformWidthRef.current || 1;
          const x = clamp(event.nativeEvent.locationX, 0, width);
          const nextProgress = x / width;
          const nextPosition = Math.floor(durationMillis * nextProgress);

          setPreviewPositionMillis(nextPosition);
          setPartialPlayer({
            isSeeking: true,
            positionMillis: nextPosition,
          });
        },

        onPanResponderRelease: (event) => {
          if (durationMillis <= 0) return;

          const width = waveformWidthRef.current || 1;
          const x = clamp(event.nativeEvent.locationX, 0, width);
          const nextProgress = x / width;
          const resume = scrubWasPlayingRef.current;

          scrubWasPlayingRef.current = false;
          void seekToProgress(nextProgress, resume);
        },

        onPanResponderTerminate: () => {
          scrubWasPlayingRef.current = false;
          setPreviewPositionMillis(null);
          setPartialPlayer({ isSeeking: false });
        },
      }),
    [durationMillis, pause, player.isPlaying, seekToProgress, setPartialPlayer]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      activePlaybackId &&
      activePlaybackId !== id &&
      playerRef.current &&
      player.isPlaying
    ) {
      void pause(false);
    }
  }, [activePlaybackId, id, pause, player.isPlaying]);

  useEffect(() => {
    void unloadSound();
  }, [attachmentUrl, unloadSound]);

  useEffect(() => {
    return () => {
      void unloadSound();
    };
  }, [unloadSound]);

  return {
    player,
    isPreparing,
    playbackRate,
    progress,
    waveform: normalizedWaveform,
    durationMillis,
    effectivePositionMillis,
    displayDurationText,
    statusLabel,
    handlePlayPause,
    handleTogglePlaybackRate,
    handleWaveformPress,
    onWaveformLayout,
    panResponder,
  };
};
