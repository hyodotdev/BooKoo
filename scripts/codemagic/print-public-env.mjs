// Prints the EXPO_PUBLIC_* variables of the current process as KEY=value lines
// for Codemagic's $CM_ENV. `codemagic.yaml` runs it inside
// `eas env:exec production`, so the store build bundles exactly the values the
// EAS production environment holds. $CM_ENV is line-based: a multi-line value
// would corrupt every variable after it, so one fails the build instead.
const lines = Object.entries(process.env)
  .filter(([name]) => name.startsWith('EXPO_PUBLIC_'))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, value]) => {
    if (/[\r\n]/.test(value ?? ''))
      throw new Error(`${name} spans several lines`);
    return `${name}=${value}`;
  });

if (lines.length === 0)
  throw new Error('The EAS production environment returned no EXPO_PUBLIC_*');
process.stdout.write(`${lines.join('\n')}\n`);
