import {eraseUser} from '../../convex/subscriptions/erasure';
function handler(
  value: object,
): (ctx: object, args: object) => Promise<unknown> {
  const registered: unknown = Reflect.get(value, '_handler');
  if (typeof registered !== 'function') throw new Error('Missing handler');
  return (ctx, args) => registered(ctx, args);
}
describe('provider account erasure', () => {
  const key = process.env.IAPKIT_SECRET_KEY;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.IAPKIT_SECRET_KEY = 'server-only';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (key === undefined) delete process.env.IAPKIT_SECRET_KEY;
    else process.env.IAPKIT_SECRET_KEY = key;
  });
  it('submits only the server-owned app identity for durable erasure', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ok: true, jobId: 'job-1', status: 'queued'}),
          {status: 202},
        ),
      );
    const runAfter = jest.fn();
    await handler(eraseUser)({scheduler: {runAfter}}, {userId: 'deleted-user'});
    expect(fetch).toHaveBeenCalledWith(
      'https://kit.openiap.dev/v2/subscriptions/user-erasure',
      expect.objectContaining({
        body: JSON.stringify({userId: 'deleted-user'}),
        headers: expect.objectContaining({Authorization: 'Bearer server-only'}),
      }),
    );
    expect(runAfter).toHaveBeenCalledWith(60000, expect.anything(), {
      userId: 'deleted-user',
      jobId: 'job-1',
      attempt: 1,
    });
  });
  it('finishes only after the same accepted job reports completion', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({jobId: 'job-1', status: 'completed'})),
      );
    const runAfter = jest.fn();
    await handler(eraseUser)(
      {scheduler: {runAfter}},
      {userId: 'deleted-user', jobId: 'job-1', attempt: 1},
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://kit.openiap.dev/v2/subscriptions/user-erasure/job-1',
      expect.objectContaining({method: 'GET'}),
    );
    expect(fetch.mock.calls[0][1]?.body).toBeUndefined();
    expect(runAfter).not.toHaveBeenCalled();
  });
  it.each(['running', 'offline', 'foreign-job'] as const)(
    'retains a durable accepted job while %s',
    async (state) => {
      const fetch = jest.spyOn(global, 'fetch');
      if (state === 'offline')
        fetch.mockRejectedValueOnce(new Error('Offline'));
      else
        fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              jobId: state === 'foreign-job' ? 'other-job' : 'job-1',
              status: state === 'foreign-job' ? 'completed' : 'running',
            }),
          ),
        );
      const runAfter = jest.fn();
      await handler(eraseUser)(
        {scheduler: {runAfter}},
        {userId: 'deleted-user', jobId: 'job-1', attempt: 2},
      );
      expect(runAfter).toHaveBeenCalledWith(240000, expect.anything(), {
        userId: 'deleted-user',
        jobId: 'job-1',
        attempt: 3,
      });
    },
  );
  it('persists a delayed retry when the provider is unavailable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Offline'));
    const runAfter = jest.fn();
    await handler(eraseUser)(
      {scheduler: {runAfter}},
      {userId: 'deleted-user', attempt: 2},
    );
    expect(runAfter).toHaveBeenCalledWith(240000, expect.anything(), {
      userId: 'deleted-user',
      attempt: 3,
    });
  });
  it('surfaces exhausted retries as an operational failure', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, {status: 500}));
    const runAfter = jest.fn();
    await expect(
      handler(eraseUser)(
        {scheduler: {runAfter}},
        {userId: 'deleted-user', attempt: 7},
      ),
    ).rejects.toThrow('operational retry');
    expect(runAfter).not.toHaveBeenCalled();
  });
});
