import { createSSEParser } from '../../src/utils/sseParser';

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
