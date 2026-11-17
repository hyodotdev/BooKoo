import {cleanup} from '@testing-library/react-native';

// Unmount anything still mounted so a leaked timer in one test cannot bleed
// into the next.
afterEach(cleanup);

/**
 * Surface unhandled promise rejections as test failures instead of letting them
 * vanish into the void.
 *
 * Registered/unregistered per test file rather than at module scope: jest runs
 * every test file against the same node process under `--runInBand`, so a bare
 * `process.on` here leaks a listener per file and eventually trips node's
 * MaxListenersExceededWarning.
 */
const failOnUnhandledRejection = (reason: unknown): never => {
  throw reason instanceof Error ? reason : new Error(String(reason));
};

beforeAll(() => {
  process.on('unhandledRejection', failOnUnhandledRejection);
});

afterAll(() => {
  process.off('unhandledRejection', failOnUnhandledRejection);
});
