import {
  extractProductIds,
  stripProductMarker,
  visibleDuringStream,
} from '../../src/utils/chatMarkers';

const A = '99244efe-07dc-4929-9445-e9ed5df9e007';
const B = '40d1e82d-8b62-4a21-9be4-7db526a4ec94';

describe('extractProductIds', () => {
  it('reads the ids out of the marker', () => {
    expect(extractProductIds(`Try this.\n<<products:${A},${B}>>`)).toEqual([A, B]);
  });

  it('returns nothing when there is no marker', () => {
    expect(extractProductIds('We have several chargers.')).toEqual([]);
  });

  it('ignores an empty marker', () => {
    expect(extractProductIds('Text\n<<products:>>')).toEqual([]);
  });

  it('drops blanks and duplicates, keeping the model order', () => {
    expect(extractProductIds(`x\n<<products:${A},,${A},${B}>>`)).toEqual([A, B]);
  });

  it('reads a marker written without a preceding newline', () => {
    expect(extractProductIds(`Buy this one. <<products:${A}>>`)).toEqual([A]);
  });
});

describe('stripProductMarker', () => {
  it('removes the marker and the whitespace before it', () => {
    expect(stripProductMarker(`Answer here.\n\n<<products:${A}>>`)).toBe('Answer here.');
  });

  it('leaves text without a marker untouched', () => {
    expect(stripProductMarker('Just an answer.')).toBe('Just an answer.');
  });

  it('leaves an empty answer empty rather than returning undefined', () => {
    expect(stripProductMarker('')).toBe('');
  });
});

describe('visibleDuringStream', () => {
  it('hides a complete marker', () => {
    expect(visibleDuringStream(`Answer.\n<<products:${A}>>`)).toBe('Answer.');
  });

  it('hides a marker that is still arriving, at every prefix length', () => {
    const full = `Answer.\n<<products:${A}>>`;
    // Every intermediate state from '<<' onward must render as "Answer." — this
    // is the bug the whole function exists to prevent.
    //
    // It deliberately starts at '<<' and not at a single '<': one '<' is far more
    // likely to be real text ("under <2m") than the start of a marker, so a lone
    // trailing '<' is left visible. The worst case is one character showing for a
    // single frame; the alternative is eating a character the customer typed
    // about.
    for (let i = 'Answer.\n<<'.length; i <= full.length; i++) {
      expect(visibleDuringStream(full.slice(0, i))).toBe('Answer.');
    }
  });

  it('hides a bare opening bracket pair', () => {
    expect(visibleDuringStream('Answer.\n<<')).toBe('Answer.');
  });

  it('does not eat ordinary text containing a single angle bracket', () => {
    expect(visibleDuringStream('Use a cable < 2m long')).toBe('Use a cable < 2m long');
  });

  it('does not eat a comparison at the end of a sentence', () => {
    expect(visibleDuringStream('Charge at anything <')).toBe('Charge at anything <');
  });

  it('leaves normal streamed prose alone', () => {
    expect(visibleDuringStream('We stock four chargers and two')).toBe(
      'We stock four chargers and two',
    );
  });
});
