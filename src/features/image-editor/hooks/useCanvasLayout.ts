import { useCallback, useState, useEffect } from 'react';
import { LayoutChangeEvent } from 'react-native';
import { Size, ImageRect } from '../state/editorTypes';
import { getImageDisplayRect } from '../services/imageLayout';

export function useCanvasLayout(
  imageSize: Size,
  setDisplayedImageRect: (rect: ImageRect) => void
) {
  const [containerSize, setContainerSize] = useState<Size | null>(null);

  // Recalculate whenever the image size changes (e.g., after crop/rotate)
  useEffect(() => {
    if (containerSize) {
      const displayRect = getImageDisplayRect(
        containerSize.width, 
        containerSize.height, 
        imageSize.width, 
        imageSize.height
      );
      setDisplayedImageRect(displayRect);
    }
  }, [imageSize.width, imageSize.height, containerSize, setDisplayedImageRect]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setContainerSize({ width, height });

      // Calculate the physical rect where pixels will be drawn
      const displayRect = getImageDisplayRect(width, height, imageSize.width, imageSize.height);
      setDisplayedImageRect(displayRect);
    },
    [imageSize.width, imageSize.height, setDisplayedImageRect]
  );

  return { containerSize, onLayout };
}
