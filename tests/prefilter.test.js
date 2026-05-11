import { describe, it, expect } from 'vitest';
import { prefilter } from '../src/prefilter.js';

function makeConfig(whitelist = [], blacklist = []) {
  return { whitelist, blacklist };
}

function makeEmail(from) {
  return { from, subject: 'Test', body: 'Test body' };
}

describe('prefilter', () => {
  describe('exact address matching', () => {
    it('matches whitelist exact address', () => {
      const config = makeConfig(['alice@example.com']);
      const email = makeEmail('Alice <alice@example.com>');
      const result = prefilter(email, config);
      expect(result.action).toBe('keep');
      expect(result.reason).toContain('whitelist');
    });

    it('matches blacklist exact address', () => {
      const config = makeConfig([], ['spam@example.com']);
      const email = makeEmail('Spammer <spam@example.com>');
      const result = prefilter(email, config);
      expect(result.action).toBe('reject');
      expect(result.reason).toContain('blacklist');
    });

    it('returns classify when no match', () => {
      const config = makeConfig(['alice@example.com'], ['spam@example.com']);
      const email = makeEmail('Bob <bob@other.com>');
      const result = prefilter(email, config);
      expect(result.action).toBe('classify');
    });
  });

  describe('domain wildcards', () => {
    it('matches wildcard domain', () => {
      const config = makeConfig(['*@example.com']);
      const email = makeEmail('User <user@example.com>');
      const result = prefilter(email, config);
      expect(result.action).toBe('keep');
    });

    it('rejects wildcard domain', () => {
      const config = makeConfig([], ['*@spam.com']);
      const email = makeEmail('Spam <spam@spam.com>');
      const result = prefilter(email, config);
      expect(result.action).toBe('reject');
    });

    it('matches subdomain for wildcard', () => {
      const config = makeConfig(['*@example.com']);
      const email = makeEmail('User <user@mail.example.com>');
      const result = prefilter(email, config);
      expect(result.action).toBe('keep');
    });

    it('does not match partial domain', () => {
      const config = makeConfig(['*@example.com']);
      const email = makeEmail('User <user@notexample.com>');
      const result = prefilter(email, config);
      expect(result.action).toBe('classify');
    });
  });

  describe('priority', () => {
    it('whitelist wins over blacklist', () => {
      const config = makeConfig(['alice@example.com'], ['alice@example.com']);
      const email = makeEmail('Alice <alice@example.com>');
      const result = prefilter(email, config);
      expect(result.action).toBe('keep');
    });

    it('wildcard whitelist wins over exact blacklist', () => {
      const config = makeConfig(['*@example.com'], ['user@example.com']);
      const email = makeEmail('User <user@example.com>');
      const result = prefilter(email, config);
      expect(result.action).toBe('keep');
    });
  });

  describe('address extraction', () => {
    it('extracts from Name <email> format', () => {
      const config = makeConfig(['john@doe.com']);
      const email = makeEmail('John Doe <john@doe.com>');
      const result = prefilter(email, config);
      expect(result.action).toBe('keep');
    });

    it('extracts plain email format', () => {
      const config = makeConfig(['john@doe.com']);
      const email = makeEmail('john@doe.com');
      const result = prefilter(email, config);
      expect(result.action).toBe('keep');
    });

    it('is case insensitive', () => {
      const config = makeConfig(['Alice@Example.COM']);
      const email = makeEmail('alice@example.com');
      const result = prefilter(email, config);
      expect(result.action).toBe('keep');
    });
  });

  describe('edge cases', () => {
    it('handles empty from field', () => {
      const config = makeConfig(['alice@example.com']);
      const email = makeEmail('');
      const result = prefilter(email, config);
      expect(result.action).toBe('classify');
    });

    it('handles empty whitelist and blacklist', () => {
      const config = makeConfig([], []);
      const email = makeEmail('test@test.com');
      const result = prefilter(email, config);
      expect(result.action).toBe('classify');
    });

    it('handles whitespace in entries', () => {
      const config = makeConfig(['  alice@example.com  ']);
      const email = makeEmail('alice@example.com');
      const result = prefilter(email, config);
      expect(result.action).toBe('keep');
    });
  });
});
