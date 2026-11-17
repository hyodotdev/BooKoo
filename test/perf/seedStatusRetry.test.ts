import {
  isTransientSeedStatusError,
  readSeedStatusWithRetry,
} from '../../scripts/perf/seedStatusRetry';

describe('seed status retry', () => {
  it('recognizes the exact transient Convex system-operations timeout', () => {
    expect(
      isTransientSeedStatusError({
        stderr:
          'Server Error: Your request timed out performing too many system operations.',
      }),
    ).toBe(true);
    expect(isTransientSeedStatusError(new Error('permission denied'))).toBe(
      false,
    );
  });

  it('recognizes only a Convex deployment-metadata 503 as unavailable', () => {
    expect(
      isTransientSeedStatusError(
        new Error(
          'Error fetching GET https://api.convex.dev/api/deployment/example/team_and_project 503 Service Unavailable',
        ),
      ),
    ).toBe(true);
    expect(isTransientSeedStatusError(new Error('503 Service Unavailable'))).toBe(
      false,
    );
  });

  it('retries a transient status read and preserves the successful result', async () => {
    const readStatus = jest
      .fn<{readonly processed: number}, []>()
      .mockImplementationOnce(() => {
        throw new Error(
          'Your request timed out performing too many system operations.',
        );
      })
      .mockReturnValue({processed: 72_000});
    const wait = jest.fn<Promise<void>, [number]>().mockResolvedValue();

    await expect(
      readSeedStatusWithRetry(readStatus, {wait, delayMs: 25}),
    ).resolves.toEqual({processed: 72_000});
    expect(readStatus).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(25);
  });

  it('fails permanent errors without retrying', async () => {
    const error = new Error('unauthorized deployment');
    const readStatus = jest.fn<never, []>(() => {
      throw error;
    });
    const wait = jest.fn<Promise<void>, [number]>().mockResolvedValue();

    await expect(readSeedStatusWithRetry(readStatus, {wait})).rejects.toBe(
      error,
    );
    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('fails after the bounded transient retry budget is exhausted', async () => {
    const error = new Error(
      'Your request timed out performing too many system operations.',
    );
    const readStatus = jest.fn<never, []>(() => {
      throw error;
    });
    const wait = jest.fn<Promise<void>, [number]>().mockResolvedValue();

    await expect(
      readSeedStatusWithRetry(readStatus, {maxAttempts: 3, wait}),
    ).rejects.toBe(error);
    expect(readStatus).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });
});
