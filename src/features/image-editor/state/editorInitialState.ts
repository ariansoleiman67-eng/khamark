import { EditorState, Size } from './editorTypes';

export function createInitialEditorState(
  imageUri: string,
  imageSize: Size
): EditorState {
  return {
    mode: 'preview',
    workingImageUri: imageUri,
    workingImageSize: imageSize,
    displayedImageRect: null,
    strokes: [],
    overlays: [],
    activeOverlayId: null,
    activeColor: '#FF0000', // Default WhatsApp red
    isDirty: false,
  };
}
