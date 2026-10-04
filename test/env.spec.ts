import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyEmulatorHosts, assertEmulatorOrAllowed } from '../src/env';

describe('assertEmulatorOrAllowed', () => {
  const original = process.env.FIRESTORE_EMULATOR_HOST;
  afterEach(() => {
    process.env.FIRESTORE_EMULATOR_HOST = original;
    vi.restoreAllMocks();
  });

  it('passes when the emulator host is set', () => {
    expect(() => assertEmulatorOrAllowed('firestore')).not.toThrow();
  });

  it('throws by default when the emulator host is not set', () => {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    expect(() => assertEmulatorOrAllowed('firestore')).toThrow(
      /FIRESTORE_EMULATOR_HOST is not set/,
    );
  });

  it('warns when protection is "warn"', () => {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    assertEmulatorOrAllowed('firestore', { firestore: 'warn' });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('allows silently when protection is "none"', () => {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    const warn = vi.spyOn(console, 'warn');
    assertEmulatorOrAllowed('firestore', { firestore: 'none' });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('applyEmulatorHosts', () => {
  const original = process.env.FIRESTORE_EMULATOR_HOST;
  afterEach(() => {
    process.env.FIRESTORE_EMULATOR_HOST = original;
  });

  it('sets unset env variables', () => {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    applyEmulatorHosts({ firestore: 'localhost:1234' });
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('localhost:1234');
  });

  it('does not override env variables which are set', () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:1111';
    applyEmulatorHosts({ firestore: 'localhost:1234' });
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('localhost:1111');
  });
});
