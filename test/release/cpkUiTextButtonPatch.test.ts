import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

const root = process.cwd();
const read = (...parts: readonly string[]): string =>
  readFileSync(join(root, ...parts), 'utf8');
const installed = (...parts: readonly string[]): string =>
  read('node_modules', 'cpk-ui', ...parts);

describe('cpk-ui 0.8.1 pin', () => {
  const installedButton = installed('components', 'uis', 'Button', 'Button.js');
  const installedDialog = installed(
    'components',
    'modals',
    'AlertDialog',
    'AlertDialog.js',
  );
  const installedIndex = installed('index.js');

  it('pins the stable release with no cpk-ui overlay', () => {
    expect(JSON.parse(read('package.json')).dependencies['cpk-ui']).toBe(
      '0.8.1',
    );
    expect(JSON.parse(installed('package.json')).version).toBe('0.8.1');
    expect(
      readdirSync(join(root, 'patches')).filter((file) =>
        file.startsWith('cpk-ui+'),
      ),
    ).toEqual([]);
    expect(read('docs', 'ai', 'WORKFLOWS.md')).toContain(
      '1fca029f8273280ec5d1e4491908f27e08b0b45d',
    );
  });

  it('ships text-button padding and a controlled AlertDialog', () => {
    for (const contract of [
      "? '8px 16px'",
      "type === 'text' ? { alignSelf: 'flex-start' } : null",
      'underlayColor: theme.role.underlay',
    ]) {
      expect(installedButton).toContain(contract);
    }
    expect(installedButton).not.toContain(
      "underlayColor: type === 'text' ? 'transparent' : theme.role.underlay",
    );
    expect(installedDialog).toContain('visible: visibleProp');
    expect(installedDialog).toContain('onClose');
  });

  it('ships the Android keyboard avoidance on AlertDialog', () => {
    expect(installedDialog).toContain(
      "behavior: Platform.OS === 'web' ? undefined : 'padding'",
    );
    expect(read('docs', 'ai', 'WORKFLOWS.md')).toContain(
      '960c51257222d09767d63c990960a059cb827a4a',
    );
  });

  // React Native's iOS default broke Hangul between syllables ("있어 / 요").
  it('ships Korean word breaking on Typography', () => {
    expect(
      installed('components', 'uis', 'Typography', 'Typography.js'),
    ).toContain('lineBreakStrategyIOS: "hangul-word", ...props');
    expect(read('docs', 'ai', 'WORKFLOWS.md')).toContain(
      '318def52a6ede7aeb5e62a790bfa481e5d7cb070',
    );
  });

  // The Android entry editor's time fields; the native dialog read the
  // device language and could not edit the time.
  it('ships TimePicker', () => {
    expect(
      installed('components', 'uis', 'TimePicker', 'TimePicker.js'),
    ).toContain("testID = 'time-picker'");
    expect(installedIndex).toContain(
      "export * from './components/uis/TimePicker/TimePicker';",
    );
    expect(read('docs', 'ai', 'WORKFLOWS.md')).toContain(
      '0514e01d0e5e89b5900ce510cc10698e5f81e7cb',
    );
  });

  it('ships the charts and selection motion that the overlay used to carry', () => {
    for (const name of ['DonutChart', 'LineChart', 'SelectionFeedback']) {
      expect(installedIndex).toContain(
        `export * from './components/uis/${name}/${name}';`,
      );
    }
    const calendar = installed('components', 'uis', 'Calendar', 'Calendar.js');
    expect(calendar).toContain('selectionAnimation = false');
    expect(calendar).toContain('monthsToShow === 1 ? (_jsx(CalendarWeekdayRow');
    // The ledger calendar clamps its day pill to this during the spring.
    expect(installed('components', 'uis', 'Calendar', 'types.d.ts')).toContain(
      'contentMaxSize?: number',
    );
    expect(
      installed('components', 'uis', 'RadioGroup', 'RadioButton.js'),
    ).toContain('active: !!selected && !disabled');
    expect(
      installed(
        'components',
        'uis',
        'SelectionFeedback',
        'SelectionFeedback.js',
      ),
    ).toContain('reducedMotion === true || systemReducedMotion');
    const lineChart = installed(
      'components',
      'uis',
      'LineChart',
      'LineChart.js',
    );
    expect(lineChart).toContain("role: interactive ? 'group' : 'img'");
    expect(lineChart).toContain('(interactive ? points : [])');
    expect(
      installed('components', 'uis', 'DonutChart', 'DonutChart.js'),
    ).toContain('accessible: true');
    const workflows = read('docs', 'ai', 'WORKFLOWS.md');
    expect(workflows).toContain('cpk-ui/pull/24');
    expect(workflows).toContain('cpk-ui/pull/25');
  });

  // The category stats tooltip clipped long won amounts at a fixed 88pt.
  it('sizes the LineChart tooltip and shows bare CJK calendar day numbers', () => {
    const lineChart = installed(
      'components',
      'uis',
      'LineChart',
      'LineChart.js',
    );
    expect(lineChart).toContain(
      'Math.min(Math.max(88, estimateTextWidth(tooltipText) + 24), Math.max(88, frame.width - 8))',
    );
    expect(lineChart).toContain('FULL_WIDTH.test(glyph) ? 11 : 7');
    expect(installed('components', 'uis', 'Calendar', 'intl.js')).toContain(
      "part.type === 'day'",
    );
  });

  it('uses published pager and native input accessibility', () => {
    const installedPager = installed(
      'components',
      'uis',
      'PageIndicator',
      'PageIndicator.js',
    );
    const installedInput = installed(
      'components',
      'uis',
      'EditText',
      'EditText.js',
    );
    expect(installedPager).toContain('progress.get()');
    expect(installedPager).toContain('accessibilityValue: { min: 0');
    expect(installedInput).toContain('accessible: false');
    expect(installedInput).toContain('editTextInputMetrics');
    expect(installedInput).toContain('includeFontPadding: false');
  });

  it('preserves all three native Button parents through loading transitions', () => {
    expect(installedButton).toContain('ButtonContainer, { collapsable: false');
    expect(installedButton).toContain(
      'View, { collapsable: false, style: compositeStyles.content',
    );
    expect(installedButton).toContain(
      'View, { collapsable: false, style: compositeStyles.loading',
    );
    expect(read('docs', 'ai', 'WORKFLOWS.md')).toContain('e4df2dc');
  });

  it('ships the single-line label, press feedback and flattened icon colours', () => {
    expect(installedButton).toContain(
      'numberOfLines: 1, style: compositeStyles.text',
    );
    expect(installedButton).toContain('foreground: true');
    expect(installedButton).toContain('borderless: false');
    expect(installedButton).toContain(
      'StyleSheet.flatten(compositeStyles.text)',
    );
    expect(read('docs', 'ai', 'WORKFLOWS.md')).toContain('0e5dee0');
  });
});
