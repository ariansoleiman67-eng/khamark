import { ImageRect, Size } from '../state/editorTypes';

/**
 * Calculates the bounding rectangle of an image natively fitted inside a container
 * using the 'contain' content fit mode.
 * 
 * @param containerW Available width on screen
 * @param containerH Available height on screen
 * @param imageW Original image width
 * @param imageH Original image height
 * @returns The physical x, y, width, and height of the image on the screen
 */
export function getImageDisplayRect(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number
): ImageRect {
  if (!containerW || !containerH || !imageW || !imageH) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const containerRatio = containerW / containerH;
  const imageRatio = imageW / imageH;

  let displayW = 0;
  let displayH = 0;

  if (imageRatio > containerRatio) {
    // Image is wider than container - bounded by width
    displayW = containerW;
    displayH = containerW / imageRatio;
  } else {
    // Image is taller than container - bounded by height
    displayH = containerH;
    displayW = containerH * imageRatio;
  }

  // Center it exactly
  const displayX = (containerW - displayW) / 2;
  const displayY = (containerH - displayH) / 2;

  return {
    x: displayX,
    y: displayY,
    width: displayW,
    height: displayH,
  };
}
