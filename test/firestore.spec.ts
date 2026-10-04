import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { isDocPath } from '../src/firestore';
import { PlaywrightFirebase } from '../src/PlaywrightFirebase';

const firebase = new PlaywrightFirebase();

beforeEach(() => firebase.clearFirestore());
afterAll(() => firebase.cleanup());

describe('isDocPath', () => {
  it('detects document and collection paths', () => {
    expect(isDocPath('projects/1')).toBe(true);
    expect(isDocPath('/projects/1/')).toBe(true);
    expect(isDocPath('projects')).toBe(false);
    expect(isDocPath('projects/1/tasks')).toBe(false);
  });
});

describe('callFirestore', () => {
  it('sets and gets a document', async () => {
    await firebase.callFirestore('set', 'projects/1', { name: 'one' });
    expect(await firebase.callFirestore('get', 'projects/1')).toEqual({
      name: 'one',
    });
  });

  it('returns null for a missing document', async () => {
    expect(await firebase.callFirestore('get', 'projects/missing')).toBeNull();
  });

  it('merges on set with merge option', async () => {
    await firebase.callFirestore('set', 'projects/1', { name: 'one' });
    await firebase.callFirestore(
      'set',
      'projects/1',
      { status: 'done' },
      { merge: true },
    );
    expect(await firebase.callFirestore('get', 'projects/1')).toEqual({
      name: 'one',
      status: 'done',
    });
  });

  it('supports firebase-admin values directly', async () => {
    const createdAt = Timestamp.fromMillis(0);
    await firebase.callFirestore('set', 'projects/1', { createdAt, count: 1 });
    await firebase.callFirestore('update', 'projects/1', {
      count: FieldValue.increment(2),
    });
    const project = await firebase.callFirestore('get', 'projects/1');
    expect(project.count).toBe(3);
    expect(project.createdAt.isEqual(createdAt)).toBe(true);
  });

  it('adds documents and gets collections with ids', async () => {
    const id = await firebase.callFirestore('add', 'projects', { name: 'a' });
    expect(await firebase.callFirestore('get', 'projects')).toEqual([
      { id, name: 'a' },
    ]);
  });

  it('returns an empty array for an empty collection', async () => {
    expect(await firebase.callFirestore('get', 'projects')).toEqual([]);
  });

  it('queries with where, orderBy and limit', async () => {
    await firebase.callFirestore('batch', 'projects', [
      { action: 'set', path: 'a', data: { owner: 'x', rank: 2 } },
      { action: 'set', path: 'b', data: { owner: 'x', rank: 1 } },
      { action: 'set', path: 'c', data: { owner: 'y', rank: 0 } },
    ]);
    const results = await firebase.callFirestore('get', 'projects', {
      where: ['owner', '==', 'x'],
      orderBy: 'rank',
      limit: 1,
    });
    expect(results.map((p: { id: string }) => p.id)).toEqual(['b']);
  });

  it('deletes a collection including subcollections', async () => {
    await firebase.callFirestore('set', 'projects/1', { name: 'one' });
    await firebase.callFirestore('set', 'projects/1/tasks/1', { done: true });
    await firebase.callFirestore('delete', 'projects');
    expect(await firebase.callFirestore('get', 'projects')).toEqual([]);
    expect(await firebase.callFirestore('get', 'projects/1/tasks')).toEqual([]);
  });

  it('deletes only documents matching a query', async () => {
    await firebase.callFirestore('set', 'projects/a', { owner: 'x' });
    await firebase.callFirestore('set', 'projects/b', { owner: 'y' });
    await firebase.callFirestore('delete', 'projects', {
      where: ['owner', '==', 'x'],
    });
    expect(await firebase.callFirestore('get', 'projects')).toEqual([
      { id: 'b', owner: 'y' },
    ]);
  });

  it('validates every batch operation before committing', async () => {
    await expect(
      firebase.callFirestore('batch', 'projects', [
        { action: 'set', path: 'a', data: { ok: true } },
        { action: 'set', path: 'b' },
      ]),
    ).rejects.toThrow(/requires data/);
    expect(await firebase.callFirestore('get', 'projects')).toEqual([]);
  });

  it('requires data for writes', async () => {
    await expect(
      // @ts-expect-error - testing missing data
      firebase.callFirestore('set', 'projects/1'),
    ).rejects.toThrow(/Data is required/);
  });
});
