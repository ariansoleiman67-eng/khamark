import { createSSEParser, readChatbotFrame } from '../../src/utils/sseParser';

describe('createSSEParser', () => {
  it('parses a single complete event', () => {
    const p = createSSEParser();
    expect(p.push('event: content\ndata: {"t":"hi"}\n\n')).toEqual([
      { event: 'content', data: '{"t":"hi"}' },
    ]);
  });

  it('parses several events in one chunk', () => {
    const p = createSSEParser();
    const out = p.push('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n');
    expect(out).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('holds a partial event until the rest arrives', () => {
    const p = createSSEParser();
    expect(p.push('event: content\ndata: {"t":"he')).toEqual([]);
    expect(p.push('llo"}\n\n')).toEqual([{ event: 'content', data: '{"t":"hello"}' }]);
  });

  it('joins multi-line data with newlines, per the SSE spec', () => {
    const p = createSSEParser();
    expect(p.push('data: one\ndata: two\n\n')).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });

  it('ignores comment keep-alives', () => {
    const p = createSSEParser();
    expect(p.push(': keep-alive\n\n')).toEqual([]);
  });

  it('defaults the event name to message when only data is sent', () => {
    const p = createSSEParser();
    expect(p.push('data: plain\n\n')).toEqual([{ event: 'message', data: 'plain' }]);
  });

  it('tolerates CRLF line endings', () => {
    const p = createSSEParser();
    expect(p.push('event: a\r\ndata: 1\r\n\r\n')).toEqual([{ event: 'a', data: '1' }]);
  });

  it('survives a boundary split across the blank line itself', () => {
    const p = createSSEParser();
    expect(p.push('event: a\ndata: 1\n')).toEqual([]);
    expect(p.push('\nevent: b\ndata: 2\n\n')).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('keeps data that is itself empty rather than dropping the event', () => {
    const p = createSSEParser();
    expect(p.push('event: done\ndata: \n\n')).toEqual([{ event: 'done', data: '' }]);
  });

  it('carries no state between separate parsers', () => {
    const a = createSSEParser();
    const b = createSSEParser();
    a.push('event: x\ndata: half');
    expect(b.push('event: y\ndata: 9\n\n')).toEqual([{ event: 'y', data: '9' }]);
  });
});

describe('readChatbotFrame', () => {
  const frames = (raw: string) => createSSEParser().push(raw).map(readChatbotFrame);

  it('reads the named-event envelope (Asankary askChatbot)', () => {
    expect(
      frames('event: delta\ndata: {"text":"Hi"}\n\nevent: done\ndata: \n\n'),
    ).toEqual([{ kind: 'text', text: 'Hi' }, { kind: 'done' }]);
  });

  it('reads the bare envelope the LIVE function sent on 2026-10-02', () => {
    // Captured verbatim from production (probe-009). Every frame of it used to be
    // ignored, so each answer ended empty and the shopper saw "Sorry, I am having
    // trouble right now".
    expect(frames('data: {"t":"OK"}\n\ndata: {"done":true}\n\n')).toEqual([
      { kind: 'text', text: 'OK' },
      { kind: 'done' },
    ]);
  });

  it('reads errors in both envelopes', () => {
    expect(frames('event: error\ndata: {"error":"boom"}\n\n')).toEqual([{ kind: 'error', message: 'boom' }]);
    expect(frames('data: {"error":"boom"}\n\n')).toEqual([{ kind: 'error', message: 'boom' }]);
  });

  it('returns null for frames it does not understand, so the caller can tell', () => {
    expect(frames('data: not json\n\n')).toEqual([null]);
    expect(frames('event: ping\ndata: {}\n\n')).toEqual([null]);
  });
});
