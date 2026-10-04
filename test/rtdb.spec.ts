import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PlaywrightFirebase } from '../src/PlaywrightFirebase';

const firebase = new PlaywrightFirebase();

beforeEach(() => firebase.clearDatabase());
afterAll(() => firebase.cleanup());

describe('callRtdb', () => {
  it('sets, updates and gets a value', async () => {
    await firebase.callRtdb('set', 'projects/1', { name: 'one' });
    await firebase.callRtdb('update', 'projects/1', { status: 'done' });
    expect(await firebase.callRtdb('get', 'projects/1')).toEqual({
      name: 'one',
      status: 'done',
    });
  });

  it('pushes and returns the new key', async () => {
    const key = await firebase.callRtdb('push', 'messages', { text: 'hi' });
    expect(await firebase.callRtdb('get', `messages/${key}`)).toEqual({
      text: 'hi',
    });
  });

  it('applies query options', async () => {
    await firebase.callRtdb('set', 'scores', { a: 3, b: 1, c: 2 });
    const top = await firebase.callRtdb('get', 'scores', {
      orderByValue: true,
      limitToLast: 1,
    });
    expect(top).toEqual({ a: 3 });
  });

  it('deletes a value', async () => {
    await firebase.callRtdb('set', 'projects/1', { name: 'one' });
    await firebase.callRtdb('delete', 'projects/1');
    expect(await firebase.callRtdb('get', 'projects/1')).toBeNull();
  });
});
