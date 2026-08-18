/**
 * THE ORDER AN ALERT HAS TO CLOSE IN.
 *
 * AppAlertHost overrides `Alert.alert` app-wide and draws the dialog as a React
 * Native <Modal>. On iOS a <Modal> is a real UIViewController presented on the
 * window — so when a button's handler opens ANOTHER modal (the admin product
 * list's Edit button does exactly this), iOS is asked to present a second view
 * controller while the first is still up and about to be dismissed. The second
 * presentation is dropped, the first tears down its presentation chain, and what
 * is left is an invisible controller swallowing every touch. The app freezes.
 *
 * On Android a <Modal> is a Dialog. Dialogs stack, and dismissing one does not
 * disturb another — which is exactly why this bug is invisible on Android and
 * only ever reported on iPhone.
 *
 * The rule this file enforces is one line: THE BUTTON'S HANDLER RUNS AFTER THE
 * DIALOG IS GONE, NEVER BEFORE. It is a sequencer rather than a delay because a
 * delay is a guess about animation timing; `dialogDismissed()` is called from the
 * Modal's own onDismiss on iOS, which is the platform telling us the controller
 * has finished going away.
 */
export interface AlertCloseSequencer {
  /** Called when a button is pressed: remember its handler, do not run it yet. */
  arm(handler?: (() => void) | null): void;
  /** Called once the dialog's modal has actually gone. Runs the handler. */
  dialogDismissed(): void;
  /**
   * Escape hatch for a platform that does not report dismissal (Android has no
   * Modal.onDismiss). Runs the handler only if `dialogDismissed` has not already.
   */
  flushIfPending(): void;
  /** For tests and for asserting we never drop a handler. */
  hasPending(): boolean;
}

export function createAlertCloseSequencer(): AlertCloseSequencer {
  let pending: (() => void) | null = null;

  const run = () => {
    const handler = pending;
    // Cleared BEFORE running: a handler that itself opens another alert must not
    // be able to re-enter this one, and a throwing handler must not be retried.
    pending = null;
    if (!handler) return;
    try {
      handler();
    } catch {
      /* swallow, exactly as the old inline try/catch did — the dialog is already
         closed by this point, so a throwing handler must not strand the UI */
    }
  };

  return {
    arm(handler) {
      pending = handler ?? null;
    },
    dialogDismissed() {
      run();
    },
    flushIfPending() {
      run();
    },
    hasPending() {
      return pending !== null;
    },
  };
}
