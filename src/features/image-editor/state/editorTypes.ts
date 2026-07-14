export type EditorMode = 'preview' | 'draw' | 'text' | 'crop';

export type ImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Stroke = {
  id: string;
  points: Point[]; // image-relative or image-space
  color: string;
  width: number;
};

export type TextOverlay = {
  id: string;
  type: 'text';
  text: string;
  color: string;
  x: number; // image-space
  y: number; // image-space
  scale: number;
  rotation: number;
};

export type Overlay = TextOverlay;

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EditorState = {
  mode: EditorMode;
  workingImageUri: string;
  workingImageSize: Size;
  displayedImageRect: ImageRect | null;
  strokes: Stroke[];
  overlays: Overlay[];
  activeOverlayId: string | null;
  activeColor: string;
  isDirty: boolean;
};
