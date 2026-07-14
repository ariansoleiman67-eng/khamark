import { Point, ImageRect, Size } from '../state/editorTypes';
import { clamp } from '../utils/clamp';

/**
 * Converts a screen coordinate point to an image-relative pixel coordinate.
 */
export function screenToImagePoint(
  screenPoint: Point,
  displayedImageRect: ImageRect,
  originalImageSize: Size
): Point {
  if (!displayedImageRect || !originalImageSize) return { x: 0, y: 0 };

  // Calculate scaling factor from physical screen size compared to underlying pixels
  const scaleX = originalImageSize.width / displayedImageRect.width;
  const scaleY = originalImageSize.height / displayedImageRect.height;

  return {
    x: (screenPoint.x - displayedImageRect.x) * scaleX,
    y: (screenPoint.y - displayedImageRect.y) * scaleY,
  };
}

/**
 * Converts an image-relative pixel coordinate back to a screen coordinate point.
 */
export function imageToScreenPoint(
  imagePoint: Point,
  displayedImageRect: ImageRect,
  originalImageSize: Size
): Point {
  if (!displayedImageRect || !originalImageSize) return { x: 0, y: 0 };

  const scaleX = displayedImageRect.width / originalImageSize.width;
  const scaleY = displayedImageRect.height / originalImageSize.height;

  return {
    x: displayedImageRect.x + imagePoint.x * scaleX,
    y: displayedImageRect.y + imagePoint.y * scaleY,
  };
}

/**
 * Clamps a point to be strictly inside the original real image dimensions.
 */
export function clampPointToImage(point: Point, originalImageSize: Size): Point {
  return {
    x: clamp(point.x, 0, originalImageSize.width),
    y: clamp(point.y, 0, originalImageSize.height),
  };
}
