/**
 * `coerceUnknownErrorMessage` — the message-extraction ladder every auth surface reads through.
 *
 * F1553: this had no spec, which is how an UNREACHABLE branch (`if (error instanceof Error &&
 * hasText(error.message)) return error.message;`, sitting after the structural
 * `typeof error === 'object'` block that already handles every Error) survived as the line a
 * reader would assume was the primary path for a real Error. The cases below pin what each
 * option combination actually does, so the ladder's order is a fact rather than a reading.
 */
import { coerceUnknownErrorMessage, getOAuthErrorMessage } from './auth-error';

describe('coerceUnknownErrorMessage', () => {
  it('returns a non-empty string error as-is', () => {
    expect(coerceUnknownErrorMessage('boom')).toBe('boom');
  });

  // The case the deleted branch claimed: a real Error IS an object, so :28 answers it.
  it('reads a real Error through the OBJECT branch, not an instanceof branch', () => {
    expect(coerceUnknownErrorMessage(new Error('kaboom'))).toBe('kaboom');
    expect(coerceUnknownErrorMessage(new Error('kaboom'), { allowObjectToString: false })).toBe(
      'kaboom'
    );
  });

  // An Error with an EMPTY message is the only way to fall past :28 — the deleted branch
  // re-tested that same empty message and was false again, on every configuration.
  it('an EMPTY-message Error falls past the message arm in every configuration', () => {
    expect(coerceUnknownErrorMessage(new Error(''))).toBe('Error');
    expect(coerceUnknownErrorMessage(new Error(''), { allowObjectToString: false })).toBe('Error');
    expect(
      coerceUnknownErrorMessage(new Error(''), {
        allowObjectToString: false,
        allowGenericStringCoercion: false,
      })
    ).toBe('Unknown error');
    expect(
      coerceUnknownErrorMessage(new Error(''), {
        allowObjectToString: false,
        allowGenericStringCoercion: false,
        fallbackMessage: 'nope',
      })
    ).toBe('nope');
  });

  it('reads a plain object message, and falls to toString when there is none', () => {
    expect(coerceUnknownErrorMessage({ message: 'from record' })).toBe('from record');
    expect(coerceUnknownErrorMessage({})).toBe('[object Object]');
    expect(coerceUnknownErrorMessage({}, { allowObjectToString: false })).toBe('[object Object]');
    expect(
      coerceUnknownErrorMessage(
        {},
        { allowObjectToString: false, allowGenericStringCoercion: false }
      )
    ).toBe('Unknown error');
  });

  it('survives a malformed toString', () => {
    const hostile = {
      toString: () => {
        throw new Error('nope');
      },
    };
    expect(coerceUnknownErrorMessage(hostile, { allowGenericStringCoercion: false })).toBe(
      'Unknown error'
    );
  });

  it('falls back for null / undefined / empty string', () => {
    expect(coerceUnknownErrorMessage(null, { allowGenericStringCoercion: false })).toBe(
      'Unknown error'
    );
    expect(coerceUnknownErrorMessage(undefined)).toBe('undefined');
    expect(coerceUnknownErrorMessage('   ', { allowGenericStringCoercion: false })).toBe(
      'Unknown error'
    );
  });
});

describe('getOAuthErrorMessage', () => {
  it('prefers longMessage, then message, then the record message', () => {
    expect(getOAuthErrorMessage({ errors: [{ longMessage: 'long', message: 'short' }] })).toBe(
      'long'
    );
    expect(getOAuthErrorMessage({ errors: [{ message: 'short' }] })).toBe('short');
    expect(getOAuthErrorMessage({ message: 'outer' })).toBe('outer');
  });

  it('answers session_exists in the app voice', () => {
    expect(getOAuthErrorMessage({ errors: [{ code: 'session_exists' }] })).toBe(
      "You're already signed in."
    );
  });

  // The two OAuth paths run with allowObjectToString AND allowGenericStringCoercion off, which
  // is the configuration the deleted branch would have mattered in if it could ever fire.
  it('falls back to the sign-in copy for an Error with no message', () => {
    expect(getOAuthErrorMessage(new Error(''))).toBe(
      'Sign-in failed. Check your internet connection (captive portal/VPN) and try again.'
    );
    expect(getOAuthErrorMessage(new Error('network down'))).toBe('network down');
  });
});
