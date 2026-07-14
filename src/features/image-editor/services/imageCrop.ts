import * as ImageManipulator from 'expo-image-manipulator';
import { Size, CropRect, Stroke, Overlay } from '../state/editorTypes';

export async function applyPhysicalCrop(
  uri: string,
  cropRect: CropRect,
  originalSize: Size,
  currentStrokes: Stroke[],
  currentOverlays: Overlay[]
): Promise<{ workingImageUri: string; workingImageSize: Size; adjustedStrokes: Stroke[]; adjustedOverlays: Overlay[] } | null> {
  try {
    // 1. Physically crop the working image using ImageManipulator
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          crop: {
            originX: cropRect.x,
            originY: cropRect.y,
            width: cropRect.width,
            height: cropRect.height,
          },
        },
      ],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );

    const newSize: Size = { width: manipResult.width, height: manipResult.height };

    // 2. Adjust all strokes: they must shift by the negative offset of the crop origin.
    // If a stroke goes outside the new bounds, that's fine—it will just be drawn outside (or cropped by Skia Canvas)
    const adjustedStrokes: Stroke[] = currentStrokes.map(stroke => ({
      ...stroke,
      points: stroke.points.map(pt => ({
        x: pt.x - cropRect.x,
        y: pt.y - cropRect.y,
      }))
    }));

    // 3. Adjust overlays the same way.
    const adjustedOverlays: Overlay[] = currentOverlays.map(overlay => ({
      ...overlay,
      x: overlay.x - cropRect.x,
      y: overlay.y - cropRect.y,
    }));

    return {
      workingImageUri: manipResult.uri,
      workingImageSize: newSize,
      adjustedStrokes,
      adjustedOverlays
    };
  } catch (error) {
    console.warn('Physical crop failed:', error);
    return null;
  }
}

export async function applyPhysicalRotation(
  uri: string,
  originalSize: Size,
  currentStrokes: Stroke[],
  currentOverlays: Overlay[]
): Promise<{ workingImageUri: string; workingImageSize: Size; adjustedStrokes: Stroke[]; adjustedOverlays: Overlay[] } | null> {
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ rotate: 90 }],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );

    const newSize: Size = { width: manipResult.width, height: manipResult.height };

    // 90 degrees clockwise mapping:
    // newX = oldHeight - oldY
    // newY = oldX
    const adjustedStrokes: Stroke[] = currentStrokes.map(stroke => ({
      ...stroke,
      points: stroke.points.map(pt => ({
        x: originalSize.height - pt.y,
        y: pt.x,
      }))
    }));

    const adjustedOverlays: Overlay[] = currentOverlays.map(overlay => ({
      ...overlay,
      x: originalSize.height - overlay.y,
      y: overlay.x,
      // Text rotation would increment by 90 degrees if we tracked degrees, but we track radians or degrees depending on implementation.
      // Reanimated usually uses radians for rotates, but wait, the Overlay uses radians?
      // Assuming rotation is stored in degrees/radians, let's just add 90 degrees to it.
      // If our rotation state is radians, it's + Math.PI/2
      // Let's assume rads for now based on useAnimatedStyle
      rotation: (overlay.rotation || 0) + (Math.PI / 2)
    }));

    return {
      workingImageUri: manipResult.uri,
      workingImageSize: newSize,
      adjustedStrokes,
      adjustedOverlays
    };

  } catch (err) {
    console.warn('Physical rotation failed:', err);
    return null;
  }
}
