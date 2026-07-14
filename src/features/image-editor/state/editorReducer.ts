import { EditorState, EditorMode, Stroke, TextOverlay, Overlay, ImageRect, Size } from './editorTypes';

export type EditorAction =
  | { type: 'SET_MODE'; payload: EditorMode }
  | { type: 'SET_ACTIVE_COLOR'; payload: string }
  | { type: 'SET_DISPLAY_RECT'; payload: ImageRect }
  | { type: 'ADD_STROKE'; payload: Stroke }
  | { type: 'ADD_TEXT_OVERLAY'; payload: TextOverlay }
  | { type: 'UPDATE_OVERLAY'; payload: Partial<Overlay> & { id: string } }
  | { type: 'DELETE_OVERLAY'; payload: string }
  | { type: 'SET_ACTIVE_OVERLAY'; payload: string | null }
  | { type: 'APPLY_CROP_RESULT'; payload: { workingImageUri: string; workingImageSize: Size; adjustedStrokes: Stroke[]; adjustedOverlays: Overlay[] } }
  | { type: 'RESTORE_STATE'; payload: EditorState }
  | { type: 'RESET'; payload: EditorState };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload };

    case 'SET_ACTIVE_COLOR':
      return { ...state, activeColor: action.payload };

    case 'SET_DISPLAY_RECT':
      // The displayed screen rect isn't "dirtying" the image's content itself
      return { ...state, displayedImageRect: action.payload };

    case 'ADD_STROKE':
      return {
        ...state,
        strokes: [...state.strokes, action.payload],
        isDirty: true,
      };

    case 'ADD_TEXT_OVERLAY':
      return {
        ...state,
        overlays: [...state.overlays, action.payload],
        activeOverlayId: action.payload.id,
        isDirty: true,
      };

    case 'UPDATE_OVERLAY':
      return {
        ...state,
        overlays: state.overlays.map((ov) =>
          ov.id === action.payload.id ? { ...ov, ...action.payload } as Overlay : ov
        ),
        isDirty: true,
      };

    case 'DELETE_OVERLAY':
      return {
        ...state,
        overlays: state.overlays.filter((ov) => ov.id !== action.payload),
        activeOverlayId: state.activeOverlayId === action.payload ? null : state.activeOverlayId,
        isDirty: true,
      };

    case 'SET_ACTIVE_OVERLAY':
      return { ...state, activeOverlayId: action.payload };

    case 'APPLY_CROP_RESULT':
      return {
        ...state,
        workingImageUri: action.payload.workingImageUri,
        workingImageSize: action.payload.workingImageSize,
        strokes: action.payload.adjustedStrokes,
        overlays: action.payload.adjustedOverlays,
        isDirty: true,
      };

    case 'RESTORE_STATE':
      return action.payload;

    case 'RESET':
      return action.payload;

    default:
      return state;
  }
}
