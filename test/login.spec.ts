import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildPersistedUser,
  persistedUserFromTokens,
  signInWithCustomToken,
  signInWithPassword,
} from '../src/login';
import { PlaywrightFirebase } from '../src/PlaywrightFirebase';

const apiKey = 'fake-api-key';
const firebase = new PlaywrightFirebase({ apiKey });

beforeEach(() => firebase.clearAuth());
afterAll(() => firebase.cleanup());

describe('buildPersistedUser', () => {
  it('builds the shape the Firebase JS SDK persists', () => {
    const user = buildPersistedUser(
      {
        idToken: 'id',
        refreshToken: 'refresh',
        expiresIn: '3600',
        localId: 'abc',
      },
      {
        localId: 'abc',
        email: 'a@b.com',
        emailVerified: true,
        createdAt: '1',
        lastLoginAt: '2',
        providerUserInfo: [
          { providerId: 'password', rawId: 'a@b.com', email: 'a@b.com' },
        ],
      },
      apiKey,
      '[DEFAULT]',
      1000,
    );
    expect(user).toEqual({
      uid: 'abc',
      email: 'a@b.com',
      emailVerified: true,
      displayName: undefined,
      isAnonymous: false,
      photoURL: undefined,
      phoneNumber: undefined,
      tenantId: undefined,
      providerData: [
        {
          providerId: 'password',
          uid: 'a@b.com',
          displayName: null,
          email: 'a@b.com',
          phoneNumber: null,
          photoURL: null,
        },
      ],
      stsTokenManager: {
        refreshToken: 'refresh',
        accessToken: 'id',
        expirationTime: 3601000,
      },
      createdAt: '1',
      lastLoginAt: '2',
      apiKey,
      appName: '[DEFAULT]',
    });
  });
});

describe('sign in against the Auth emulator', () => {
  it('signs in with a custom token, creating the user', async () => {
    const token = await firebase.auth.createCustomToken('custom-uid', {
      role: 'admin',
    });
    const tokens = await signInWithCustomToken(apiKey, token);
    const user = await persistedUserFromTokens(apiKey, '[DEFAULT]', tokens);
    expect(user.uid).toBe('custom-uid');
    const decoded = await firebase.auth.verifyIdToken(
      user.stsTokenManager.accessToken,
    );
    expect(decoded.role).toBe('admin');
  });

  it('signs in with email and password', async () => {
    await firebase.auth.createUser({
      uid: 'pw-uid',
      email: 'pw@example.com',
      password: 'password123',
      displayName: 'Pat',
    });
    const tokens = await signInWithPassword(
      apiKey,
      'pw@example.com',
      'password123',
    );
    const user = await persistedUserFromTokens(apiKey, '[DEFAULT]', tokens);
    expect(user).toMatchObject({
      uid: 'pw-uid',
      email: 'pw@example.com',
      displayName: 'Pat',
    });
    expect(user.providerData[0].providerId).toBe('password');
  });

  it('reports sign in errors from the API', async () => {
    await expect(
      signInWithPassword(apiKey, 'nobody@example.com', 'nope'),
    ).rejects.toThrow(/signInWithPassword failed/);
  });
});
