import { useReducer, useCallback } from 'react';
import { editorReducer } from '../state/editorReducer';
import { createInitialEditorState } from '../state/editorInitialState';
import { useEditorHistory } from './useEditorHistory';
import { EditorState, Size, Stroke, TextOverlay, Overlay, ImageRect, EditorMode } from '../state/editorTypes';

export function useImageEditor(initialUri: string, initialSize: Size) {
  const [state, dispatch] = useReducer(
    editorReducer,
    { uri: initialUri, size: initialSize },
    (args) => createInitialEditorState(args.uri, args.size)
  );

  const dispatchRestore = useCallback((restoredState: EditorState) => {
    dispatch({ type: 'RESTORE_STATE', payload: restoredState });
  }, []);

  const history = useEditorHistory(state, dispatchRestore);

  const setMode = useCallback((mode: EditorMode) => {
    dispatch({ type: 'SET_MODE', payload: mode });
  }, []);

  const setActiveColor = useCallback((color: string) => {
    dispatch({ type: 'SET_ACTIVE_COLOR', payload: color });
  }, []);

  const setDisplayedImageRect = useCallback((rect: ImageRect) => {
    dispatch({ type: 'SET_DISPLAY_RECT', payload: rect });
  }, []);

  const addStroke = useCallback((stroke: Stroke) => {
    dispatch({ type: 'ADD_STROKE', payload: stroke });
  }, []);

  const addTextOverlay = useCallback((overlay: TextOverlay) => {
    dispatch({ type: 'ADD_TEXT_OVERLAY', payload: overlay });
  }, []);

  const updateOverlay = useCallback((id: string, updates: Partial<Overlay>) => {
    dispatch({ type: 'UPDATE_OVERLAY', payload: { ...updates, id } });
  }, []);

  const deleteOverlay = useCallback((id: string) => {
    dispatch({ type: 'DELETE_OVERLAY', payload: id });
  }, []);

  const setActiveOverlay = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_OVERLAY', payload: id });
  }, []);

  const applyCropResult = useCallback((workingImageUri: string, workingImageSize: Size, adjustedStrokes: Stroke[], adjustedOverlays: Overlay[]) => {
    dispatch({ 
      type: 'APPLY_CROP_RESULT', 
      payload: { workingImageUri, workingImageSize, adjustedStrokes, adjustedOverlays }
    });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET', payload: createInitialEditorState(initialUri, initialSize) });
    history.clearHistory();
  }, [initialUri, initialSize, history]);

  return {
    state,
    actions: {
      setMode,
      setActiveColor,
      setDisplayedImageRect,
      addStroke,
      addTextOverlay,
      updateOverlay,
      deleteOverlay,
      setActiveOverlay,
      applyCropResult,
      reset,
    },
    history,
  };
}
