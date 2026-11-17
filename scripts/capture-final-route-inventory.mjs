#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {URL} from 'node:url';

const {qaApplicationId: qaId} = JSON.parse(
  readFileSync(new URL('../shared/application.json', import.meta.url), 'utf8'),
);

const [platform, device, outputRoot] = process.argv.slice(2);
if (!['android', 'ios'].includes(platform) || !device || !outputRoot) {
  throw new Error(
    'usage: capture-final-route-inventory.mjs <ios|android> <device> <output-root>',
  );
}

const routeFlowFiles = [
  '.maestro/capture-final-core.yaml',
  '.maestro/capture-final-ledger.yaml',
  '.maestro/capture-final-secondary.yaml',
  '.maestro/capture-final-settings.yaml',
];
const constants = {
  ITEM_ID: process.env.BOOKOO_CAPTURE_ITEM_ID,
  LEDGER_ID: process.env.BOOKOO_CAPTURE_LEDGER_ID,
};
const interpolate = (value) =>
  value.replace(
    /\$\{(ITEM_ID|LEDGER_ID)\}/g,
    (placeholder, key) => constants[key] ?? placeholder,
  );
const routes = routeFlowFiles.flatMap((file) => {
  const source = readFileSync(file, 'utf8');
  return [
    ...source.matchAll(/ROUTE:\s*(['"])(.*?)\1,\s*NAME:\s*(['"])(.*?)\3/g),
  ].map(([, , route, , name]) => ({
    name,
    route: interpolate(route).replace(/^bookoo:/, 'bookoo-qa:'),
  }));
});
const requestedStart = Number(process.env.BOOKOO_CAPTURE_START ?? 0);
const routeStart =
  Number.isInteger(requestedStart) && requestedStart >= 0 ? requestedStart : 0;
const requestedNames = new Set(
  (process.env.BOOKOO_CAPTURE_NAMES ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
);
const selectedRoutes = routes
  .map((route, index) => ({...route, index}))
  .slice(routeStart)
  .filter(({name}) => requestedNames.size === 0 || requestedNames.has(name));
const unresolvedVariables = new Set(
  selectedRoutes.flatMap(({route}) =>
    [...route.matchAll(/\$\{(ITEM_ID|LEDGER_ID)\}/g)].map(([, key]) => key),
  ),
);
if (unresolvedVariables.size > 0) {
  throw new Error(
    `missing capture fixture environment: ${[...unresolvedVariables]
      .map((key) => `BOOKOO_CAPTURE_${key}`)
      .join(', ')}`,
  );
}
const requestedWait = Number(process.env.BOOKOO_CAPTURE_WAIT_SECONDS ?? 3);
const postOpenWait =
  Number.isFinite(requestedWait) && requestedWait >= 0 ? requestedWait : 3;
const requestedBootWait = Number(
  process.env.BOOKOO_CAPTURE_BOOT_WAIT_SECONDS ?? 15,
);
const bootWait =
  Number.isFinite(requestedBootWait) && requestedBootWait >= 0
    ? requestedBootWait
    : 15;
const restartEachRoute = process.env.BOOKOO_CAPTURE_RESTART_EACH_ROUTE !== '0';
const requestedMaxDuplicate = Number(
  process.env.BOOKOO_CAPTURE_MAX_DUPLICATE_IMAGES ?? 8,
);
const maxDuplicateImages =
  Number.isInteger(requestedMaxDuplicate) && requestedMaxDuplicate >= 1
    ? requestedMaxDuplicate
    : 8;
const runtimeFailures = [];

mkdirSync(outputRoot, {recursive: true});
const sleep = (seconds) =>
  execFileSync('/bin/sleep', [String(seconds)], {stdio: 'ignore'});

const androidActivity =
  platform === 'android'
    ? execFileSync(
        'adb',
        [
          '-s',
          device,
          'shell',
          'cmd',
          'package',
          'resolve-activity',
          '--brief',
          '-a',
          'android.intent.action.MAIN',
          '-c',
          'android.intent.category.LAUNCHER',
          qaId,
        ],
        {encoding: 'utf8'},
      )
        .trim()
        .split('\n')
        .at(-1)
    : null;
if (platform === 'android' && !androidActivity?.startsWith(`${qaId}/`))
  throw new Error(
    'QA app is not installed; refusing to fall back to the store app',
  );

const launchClean = () => {
  if (platform === 'ios') {
    try {
      execFileSync('xcrun', ['simctl', 'terminate', device, qaId], {
        stdio: 'ignore',
      });
    } catch {
      // A stopped app already has the clean launch state we need.
    }
    execFileSync('xcrun', ['simctl', 'launch', device, qaId], {
      stdio: 'ignore',
    });
  } else {
    execFileSync('adb', ['-s', device, 'shell', 'am', 'force-stop', qaId], {
      stdio: 'ignore',
    });
    execFileSync(
      'adb',
      ['-s', device, 'shell', 'am', 'start', '-W', '-n', androidActivity],
      {stdio: 'ignore'},
    );
  }
  sleep(bootWait);
};

const stopApp = () => {
  if (platform === 'ios') {
    try {
      execFileSync('xcrun', ['simctl', 'terminate', device, qaId], {
        stdio: 'ignore',
      });
    } catch {
      // A stopped app is already ready for a cold deep-link launch.
    }
    return;
  }
  execFileSync('adb', ['-s', device, 'shell', 'am', 'force-stop', qaId], {
    stdio: 'ignore',
  });
  execFileSync('adb', ['-s', device, 'logcat', '-c'], {stdio: 'ignore'});
};

const openRoute = (route) => {
  if (platform === 'ios') {
    execFileSync('xcrun', ['simctl', 'openurl', device, route], {
      stdio: 'ignore',
    });
    return;
  }
  execFileSync(
    'adb',
    [
      '-s',
      device,
      'shell',
      'am',
      'start',
      '-W',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      route.replaceAll('&', '\\&'),
      qaId,
    ],
    {stdio: 'ignore'},
  );
};

if (!restartEachRoute) launchClean();

for (const {name, route, index} of selectedRoutes) {
  const output = path.join(outputRoot, `${name}.png`);
  if (restartEachRoute) {
    stopApp();
  }
  openRoute(route);
  sleep(restartEachRoute ? bootWait : postOpenWait);
  if (platform === 'ios') {
    execFileSync('xcrun', ['simctl', 'io', device, 'screenshot', output], {
      stdio: 'ignore',
    });
  } else {
    const screenshot = execFileSync(
      'adb',
      ['-s', device, 'exec-out', 'screencap', '-p'],
      {maxBuffer: 16 * 1024 * 1024},
    );
    writeFileSync(output, screenshot);

    const reactLog = execFileSync(
      'adb',
      ['-s', device, 'logcat', '-d', '-v', 'time', 'ReactNativeJS:V', '*:S'],
      {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024},
    );
    const runtimeLog = execFileSync(
      'adb',
      ['-s', device, 'logcat', '-d', '-v', 'time', 'AndroidRuntime:E', '*:S'],
      {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024},
    );
    const relevantLines = `${reactLog}\n${runtimeLog}`
      .split('\n')
      .filter((line) =>
        /Can't perform a React state update|FATAL EXCEPTION|Unhandled JS Exception|(?:Type|Reference|Range)Error:|Invariant Violation/.test(
          line,
        ),
      );
    if (relevantLines.length > 0) {
      runtimeFailures.push({name, lines: relevantLines});
    }
  }
  process.stdout.write(`[${index + 1}/${routes.length}] ${name}\n`);
}

const duplicateGroups = new Map();
for (const {name} of selectedRoutes) {
  const contents = readFileSync(path.join(outputRoot, `${name}.png`));
  const hash = createHash('sha256').update(contents).digest('hex');
  const names = duplicateGroups.get(hash) ?? [];
  names.push(name);
  duplicateGroups.set(hash, names);
}
const repeatedImages = [...duplicateGroups.values()]
  .filter((names) => names.length > 1)
  .sort((left, right) => right.length - left.length);
const audit = {
  captured: selectedRoutes.length,
  distinctImages: duplicateGroups.size,
  repeatedImages,
  runtimeFailures,
};
writeFileSync(
  path.join(outputRoot, 'capture-audit.json'),
  `${JSON.stringify(audit, null, 2)}\n`,
);

const largestDuplicateGroup = repeatedImages[0]?.length ?? 1;
if (largestDuplicateGroup > maxDuplicateImages) {
  throw new Error(
    `capture audit failed: ${largestDuplicateGroup} routes produced the same image`,
  );
}
if (runtimeFailures.length > 0) {
  throw new Error(
    `capture audit failed: runtime errors on ${runtimeFailures
      .map(({name}) => name)
      .join(', ')}`,
  );
}
