import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, Image as RNImage, Alert } from 'react-native';
import { useImageEditor } from '../hooks/useImageEditor';
import { EditorCanvas } from './EditorCanvas';
import { OverlayWrapper } from './OverlayWrapper';
import { TextOverlay } from './TextOverlay';
import { TextInputModal } from './TextInputModal';
import { EditorHeader } from './EditorHeader';
import { EditorToolbar } from './EditorToolbar';
import { CropOverlay } from './CropOverlay';

interface Props {
  uri: string;
  onSave: (editedUri: string) => void;
  onDiscard: () => void;
}

interface InnerProps extends Props {
  imageSize: { width: number; height: number };
}

export function ImageEditorScreen(props: Props) {
  const [imageSize, setImageSize] = useState<{width: number, height: number} | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      RNImage.getSize(props.uri, (width, height) => {
        if (!cancelled) setImageSize({ width, height });
      }, () => {
        // fallback
        if (!cancelled) setImageSize({ width: 1000, height: 1000 });
      });
    } catch {
      if (!cancelled) setImageSize({ width: 1000, height: 1000 });
    }
    return () => { cancelled = true; };
  }, [props.uri]);

  if (!imageSize) {
    return <View style={styles.container}><Text allowFontScaling={false} style={{ color: 'white' }}>Loading editor...</Text></View>;
  }

  return <ImageEditorScreenInner {...props} imageSize={imageSize} />;
}

function ImageEditorScreenInner({ uri, onSave, onDiscard, imageSize }: InnerProps) {
  const { state, actions, history } = useImageEditor(uri, imageSize);
  const exportRef = React.useRef<View>(null);

  const handleDone = async () => {
    actions.setMode('preview'); // Disable any active editors/boxes before capturing
    
    // Quick delay to allow UI to settle the mode change
    await new Promise(r => setTimeout(r, 100));

    const finalUri = await require('../services/imageExport').captureFinalImage(exportRef);
    if (finalUri) {
      onSave(finalUri);
    } else {
      onDiscard();
    }
  };

  return (
    <View style={styles.container}>
      {/* EditorHeader */}
      {state.mode !== 'crop' && (
        <EditorHeader
          canUndo={history.canUndo}
          onUndo={history.undo}
          onCancel={() => {
            if (state.isDirty) {
              Alert.alert('Discard Edits', 'Are you sure you want to discard your edits?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: onDiscard },
              ]);
            } else {
              onDiscard();
            }
          }}
          onDone={handleDone}
        />
      )}

      <View ref={exportRef} style={StyleSheet.absoluteFill} collapsable={false}>
        {/* EditorCanvas */}
        <EditorCanvas 
          state={state} 
          setDisplayedImageRect={actions.setDisplayedImageRect} 
          addStroke={actions.addStroke}
          pushHistory={history.pushHistory}
        />

        {/* Overlays rendered on top of canvas */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}>
        {state.overlays.map((ov) => (
          <OverlayWrapper
            key={ov.id}
            overlay={ov}
            displayedImageRect={state.displayedImageRect}
            workingImageSize={state.workingImageSize}
            isActive={state.activeOverlayId === ov.id}
            onUpdate={actions.updateOverlay}
            onActivate={actions.setActiveOverlay}
          >
            {ov.type === 'text' && <TextOverlay overlay={ov} />}
          </OverlayWrapper>
        ))}
      </View>
      </View>

      <TextInputModal
        visible={state.mode === 'text' && !state.activeOverlayId}
        initialColor={state.activeColor}
        onSave={(text: string, color: string) => {
          actions.addTextOverlay({
            id: require('../utils/generateId').generateId(),
            type: 'text',
            text,
            color,
            x: state.workingImageSize.width / 2,
            y: state.workingImageSize.height / 2,
            scale: 1,
            rotation: 0,
          });
          actions.setMode('preview');
          history.pushHistory();
        }}
        onCancel={() => actions.setMode('preview')}
      />

      {state.mode === 'crop' && state.displayedImageRect && (
        <CropOverlay
          displayedImageRect={state.displayedImageRect}
          workingImageSize={state.workingImageSize}
          onApplyCrop={async (cropRect: any) => {
            const result = await require('../services/imageCrop').applyPhysicalCrop(
              state.workingImageUri,
              cropRect,
              state.workingImageSize,
              state.strokes,
              state.overlays
            );
            if (result) {
              actions.applyCropResult(
                result.workingImageUri,
                result.workingImageSize,
                result.adjustedStrokes,
                result.adjustedOverlays
              );
              history.pushHistory();
            }
            actions.setMode('preview');
          }}
          onRotate={async () => {
            const result = await require('../services/imageCrop').applyPhysicalRotation(
              state.workingImageUri,
              state.workingImageSize,
              state.strokes,
              state.overlays
            );
            if (result) {
              actions.applyCropResult(
                result.workingImageUri,
                result.workingImageSize,
                result.adjustedStrokes,
                result.adjustedOverlays
              );
              history.pushHistory();
            }
          }}
          onCancel={() => actions.setMode('preview')}
        />
      )}

      {/* EditorToolbar */}
      {state.mode !== 'crop' && (
        <EditorToolbar
          mode={state.mode}
          setMode={actions.setMode}
          activeColor={state.activeColor}
          setActiveColor={actions.setActiveColor}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
