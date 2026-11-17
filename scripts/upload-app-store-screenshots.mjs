#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {basename, dirname, join, relative, resolve} from 'node:path';
import {setTimeout} from 'node:timers';

import {SignJWT, importPKCS8} from 'jose';
import sharp from 'sharp';

const API_ROOT = 'https://api.appstoreconnect.apple.com';
const apply = process.argv.includes('--apply');
const verifyOnly = process.argv.includes('--verify-only');
const localOnly = process.argv.includes('--local-only');
if ([apply, verifyOnly, localOnly].filter(Boolean).length > 1)
  throw new Error(
    '--apply, --verify-only and --local-only are mutually exclusive.',
  );
const reportPath = process.argv
  .find((arg) => arg.startsWith('--report='))
  ?.slice('--report='.length);
const appId = process.env.ASC_APP_ID ?? '6805969489';
const root = resolve(import.meta.dirname, '..');
const {version} = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const appVersion = process.env.ASC_APP_VERSION ?? version;
const requestedLocale = process.env.ASC_LOCALE;
const keyId = process.env.ASC_API_KEY_ID;
const issuerId = process.env.ASC_API_ISSUER_ID;
const keyPath = process.env.ASC_API_KEY_PATH;
const galleryConfig = JSON.parse(
  await readFile(join(root, 'store-assets/apple-gallery-config.json'), 'utf8'),
);
const galleryVersion = galleryConfig.sourceVersion;
if (!/^\d+\.\d+\.\d+$/.test(galleryVersion ?? ''))
  throw new Error('The Apple gallery requires a semantic sourceVersion.');
const selection = JSON.parse(
  await readFile(join(root, 'store-assets/current-play-gallery.json'), 'utf8'),
);
const localeDirectories = Object.fromEntries(
  Object.entries(galleryConfig.locales).map(([locale, config]) => [
    locale,
    config.directory,
  ]),
);
const requestedFamilies = process.env.ASC_FAMILIES?.split(',');
const families = requestedFamilies
  ? galleryConfig.families.filter(({displayType}) =>
      requestedFamilies.includes(displayType),
    )
  : galleryConfig.families;
if (
  requestedFamilies &&
  requestedFamilies.some(
    (type) => !families.some(({displayType}) => type === displayType),
  )
)
  throw new Error('ASC_FAMILIES contains an unsupported display type.');

const locales = requestedLocale
  ? [requestedLocale]
  : [
      'en-US',
      ...Object.keys(localeDirectories).filter((locale) => locale !== 'en-US'),
    ];
if (!localOnly && families.some(({displayType}) => !displayType)) {
  throw new Error(
    'Verify the new device display types from saved Console assets before API upload.',
  );
}
for (const locale of locales) {
  if (!(locale in localeDirectories)) {
    throw new Error(
      `Unsupported ASC_LOCALE ${locale}. Expected one of ${Object.keys(localeDirectories).join(', ')}.`,
    );
  }
}

function screenshotFamilies(locale) {
  const localeDirectory = localeDirectories[locale];
  const base = join(
    root,
    'store-assets',
    'marketing',
    galleryVersion,
    localeDirectory,
  );
  return families.map((family) => ({
    ...family,
    directory: join(base, family.directory),
    label: `${locale} ${family.label}`,
  }));
}

if (!localOnly && (!keyId || !issuerId || !keyPath)) {
  throw new Error(
    'ASC_API_KEY_ID, ASC_API_ISSUER_ID, and ASC_API_KEY_PATH are required.',
  );
}

const privateKey = localOnly
  ? undefined
  : await importPKCS8(await readFile(keyPath, 'utf8'), 'ES256');
let token;
let tokenExpiresAt = 0;

async function authorization() {
  if (Date.now() >= tokenExpiresAt) {
    token = await new SignJWT({})
      .setProtectedHeader({alg: 'ES256', kid: keyId, typ: 'JWT'})
      .setIssuer(issuerId)
      .setAudience('appstoreconnect-v1')
      .setIssuedAt()
      .setExpirationTime('19m')
      .sign(privateKey);
    tokenExpiresAt = Date.now() + 18 * 60 * 1000;
  }
  return `Bearer ${token}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Authorization: await authorization(),
      ...(options.body ? {'Content-Type': 'application/json'} : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`,
    );
  }
  return body;
}

async function screenshotFiles(directory) {
  const files = (await readdir(directory))
    .filter((file) => /^\d{2}-.+\.png$/i.test(file))
    .sort();
  if (files.length < 1 || files.length > 10) {
    throw new Error(
      `${directory} must contain between 1 and 10 numbered PNG screenshots.`,
    );
  }
  return files.map((file) => join(directory, file));
}

async function findVersionLocalizations() {
  const versions = await api(
    `/v1/apps/${appId}/appStoreVersions?filter%5Bplatform%5D=IOS&filter%5BversionString%5D=${encodeURIComponent(appVersion)}&limit=10`,
  );
  const version = versions.data.find(
    (candidate) => candidate.attributes.versionString === appVersion,
  );
  if (!version)
    throw new Error(`App Store version ${appVersion} was not found.`);

  const localizations = await api(
    `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`,
  );
  const byLocale = new Map(
    localizations.data.map((candidate) => [
      candidate.attributes.locale,
      candidate,
    ]),
  );
  for (const locale of locales) {
    if (!byLocale.has(locale)) {
      throw new Error(`Localization ${locale} was not found.`);
    }
  }
  return byLocale;
}

async function listSets(localizationId) {
  const response = await api(
    `/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?limit=50&fields%5BappScreenshotSets%5D=screenshotDisplayType`,
  );
  return response.data;
}

async function createSet(localizationId, displayType) {
  const response = await api('/v1/appScreenshotSets', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'appScreenshotSets',
        attributes: {screenshotDisplayType: displayType},
        relationships: {
          appStoreVersionLocalization: {
            data: {type: 'appStoreVersionLocalizations', id: localizationId},
          },
        },
      },
    }),
  });
  return response.data;
}

async function listScreenshots(setId) {
  const response = await api(
    `/v1/appScreenshotSets/${setId}/appScreenshots?limit=50`,
  );
  return response.data;
}

async function deleteScreenshot(id) {
  await api(`/v1/appScreenshots/${id}`, {method: 'DELETE'});
}

async function waitForScreenshot(id) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await api(`/v1/appScreenshots/${id}`);
    const state = response.data.attributes.assetDeliveryState;
    if (state.state === 'COMPLETE') return response.data;
    if (state.state === 'FAILED') {
      throw new Error(
        `Screenshot ${id} failed: ${JSON.stringify(state.errors)}`,
      );
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  throw new Error(
    `Screenshot ${id} did not finish processing within ten minutes.`,
  );
}

async function uploadScreenshot(setId, filePath) {
  const bytes = await readFile(filePath);
  const reservation = await api('/v1/appScreenshots', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'appScreenshots',
        attributes: {fileName: basename(filePath), fileSize: bytes.length},
        relationships: {
          appScreenshotSet: {
            data: {type: 'appScreenshotSets', id: setId},
          },
        },
      },
    }),
  });
  const screenshot = reservation.data;

  for (const operation of screenshot.attributes.uploadOperations) {
    const chunk = bytes.subarray(
      operation.offset,
      operation.offset + operation.length,
    );
    const upload = await fetch(operation.url, {
      method: operation.method,
      headers: Object.fromEntries(
        operation.requestHeaders.map(({name, value}) => [name, value]),
      ),
      body: chunk,
    });
    if (!upload.ok) {
      throw new Error(
        `Asset upload failed for ${basename(filePath)}: ${upload.status}`,
      );
    }
  }

  await api(`/v1/appScreenshots/${screenshot.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'appScreenshots',
        id: screenshot.id,
        attributes: {
          uploaded: true,
          sourceFileChecksum: createHash('md5').update(bytes).digest('hex'),
        },
      },
    }),
  });
  return waitForScreenshot(screenshot.id);
}

async function setScreenshotOrder(setId, screenshotIds) {
  await api(`/v1/appScreenshotSets/${setId}/relationships/appScreenshots`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: screenshotIds.map((id) => ({type: 'appScreenshots', id})),
    }),
  });
}

const report = {
  appId,
  appVersion,
  galleryVersion,
  mode: localOnly
    ? 'local-only'
    : verifyOnly
      ? 'verify-only'
      : apply
        ? 'apply'
        : 'dry-run',
  families: [],
};
const plannedFiles = new Map();
async function checkpointReport() {
  if (!reportPath) return;
  const destination = resolve(reportPath);
  await mkdir(dirname(destination), {recursive: true});
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
}
// Complete local validation before replacing the first remote screenshot.
for (const locale of locales) {
  for (const family of screenshotFamilies(locale)) {
    const files = await screenshotFiles(family.directory);
    const manifest = JSON.parse(
      await readFile(join(family.directory, 'gallery-manifest.json'), 'utf8'),
    );
    if (
      manifest.version !== galleryVersion ||
      JSON.stringify(manifest.scenes) !== JSON.stringify(selection.scenes) ||
      manifest.panels.length !== selection.scenes.length ||
      files.length !== selection.scenes.length
    )
      throw new Error(`${family.label}: gallery manifest/count/order differs`);
    for (const [index, filePath] of files.entries()) {
      const info = await sharp(filePath).metadata();
      if (
        !family.acceptedSizes.some(
          ([width, height]) => info.width === width && info.height === height,
        ) ||
        info.hasAlpha ||
        info.format !== 'png'
      )
        throw new Error(`${family.label}: invalid image dimensions/format`);
      if (manifest) {
        const panel = manifest.panels[index];
        const expectedName = `${String(index + 1).padStart(2, '0')}-${selection.scenes[index]}.png`;
        const bytes = await readFile(filePath);
        const artifactRoot = join(root, 'store-assets/marketing', galleryVersion);
        const sourcePath = resolve(artifactRoot, panel.capture.file);
        if (relative(artifactRoot, sourcePath).startsWith('..'))
          throw new Error(
            `${family.label}: native capture is outside the artifact tree`,
          );
        const source = await readFile(sourcePath);
        if (
          basename(filePath) !== expectedName ||
          basename(panel.file) !== expectedName ||
          panel.locale !== locale ||
          panel.displayType !== family.displayType ||
          panel.scene !== selection.scenes[index] ||
          panel.width !== info.width ||
          panel.height !== info.height ||
          panel.capture.locale !== locale ||
          panel.capture.family !== family.sourceFamily ||
          panel.capture.scene !==
            (panel.scene === 'intro' ? 'calendar' : panel.scene) ||
          panel.capture.platform !== 'ios' ||
          !panel.capture.capturedAt ||
          !panel.capture.inspected ||
          !panel.capture.nativeArtifactSha256 ||
          !panel.capture.sourceFingerprint ||
          panel.capture.version !== galleryVersion ||
          panel.sha256 !== createHash('sha256').update(bytes).digest('hex') ||
          panel.capture.sha256 !==
            createHash('sha256').update(source).digest('hex')
        )
          throw new Error(
            `${family.label}: verified native provenance/checksum differs at position ${index + 1}`,
          );
      }
    }
    plannedFiles.set(family.directory, files);
  }
}

if (localOnly) {
  report.families = [...plannedFiles].map(([directory, files]) => ({
    directory: relative(root, directory),
    validatedCount: files.length,
  }));
  await checkpointReport();
  console.log(
    `Verified ${plannedFiles.size} local galleries; no API requests made.`,
  );
  process.exit(0);
}

const localizations = await findVersionLocalizations();
for (const locale of locales) {
  const localization = localizations.get(locale);
  const existingSets = await listSets(localization.id);

  for (const family of screenshotFamilies(locale)) {
    const files = plannedFiles.get(family.directory);
    let set = existingSets.find(
      (candidate) =>
        candidate.attributes.screenshotDisplayType === family.displayType,
    );
    const existing = set ? await listScreenshots(set.id) : [];
    const retainedByPath = new Map();
    const localFiles = [];

    for (const filePath of files) {
      const fileName = basename(filePath);
      const bytes = await readFile(filePath);
      const fileSize = bytes.length;
      const checksum = createHash('md5').update(bytes).digest('hex');
      localFiles.push({fileName, fileSize, checksum});
      const current = existing.find(
        (candidate) =>
          candidate.attributes.fileName === fileName &&
          candidate.attributes.fileSize === fileSize &&
          candidate.attributes.sourceFileChecksum === checksum &&
          candidate.attributes.assetDeliveryState?.state !== 'FAILED',
      );
      if (current) {
        // A timed-out upload may still be processing. Resume that exact asset
        // instead of deleting its matching bytes and creating a duplicate.
        const retained =
          apply && current.attributes.assetDeliveryState?.state !== 'COMPLETE'
            ? await waitForScreenshot(current.id)
            : current;
        retainedByPath.set(filePath, retained);
      }
    }

    const retainedIds = new Set(
      [...retainedByPath.values()].map((candidate) => candidate.id),
    );
    const stale = existing.filter(
      (candidate) => !retainedIds.has(candidate.id),
    );
    console.log(
      `${family.label}: ${files.length} local, ${existing.length} in App Store Connect, ${stale.length} stale`,
    );
    const familyReport = {
      locale,
      displayType: family.displayType,
      localFiles,
      existingCount: existing.length,
      staleCount: stale.length,
    };
    report.families.push(familyReport);
    await checkpointReport();
    const verify = (saved) => {
      if (saved.length !== localFiles.length)
        throw new Error(`${family.label}: saved image count differs`);
      for (const [index, local] of localFiles.entries()) {
        const remote = saved[index].attributes;
        if (
          remote.fileName !== local.fileName ||
          remote.fileSize !== local.fileSize ||
          remote.sourceFileChecksum !== local.checksum ||
          remote.assetDeliveryState?.state !== 'COMPLETE'
        ) {
          throw new Error(
            `${family.label}: saved bytes/order/state differ at position ${index + 1}`,
          );
        }
      }
      familyReport.verified = true;
      familyReport.saved = saved.map(({id, attributes}) => ({
        id,
        fileName: attributes.fileName,
        fileSize: attributes.fileSize,
        checksum: attributes.sourceFileChecksum,
        state: attributes.assetDeliveryState.state,
      }));
    };
    if (verifyOnly) {
      verify(existing);
      await checkpointReport();
      continue;
    }
    if (!apply) continue;

    if (!set) {
      set = await createSet(localization.id, family.displayType);
      console.log(`${family.label}: created screenshot set ${set.id}`);
    }

    // App Store Connect caps a set at ten images. Remove only screenshots that
    // are not checksum matches before uploading replacements so a full
    // eight-image set cannot transiently grow to sixteen and fail.
    for (const screenshot of stale) {
      await deleteScreenshot(screenshot.id);
      console.log(
        `${family.label}: removed stale ${screenshot.attributes.fileName}`,
      );
    }

    const screenshotIds = [];
    for (const filePath of files) {
      const fileName = basename(filePath);
      const current = retainedByPath.get(filePath);
      if (current) {
        screenshotIds.push(current.id);
        console.log(`${family.label}: kept ${fileName}`);
        continue;
      }
      const uploaded = await uploadScreenshot(set.id, filePath);
      screenshotIds.push(uploaded.id);
      console.log(`${family.label}: uploaded ${fileName}`);
    }

    await setScreenshotOrder(set.id, screenshotIds);
    verify(await listScreenshots(set.id));
    await checkpointReport();
    console.log(
      `${family.label}: verified ${screenshotIds.length} ordered screenshots`,
    );
  }
}

await checkpointReport();
if (!apply && !verifyOnly)
  console.log('Dry run only. Pass --apply to upload screenshots.');
