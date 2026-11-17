const TRANSIENT_SYSTEM_OPERATIONS_TIMEOUT =
  'timed out performing too many system operations';
const CONVEX_DEPLOYMENT_METADATA_PATH = 'api.convex.dev/api/deployment/';
const TRANSIENT_SERVICE_UNAVAILABLE = '503 service unavailable';

interface SeedStatusRetryOptions {
  readonly maxAttempts?: number;
  readonly delayMs?: number;
  readonly wait?: (delayMs: number) => Promise<void>;
  readonly onRetry?: (attempt: number, maxAttempts: number) => void;
}

const errorOutput = (error: unknown): string => {
  const output = [error instanceof Error ? error.message : String(error)];
  if (typeof error !== 'object' || error === null) return output.join('\n');
  if ('stderr' in error) output.push(String(error.stderr));
  if ('stdout' in error) output.push(String(error.stdout));
  return output.join('\n');
};

export const isTransientSeedStatusError = (error: unknown): boolean => {
  const output = errorOutput(error).toLowerCase();
  return (
    output.includes(TRANSIENT_SYSTEM_OPERATIONS_TIMEOUT) ||
    (output.includes(CONVEX_DEPLOYMENT_METADATA_PATH) &&
      output.includes(TRANSIENT_SERVICE_UNAVAILABLE))
  );
};

export const readSeedStatusWithRetry = async <Status>(
  readStatus: () => Status,
  options: SeedStatusRetryOptions = {},
): Promise<Status> => {
  const maxAttempts = options.maxAttempts ?? 4;
  const delayMs = options.delayMs ?? 3_000;
  const wait =
    options.wait ??
    ((durationMs: number) =>
      new Promise<void>((resolvePromise) =>
        setTimeout(resolvePromise, durationMs),
      ));

  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1)
    throw new Error('maxAttempts must be a positive integer');
  if (!Number.isFinite(delayMs) || delayMs < 0)
    throw new Error('delayMs must be a non-negative number');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return readStatus();
    } catch (error) {
      if (!isTransientSeedStatusError(error) || attempt === maxAttempts)
        throw error;
      options.onRetry?.(attempt, maxAttempts);
      await wait(delayMs);
    }
  }

  throw new Error('seed status retry exhausted unexpectedly');
};
