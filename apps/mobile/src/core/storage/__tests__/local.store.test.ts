import { createLocalStore } from '../local.store';
import { createMemoryKv } from '../testing/memory-kv';
import { describeSaveStoreContract } from '../testing/store-contract';

const OWNER = '11111111-2222-3333-4444-555555555555';
const OTHER_OWNER = '99999999-8888-7777-6666-555555555555';

describeSaveStoreContract('local', {
  create() {
    return createLocalStore({ kv: createMemoryKv(), resolveOwner: () => OWNER });
  },
});

describe('local store, beyond the shared contract', () => {
  it('isolates data between players', async () => {
    // One backing store, two owners: proves isolation comes from key
    // namespacing rather than from separate storage.
    const kv = createMemoryKv();
    let owner = OWNER;
    const store = createLocalStore({ kv, resolveOwner: () => owner });

    await store.write('game:test:progress', { who: 'first' });

    owner = OTHER_OWNER;
    await expect(store.read('game:test:progress')).resolves.toBeNull();

    await store.write('game:test:progress', { who: 'second' });

    owner = OWNER;
    const back = await store.read<{ who: string }>('game:test:progress');
    expect(back?.data.who).toBe('first');
  });

  it('quarantines an unreadable record instead of deleting it', async () => {
    const kv = createMemoryKv();
    const store = createLocalStore({ kv, resolveOwner: () => OWNER });

    // The store owns this key shape; the `mw:v1:` namespace belongs to the
    // AsyncStorage adapter, which is not in play with an injected KV.
    await kv.set(`save:${OWNER}:game:test:progress`, '{ this is not json');

    // Treated as absent so the app still starts…
    await expect(store.read('game:test:progress')).resolves.toBeNull();

    // …but the original bytes survive for diagnosis.
    const quarantined = [...kv.dump().keys()].filter((key) => key.includes('quarantine'));
    expect(quarantined).toHaveLength(1);
  });

  it('treats a structurally invalid envelope as absent', async () => {
    const kv = createMemoryKv();
    const store = createLocalStore({ kv, resolveOwner: () => OWNER });

    // Valid JSON, wrong shape — the case a previous app version could produce.
    await kv.set(
      `save:${OWNER}:game:test:progress`,
      JSON.stringify({ key: 'game:test:progress', revision: -5 }),
    );

    await expect(store.read('game:test:progress')).resolves.toBeNull();
  });

  it('reports itself as offline-capable and single-device', () => {
    const store = createLocalStore({ kv: createMemoryKv(), resolveOwner: () => OWNER });

    expect(store.capabilities).toEqual({ crossDevice: false, offline: true, queued: false });
  });
});
