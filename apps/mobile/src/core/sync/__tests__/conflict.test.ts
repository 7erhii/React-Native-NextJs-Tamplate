import type { SaveRecord } from '@/core/storage/types';
import { resolveConflict } from '../conflict';

function record(overrides: Partial<SaveRecord> & { data?: unknown } = {}): SaveRecord {
  return {
    key: 'game:test:progress',
    data: { bestScore: 0 },
    schemaVersion: 1,
    revision: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    deviceId: 'device-a',
    ...overrides,
  };
}

describe('conflict resolution', () => {
  describe('stage 1: revision decides, without consulting a clock', () => {
    it('prefers the higher revision even when its timestamp is older', () => {
      const local = record({ revision: 5, updatedAt: '2020-01-01T00:00:00.000Z' });
      const remote = record({ revision: 2, updatedAt: '2030-01-01T00:00:00.000Z' });

      const result = resolveConflict(local, remote, { strategy: 'last-write-wins' });

      expect(result.winner).toBe('local');
      expect(result.diverged).toBe(false);
    });

    // This is the property that stops a device with a wrong clock from winning
    // every conflict forever.
    it('is unaffected by a wildly skewed clock on the losing side', () => {
      const local = record({ revision: 2, updatedAt: '1999-01-01T00:00:00.000Z' });
      const remote = record({ revision: 9, updatedAt: '1970-01-01T00:00:00.000Z' });

      expect(resolveConflict(local, remote, { strategy: 'last-write-wins' }).winner).toBe('remote');
    });

    it('does not bump the revision when there was no divergence', () => {
      const local = record({ revision: 5 });
      const remote = record({ revision: 2 });

      expect(resolveConflict(local, remote, { strategy: 'last-write-wins' }).record.revision).toBe(5);
    });
  });

  describe('stage 2: equal revisions mean real divergence', () => {
    it('last-write-wins picks the later timestamp', () => {
      const local = record({ revision: 3, updatedAt: '2026-01-02T00:00:00.000Z' });
      const remote = record({ revision: 3, updatedAt: '2026-01-01T00:00:00.000Z' });

      const result = resolveConflict(local, remote, { strategy: 'last-write-wins' });

      expect(result.winner).toBe('local');
      expect(result.diverged).toBe(true);
    });

    // The reason `highest-value` exists: last-write-wins is not merely
    // suboptimal for a score, it discards the better result.
    it('highest-value keeps the better score even when written earlier', () => {
      const local = record({
        revision: 3,
        updatedAt: '2026-01-01T00:00:00.000Z',
        data: { bestScore: 900 },
      });
      const remote = record({
        revision: 3,
        updatedAt: '2026-01-09T00:00:00.000Z',
        data: { bestScore: 100 },
      });

      const byTime = resolveConflict(local, remote, { strategy: 'last-write-wins' });
      const byValue = resolveConflict(local, remote, {
        strategy: 'highest-value',
        valuePath: 'bestScore',
      });

      expect(byTime.winner).toBe('remote');
      expect((byValue.record.data as { bestScore: number }).bestScore).toBe(900);
    });

    it('highest-value reads a nested path', () => {
      const local = record({ revision: 2, data: { stats: { best: 10 } } });
      const remote = record({ revision: 2, data: { stats: { best: 80 } } });

      const result = resolveConflict(local, remote, {
        strategy: 'highest-value',
        valuePath: 'stats.best',
      });

      expect(result.winner).toBe('remote');
    });

    it('highest-value falls back to timestamps when the values tie', () => {
      const local = record({
        revision: 2,
        updatedAt: '2026-01-05T00:00:00.000Z',
        data: { bestScore: 50 },
      });
      const remote = record({
        revision: 2,
        updatedAt: '2026-01-01T00:00:00.000Z',
        data: { bestScore: 50 },
      });

      expect(
        resolveConflict(local, remote, { strategy: 'highest-value', valuePath: 'bestScore' }).winner,
      ).toBe('local');
    });

    it('prefer-local and prefer-remote are unconditional', () => {
      const local = record({ revision: 4, data: { bestScore: 1 } });
      const remote = record({ revision: 4, data: { bestScore: 999 } });

      expect(resolveConflict(local, remote, { strategy: 'prefer-local' }).winner).toBe('local');
      expect(resolveConflict(local, remote, { strategy: 'prefer-remote' }).winner).toBe('remote');
    });

    it('accepts a custom resolver', () => {
      const local = record({ revision: 2, data: { pick: 'no' } });
      const remote = record({ revision: 2, data: { pick: 'yes' } });

      const result = resolveConflict(local, remote, {
        strategy: (l, r) => ((r.data as { pick: string }).pick === 'yes' ? 'remote' : 'local'),
      });

      expect(result.winner).toBe('remote');
    });

    // Without this, the same tie would be re-resolved on every sync pass.
    it('records the resolution at a higher revision so it cannot re-trigger', () => {
      const local = record({ revision: 3 });
      const remote = record({ revision: 3 });

      expect(resolveConflict(local, remote, { strategy: 'last-write-wins' }).record.revision).toBe(4);
    });
  });

  describe('determinism', () => {
    // SC-007: both devices must independently reach the same verdict, or they
    // will keep overwriting each other forever.
    it('reaches the same winner regardless of argument order', () => {
      const a = record({ revision: 3, updatedAt: '2026-01-02T00:00:00.000Z', deviceId: 'aaa' });
      const b = record({ revision: 3, updatedAt: '2026-01-01T00:00:00.000Z', deviceId: 'bbb' });

      const fromA = resolveConflict(a, b, { strategy: 'last-write-wins' });
      const fromB = resolveConflict(b, a, { strategy: 'last-write-wins' });

      // 'local' from A's view and 'remote' from B's view name the same record,
      // which is what "both devices agree" means here.
      expect(fromA.winner).toBe('local');
      expect(fromB.winner).toBe('remote');
      expect(fromA.record.data).toEqual(fromB.record.data);
      expect(fromA.record.revision).toBe(fromB.record.revision);
    });

    it('breaks an exact tie stably rather than arbitrarily', () => {
      const a = record({ revision: 2, updatedAt: '2026-01-01T00:00:00.000Z', deviceId: 'aaa' });
      const b = record({ revision: 2, updatedAt: '2026-01-01T00:00:00.000Z', deviceId: 'bbb' });

      const first = resolveConflict(a, b, { strategy: 'last-write-wins' });
      const second = resolveConflict(a, b, { strategy: 'last-write-wins' });

      expect(first.winner).toBe(second.winner);
      expect(first.winner).toBe('local');
    });

    it('tolerates an unparseable timestamp instead of throwing', () => {
      const local = record({ revision: 2, updatedAt: 'not-a-date' });
      const remote = record({ revision: 2, updatedAt: '2026-01-01T00:00:00.000Z' });

      expect(resolveConflict(local, remote, { strategy: 'last-write-wins' }).winner).toBe('remote');
    });
  });
});
