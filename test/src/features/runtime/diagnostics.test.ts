import {
  clearDiagnostics,
  diagnostic,
  diagnosticInternals,
  diagnosticSnapshot,
} from '~/features/diagnostics/ring';

describe('bounded diagnostics ring', () => {
  afterEach(() => {
    clearDiagnostics();
    jest.restoreAllMocks();
  });

  it('retains only the newest closed, content-free events', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    clearDiagnostics();
    for (let index = 0; index < diagnosticInternals.maxRows + 5; index += 1)
      diagnostic({kind: 'INTL_CAPS', mask: index});
    const rows = diagnosticSnapshot();
    expect(rows).toHaveLength(diagnosticInternals.maxRows);
    expect(rows[0]?.event).toEqual({kind: 'INTL_CAPS', mask: 5});
    expect(rows.at(-1)?.event).toEqual({
      kind: 'INTL_CAPS',
      mask: diagnosticInternals.maxRows + 4,
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
