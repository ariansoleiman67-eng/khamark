import {
  formatPhone,
  validatePhone,
  displayPhone,
  getCountryFromPhone,
} from '../../src/utils/phoneUtils';

/**
 * Regression coverage for dial-code prefix matching.
 *
 * Short dial codes (+7 Russia/Kazakhstan, +1 NANP) are prefixes of ordinary local
 * subscriber numbers. Matching on prefix alone silently binds an Iraqi mobile typed
 * the natural way ("750 215 3223") to Russia, so the number is formatted and
 * validated against the wrong country's rules.
 */
describe('phoneUtils dial-code prefix matching', () => {
  const IQ_LOCAL_WITH_TRUNK = '0750 215 3223';
  const IQ_LOCAL_BARE = '750 215 3223';
  const IQ_E164 = '+9647502153223';

  describe('formatPhone', () => {
    it('formats an Iraqi number typed with the trunk 0', () => {
      expect(formatPhone(IQ_LOCAL_WITH_TRUNK)).toBe(IQ_E164);
    });

    it('formats an Iraqi number typed without the trunk 0 (must not bind to +7)', () => {
      expect(formatPhone(IQ_LOCAL_BARE)).toBe(IQ_E164);
    });

    it('preserves an explicit +964 number', () => {
      expect(formatPhone('+964 750 215 3223')).toBe(IQ_E164);
    });

    it('drops the trunk 0 when it follows an explicit country code', () => {
      expect(formatPhone('+964 0750 215 3223')).toBe(IQ_E164);
    });

    it('still honours a genuine explicit +7 Russian number', () => {
      expect(formatPhone('+7 926 123 4567')).toBe('+79261234567');
    });

    it('still honours a genuine explicit +1 US number', () => {
      expect(formatPhone('+1 555 123 4567')).toBe('+15551234567');
    });
  });

  describe('validatePhone', () => {
    it('accepts an Iraqi number typed with the trunk 0', () => {
      expect(validatePhone(IQ_LOCAL_WITH_TRUNK)).toBe(true);
    });

    it('accepts an Iraqi number typed without the trunk 0', () => {
      expect(validatePhone(IQ_LOCAL_BARE)).toBe(true);
    });

    it('accepts an explicit +964 number', () => {
      expect(validatePhone('+964 750 215 3223')).toBe(true);
    });

    it('rejects an explicit +7 number of the wrong length', () => {
      expect(validatePhone('+7 502 153 223')).toBe(false);
    });
  });

  describe('formatPhone / validatePhone agreement', () => {
    // The two functions must apply the identical guard. Drift between them is
    // exactly how the original bug survived: formatPhone had been fixed and
    // validatePhone had not.
    const cases = [IQ_LOCAL_WITH_TRUNK, IQ_LOCAL_BARE, '+964 750 215 3223'];

    it.each(cases)('agree that %s is a valid IQ number', (input) => {
      expect(validatePhone(input)).toBe(true);
      expect(formatPhone(input)).toBe(IQ_E164);
    });
  });

  describe('getCountryFromPhone', () => {
    it('reports a bare local number as unknown rather than guessing RU', () => {
      // The digits carry no country information and the function takes no
      // defaultCountry, so "unknown" is the honest answer. Previously this
      // confidently returned 'RU' because "7502153223" starts with "7".
      expect(getCountryFromPhone(IQ_LOCAL_BARE)).toBeUndefined();
    });

    it('resolves an explicit +964 number to IQ', () => {
      expect(getCountryFromPhone(IQ_E164)).toBe('IQ');
    });

    it('resolves a genuine +7 number to a +7 country', () => {
      expect(['RU', 'KZ']).toContain(getCountryFromPhone('+79261234567'));
    });
  });

  describe('displayPhone', () => {
    it('renders an Iraqi E.164 number under its own dial code', () => {
      expect(displayPhone(IQ_E164)).toContain('+964');
    });
  });
});
