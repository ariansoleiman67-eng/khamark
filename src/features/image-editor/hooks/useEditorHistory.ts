import { useCallback, useRef, useState } from 'react';
import { EditorState } from '../state/editorTypes';

export function useEditorHistory(
  currentState: EditorState,
  dispatchRestore: (state: EditorState) => void
) {
  const [canUndo, setCanUndo] = useState(false);
  const historyStack = useRef<EditorState[]>([]);

  /**
   * Push a snapshot to the undo stack.
   * Call this ONLY after an action is fully completed (e.g. at the end of a gesture or path),
   * NOT during live updates.
   */
  const pushHistory = useCallback(() => {
    // Deep clone the pieces of state that matter for undo
    // to prevent mutations from altering history.
    const snapshot: EditorState = {
      ...currentState,
      strokes: [...currentState.strokes.map(s => ({ ...s, points: [...s.points] }))],
      overlays: [...currentState.overlays.map(o => ({ ...o }))],
    };

    historyStack.current.push(snapshot);
    setCanUndo(historyStack.current.length > 0);
  }, [currentState]);

  /**
   * Pop the last state from the undo stack and dispatch it back.
   */
  const undo = useCallback(() => {
    if (historyStack.current.length === 0) return;

    const previousState = historyStack.current.pop();
    if (previousState) {
      dispatchRestore(previousState);
    }
    setCanUndo(historyStack.current.length > 0);
  }, [dispatchRestore]);

  /**
   * Reset the history entirely (e.g., when closing).
   */
  const clearHistory = useCallback(() => {
    historyStack.current = [];
    setCanUndo(false);
  }, []);

  return { pushHistory, undo, canUndo, clearHistory };
}
