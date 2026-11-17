import {
  cleanupLegacySensitiveStorage,
  legacySensitiveStorageConstants,
} from '~/features/runtime/legacySensitiveStorageCleanup';
import {Storage} from '~/utils/storage';

describe('retired encrypted storage cleanup', () => {
  it('clears the legacy encrypted store before deleting its key and markers', async () => {
    const calls: string[] = [];
    await cleanupLegacySensitiveStorage({
      clearEncryptedStore: (key) => calls.push(`clear:${key}`),
      deleteKey: async () => {
        calls.push('delete-key');
      },
      deleteMarker: (key) => calls.push(`delete:${key}`),
      readKey: async () => 'legacy-key',
    });

    expect(calls).toEqual([
      'clear:legacy-key',
      'delete-key',
      `delete:${legacySensitiveStorageConstants.accountScope}`,
      `delete:${legacySensitiveStorageConstants.provisionMarker}`,
    ]);
  });

  it('never blocks launch when every cleanup operation fails', async () => {
    await expect(
      cleanupLegacySensitiveStorage({
        clearEncryptedStore: () => {
          throw new Error('unreadable');
        },
        deleteKey: async () => {
          throw new Error('locked');
        },
        deleteMarker: () => {
          throw new Error('unavailable');
        },
        readKey: async () => 'legacy-key',
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['missing', async () => null],
    [
      'corrupt',
      async () => {
        throw new Error('corrupt keychain item');
      },
    ],
  ])(
    'still deletes the key and markers when the key is %s',
    async (_, readKey) => {
      const calls: string[] = [];

      await cleanupLegacySensitiveStorage({
        clearEncryptedStore: () => calls.push('clear'),
        deleteKey: async () => {
          calls.push('delete-key');
        },
        deleteMarker: (key) => calls.push(`delete:${key}`),
        readKey,
      });

      expect(calls).toEqual([
        'delete-key',
        `delete:${legacySensitiveStorageConstants.accountScope}`,
        `delete:${legacySensitiveStorageConstants.provisionMarker}`,
      ]);
    },
  );

  it('does not expose retired server-data keys in ordinary MMKV inventory', () => {
    expect(Object.values(Storage)).not.toContain(
      legacySensitiveStorageConstants.accountScope,
    );
    expect(Object.values(Storage)).not.toContain(
      legacySensitiveStorageConstants.provisionMarker,
    );
  });
});
