import {ownedAvatarUrl} from '../../convex/lib/userProfiles';

/**
 * `convex/schema/uploads.ts` states the rule this enforces: Convex records no
 * uploader on `_storage` metadata, so a mutation handed a storage id cannot
 * tell a member's own blob from one they guessed, and ownership lives in
 * `uploads` instead. A storage URL carries no auth and no expiry, and
 * `userProfiles.avatarUrl` is republished by `publicProfileByHandle`, which
 * gates on nothing.
 *
 * `updateProfile` checked owner *and* purpose. `completeProfileStep` called
 * `ctx.storage.getUrl` on whatever id it was handed, so naming a receipt's
 * storage id during onboarding published a ledger's financial document to a
 * permanent unauthenticated URL — one that leaving the ledger never revoked.
 */

type Upload = {userId: string; purpose: string} | null;

function ctxWith(upload: Upload, url: string | null = 'https://blob/1') {
  return {
    db: {
      query: () => ({
        withIndex: () => ({unique: async () => upload}),
      }),
    },
    storage: {getUrl: jest.fn(async () => url)},
  };
}

const call = (upload: Upload, url?: string | null) =>
  ownedAvatarUrl(
    ctxWith(upload, url) as unknown as Parameters<typeof ownedAvatarUrl>[0],
    'me' as Parameters<typeof ownedAvatarUrl>[1],
    'blob' as Parameters<typeof ownedAvatarUrl>[2],
  );

describe('publishing a blob as a profile avatar', () => {
  it('accepts the caller’s own avatar upload', async () => {
    await expect(call({userId: 'me', purpose: 'AVATAR'})).resolves.toBe(
      'https://blob/1',
    );
  });

  it('refuses a receipt the caller uploaded for a shared ledger', async () => {
    await expect(call({userId: 'me', purpose: 'RECEIPT'})).rejects.toMatchObject(
      {data: {code: 'UPLOAD_INVALID'}},
    );
  });

  it('refuses a blob belonging to somebody else', async () => {
    await expect(
      call({userId: 'someone-else', purpose: 'AVATAR'}),
    ).rejects.toMatchObject({data: {code: 'UPLOAD_INVALID'}});
  });

  it('refuses a storage id that was never claimed in uploads', async () => {
    await expect(call(null)).rejects.toMatchObject({
      data: {code: 'UPLOAD_INVALID'},
    });
  });

  it('refuses an upload whose blob no longer resolves', async () => {
    await expect(
      call({userId: 'me', purpose: 'AVATAR'}, null),
    ).rejects.toMatchObject({data: {code: 'UPLOAD_INVALID'}});
  });

  it('never reaches storage for a blob it is going to refuse', async () => {
    // The refusal must not be "resolve it, then decide": `getUrl` is the step
    // that mints the unauthenticated URL.
    const ctx = ctxWith({userId: 'someone-else', purpose: 'AVATAR'});
    await expect(
      ownedAvatarUrl(
        ctx as unknown as Parameters<typeof ownedAvatarUrl>[0],
        'me' as Parameters<typeof ownedAvatarUrl>[1],
        'blob' as Parameters<typeof ownedAvatarUrl>[2],
      ),
    ).rejects.toMatchObject({data: {code: 'UPLOAD_INVALID'}});
    expect(ctx.storage.getUrl).not.toHaveBeenCalled();
  });
});

describe('the profile mutations', () => {
  it('route every avatar through the ownership check', () => {
    // The defect was drift: one of the two paths resolved a storage id
    // directly. This fails if either grows a bare `getUrl` again.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../../convex/user/mutations.ts'),
      'utf8',
    ) as string;
    expect(source).not.toContain('storage.getUrl');
    expect(source.match(/ownedAvatarUrl\(/g)).toHaveLength(2);
  });
});
