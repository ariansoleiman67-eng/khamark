import React, { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FileMetadata } from '../services/chatService';
import { useVoiceMessagePlayer } from './voice/useVoiceMessagePlayer';

type ChatTheme = {
  dark: boolean;
  colors: {
    primary: string;
    surface: string;
    text: string;
    textSecondary: string;
  };
};

type Props = {
  id?: string;
  mine: boolean;
  fileMetadata?: FileMetadata | null;
  attachmentUrl?: string | null;
  time: string;
  theme: ChatTheme;
};

export const VoiceBubble: React.FC<Props> = ({
  id,
  mine,
  fileMetadata,
  attachmentUrl,
  time,
  theme,
}) => {
  const generatedIdRef = useRef(
    id ??
      `voice-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  );

  const stableId = generatedIdRef.current;

  const {
    player,
    isPreparing,
    playbackRate,
    progress,
    waveform,
    displayDurationText,
    statusLabel,
    handlePlayPause,
    handleTogglePlaybackRate,
    handleWaveformPress,
    onWaveformLayout,
    panResponder,
  } = useVoiceMessagePlayer({
    id: stableId,
    attachmentUrl,
    durationHint: fileMetadata?.duration || 0,
    waveform: (fileMetadata as any)?.waveform ?? null,
  });

  const colors = useMemo(() => {
    const bubbleBg = mine
      ? theme.dark
        ? theme.colors.primary
        : '#20A090'
      : theme.dark
      ? theme.colors.surface
      : '#F2F7FB';

    return {
      bubbleBg,
      iconColor: mine ? '#FFFFFF' : theme.colors.primary,
      primaryText: mine ? 'rgba(255,255,255,0.92)' : theme.colors.text,
      secondaryText: mine
        ? 'rgba(255,255,255,0.68)'
        : theme.colors.textSecondary,
      controlBg: mine ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.06)',
      speedBg: mine ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)',
      playedBar: mine ? '#FFFFFF' : theme.colors.primary,
      upcomingBar: mine ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.12)',
    };
  }, [mine, theme]);

  const showSpeedControl =
    player.isLoaded || player.positionMillis > 0 || player.isPlaying;

  return (
    <View
      style={[
        styles.wrapper,
        {
          alignSelf: mine ? 'flex-end' : 'flex-start',
          maxWidth: '84%',
        },
      ]}
    >
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: colors.bubbleBg,
            borderBottomRightRadius: mine ? 4 : 20,
            borderBottomLeftRadius: mine ? 20 : 4,
          },
        ]}
      >
        <Pressable
          onPress={handlePlayPause}
          disabled={!attachmentUrl || isPreparing}
          accessibilityRole="button"
          accessibilityLabel={
            player.isPlaying ? 'Pause voice message' : 'Play voice message'
          }
          hitSlop={8}
          style={[
            styles.playButton,
            {
              backgroundColor: colors.controlBg,
            },
          ]}
        >
          {isPreparing ? (
            <ActivityIndicator size="small" color={colors.iconColor} />
          ) : (
            <Ionicons
              name={player.isPlaying ? 'pause' : 'play'}
              size={18}
              color={colors.iconColor}
              style={{ marginLeft: player.isPlaying ? 0 : 2 }}
            />
          )}
        </Pressable>

        <View style={styles.content}>
          <Pressable
            onPress={handleWaveformPress}
            disabled={!attachmentUrl}
            style={styles.waveformPressable}
          >
            <View
              onLayout={onWaveformLayout}
              style={styles.waveformContainer}
              {...panResponder.panHandlers}
            >
              {waveform.map((barHeight, index) => {
                const barEndProgress = (index + 1) / waveform.length;
                const isPlayed = barEndProgress <= progress;

                return (
                  <View
                    key={`bar-${index}`}
                    style={[
                      styles.waveBar,
                      {
                        height: barHeight,
                        backgroundColor: isPlayed
                          ? colors.playedBar
                          : colors.upcomingBar,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </Pressable>

          <View style={styles.footerRow}>
            <View style={styles.metaLeft}>
              {showSpeedControl ? (
                <Pressable
                  onPress={handleTogglePlaybackRate}
                  accessibilityRole="button"
                  accessibilityLabel={`Playback speed ${playbackRate}x`}
                  hitSlop={6}
                  style={[
                    styles.speedButton,
                    { backgroundColor: colors.speedBg },
                  ]}
                >
                  <Text allowFontScaling={false}
                    style={[
                      styles.speedButtonText,
                      { color: mine ? '#FFFFFF' : theme.colors.primary },
                    ]}
                  >
                    {playbackRate}x
                  </Text>
                </Pressable>
              ) : null}

              <Text allowFontScaling={false}
                numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
                style={[
                  styles.durationText,
                  { color: colors.primaryText },
                ]}
              >
                {displayDurationText}
              </Text>

              {statusLabel ? (
                <Text allowFontScaling={false}
                  numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
                  style={[
                    styles.statusText,
                    { color: colors.secondaryText },
                  ]}
                >
                  {statusLabel}
                </Text>
              ) : null}
            </View>

            <Text allowFontScaling={false}
              style={[
                styles.timeText,
                { color: colors.secondaryText },
              ]}
            >
              {time}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 230,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  content: {
    flex: 1,
  },
  waveformPressable: {
    width: '100%',
  },
  waveformContainer: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  waveBar: {
    flex: 1,
    borderRadius: 999,
  },
  footerRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    flex: 1,
    marginRight: 8,
  },
  speedButton: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 6,
  },
  speedButtonText: {
    fontSize: 10,
    fontWeight: '700',
  },
  durationText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusText: {
    marginLeft: 6,
    fontSize: 10,
    flexShrink: 1,
  },
  timeText: {
    fontSize: 10,
  },
});

export default React.memo(VoiceBubble);
