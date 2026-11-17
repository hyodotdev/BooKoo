import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = process.cwd();
const read = (...parts: readonly string[]): string =>
  readFileSync(join(root, ...parts), 'utf8');

describe('EAS Observe privacy boundary', () => {
  const appIntegration = read('src', 'features', 'runtime', 'observe.tsx');
  const patch = read('patches', 'expo-app-metrics+57.0.23.patch');

  it('keeps product, route and user telemetry disabled', () => {
    expect(appIntegration).toContain('integrations: {}');
    expect(appIntegration).toContain('dispatchInDebug: false');
    expect(appIntegration).not.toMatch(
      /Observe\.(?:logEvent|reportError|setGlobalAttribute|setUser)/,
    );
  });

  it('removes automatic JavaScript error capture', () => {
    expect(patch).toContain('-installErrorHandler();');
    expect(patch).toContain('-import { installErrorHandler }');
  });

  it('strips free-form Android crash and exit messages', () => {
    expect(patch).toContain('composedMessage = throwable.javaClass.name');
    expect(patch).toContain('exceptionReason = exceptionClass');
    expect(patch).toContain('terminationReason = null');
  });

  it('strips free-form iOS MetricKit exception reasons', () => {
    expect(patch).toContain('self.exceptionReason = nil');
    expect(patch).not.toContain('+        composedMessage:');
  });
});
