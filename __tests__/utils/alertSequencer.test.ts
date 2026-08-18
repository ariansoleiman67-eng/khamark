import { createAlertCloseSequencer } from '../../src/components/alertSequencer';

// The invariant is the whole fix: a button's handler must not run while the
// dialog's own <Modal> is still on screen, because on iOS that means presenting
// a second UIViewController from one that is dismissing — which freezes the app.
describe('alert close sequencer', () => {
  it('does not run the handler when the button is pressed', () => {
    const seq = createAlertCloseSequencer();
    const handler = jest.fn();
    seq.arm(handler);
    expect(handler).not.toHaveBeenCalled();
    expect(seq.hasPending()).toBe(true);
  });

  it('runs the handler once the dialog reports it has gone', () => {
    const seq = createAlertCloseSequencer();
    const handler = jest.fn();
    seq.arm(handler);
    seq.dialogDismissed();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('runs the handler exactly once even if dismissal is reported twice', () => {
    const seq = createAlertCloseSequencer();
    const handler = jest.fn();
    seq.arm(handler);
    seq.dialogDismissed();
    seq.dialogDismissed();
    seq.flushIfPending();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lets a platform without Modal.onDismiss flush the handler itself', () => {
    const seq = createAlertCloseSequencer();
    const handler = jest.fn();
    seq.arm(handler);
    seq.flushIfPending();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for a button with no handler, such as Cancel', () => {
    const seq = createAlertCloseSequencer();
    seq.arm(undefined);
    expect(seq.hasPending()).toBe(false);
    expect(() => seq.dialogDismissed()).not.toThrow();
  });

  it('clears the handler BEFORE running it, so a handler that opens another alert cannot re-enter', () => {
    const seq = createAlertCloseSequencer();
    const seen: string[] = [];
    seq.arm(() => {
      seen.push(`pendingDuringRun=${seq.hasPending()}`);
      seq.flushIfPending(); // an alert opened from inside a handler must not re-run it
    });
    seq.dialogDismissed();
    expect(seen).toEqual(['pendingDuringRun=false']);
  });

  it('a throwing handler does not strand the dialog or get retried', () => {
    const seq = createAlertCloseSequencer();
    const boom = jest.fn(() => {
      throw new Error('handler blew up');
    });
    seq.arm(boom);
    expect(() => seq.dialogDismissed()).not.toThrow();
    seq.flushIfPending();
    expect(boom).toHaveBeenCalledTimes(1);
  });
});
