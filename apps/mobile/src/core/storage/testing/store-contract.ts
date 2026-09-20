/**
 * The shared save-store contract suite.
 *
 * This is the most load-bearing test in the project. The claim that persistence
 * is swappable rests entirely on the adapters being interchangeable in fact, and
 * this is the only thing that can demonstrate that: one suite, unchanged, run
 * against every adapter. A type signature proves they have the same shape; this
 * proves they have the same behaviour.
 *
 * Add an adapter, call this against it, and the switchability claim stays honest.
 */

import { ConflictError } from '@/core/errors';
import type { SaveStorePort } from '../types';

export interface ContractHarness {
  /** A fresh, empty store bound to a known owner. */
  create(): Promise<SaveStorePort> | SaveStorePort;
  /** Called after each test so the next one starts clean. */
  cleanup?(): Promise<void> | void;
}

export function describeSaveStoreContract(name: string, harness: ContractHarness): void {
  describe(`SaveStorePort contract: ${name}`, () => {
    let store: SaveStorePort;

    beforeEach(async () => {
      store = await harness.create();
    });

    afterEach(async () => {
      await harness.cleanup?.();
    });

    it('reports its capabilities', () => {
      expect(typeof store.id).toBe('string');
      expect(typeof store.capabilities.crossDevice).toBe('boolean');
      expect(typeof store.capabilities.offline).toBe('boolean');
      expect(typeof store.capabilities.queued).toBe('boolean');
    });

    // Absence is the normal first-launch case, so it must not be an error.
    it('returns null for a key that was never written', async () => {
      await expect(store.read('platform:missing')).resolves.toBeNull();
    });

    it('reads back exactly what was written', async () => {
      await store.write('game:test:progress', { score: 42, name: 'ok' });
      const record = await store.read<{ score: number; name: string }>('game:test:progress');

      expect(record).not.toBeNull();
      expect(record?.data).toEqual({ score: 42, name: 'ok' });
    });

    it('increments revision monotonically on every write', async () => {
      const first = await store.write('game:test:progress', { v: 1 });
      const second = await store.write('game:test:progress', { v: 2 });
      const third = await store.write('game:test:progress', { v: 3 });

      expect(first.revision).toBe(1);
      expect(second.revision).toBeGreaterThan(first.revision);
      expect(third.revision).toBeGreaterThan(second.revision);
    });

    it('stamps every record with a key, timestamp, and writing device', async () => {
      const record = await store.write('game:test:progress', { v: 1 });

      expect(record.key).toBe('game:test:progress');
      expect(Number.isNaN(Date.parse(record.updatedAt))).toBe(false);
      expect(record.deviceId.length).toBeGreaterThan(0);
    });

    it('persists the schema version it was given', async () => {
      await store.write('game:test:progress', { v: 1 }, { schemaVersion: 7 });
      const record = await store.read('game:test:progress');

      expect(record?.schemaVersion).toBe(7);
    });

    // Optimistic concurrency: this is what turns last-write-wins from an
    // accident into a deliberate choice.
    it('accepts a write whose expectedRevision matches', async () => {
      await store.write('game:test:progress', { v: 1 });
      await expect(
        store.write('game:test:progress', { v: 2 }, { expectedRevision: 1 }),
      ).resolves.toMatchObject({ revision: 2 });
    });

    it('rejects a stale write and leaves stored state untouched', async () => {
      await store.write('game:test:progress', { v: 1 });
      await store.write('game:test:progress', { v: 2 });

      await expect(
        store.write('game:test:progress', { v: 999 }, { expectedRevision: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);

      const record = await store.read<{ v: number }>('game:test:progress');
      expect(record?.data.v).toBe(2);
    });

    it('treats expectedRevision 0 as "must not exist yet"', async () => {
      await expect(
        store.write('game:test:fresh', { v: 1 }, { expectedRevision: 0 }),
      ).resolves.toMatchObject({ revision: 1 });

      await expect(
        store.write('game:test:fresh', { v: 2 }, { expectedRevision: 0 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('removes a record', async () => {
      await store.write('game:test:progress', { v: 1 });
      await store.remove('game:test:progress');

      await expect(store.read('game:test:progress')).resolves.toBeNull();
    });

    it('lists keys under a prefix and excludes others', async () => {
      await store.write('game:alpha:progress', { v: 1 });
      await store.write('game:beta:progress', { v: 1 });
      await store.write('platform:preferences', { v: 1 });

      const gameKeys = await store.list('game:');
      expect([...gameKeys].sort()).toEqual(['game:alpha:progress', 'game:beta:progress']);

      const alphaKeys = await store.list('game:alpha:');
      expect(alphaKeys).toEqual(['game:alpha:progress']);
    });

    it('keeps each key independent', async () => {
      await store.write('game:alpha:progress', { who: 'alpha' });
      await store.write('game:beta:progress', { who: 'beta' });

      const alpha = await store.read<{ who: string }>('game:alpha:progress');
      const beta = await store.read<{ who: string }>('game:beta:progress');

      expect(alpha?.data.who).toBe('alpha');
      expect(beta?.data.who).toBe('beta');
    });

    it('notifies subscribers on write and stops after unsubscribe', async () => {
      const seen: string[] = [];
      const unsubscribe = store.subscribe((record) => seen.push(record.key));

      await store.write('game:test:progress', { v: 1 });
      expect(seen).toEqual(['game:test:progress']);

      unsubscribe();
      await store.write('game:test:progress', { v: 2 });
      expect(seen).toEqual(['game:test:progress']);
    });

    it('resolves sync() with a well-formed report', async () => {
      const report = await store.sync();

      expect(report).toMatchObject({
        pushed: expect.any(Number),
        pulled: expect.any(Number),
        conflicts: expect.any(Number),
        failed: expect.any(Number),
      });
      expect(Array.isArray(report.errors)).toBe(true);
    });

    it('round-trips values that JSON handles awkwardly', async () => {
      const payload = {
        empty: {},
        list: [] as number[],
        nested: { deep: { deeper: true } },
        zero: 0,
        falsy: false,
        text: 'quotes " and \\ backslashes and 🎯',
        nothing: null,
      };

      await store.write('game:test:edge', payload);
      const record = await store.read<typeof payload>('game:test:edge');

      expect(record?.data).toEqual(payload);
    });
  });
}
