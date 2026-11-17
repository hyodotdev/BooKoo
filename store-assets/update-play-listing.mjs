import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, join, resolve} from 'node:path';
import {URLSearchParams} from 'node:url';
import {importPKCS8, SignJWT} from 'jose';
import sharp from 'sharp';

// Run without --apply first. Only the selected listings and phone screenshots
// may change; existing tracks, other locales and graphic types are preserved.
const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--credentials')) throw Error('Pass --credentials <service-account.json>');
const apply = args.includes('--apply');
const textOnly = args.includes('--text-only');
const root = resolve(import.meta.dirname, '..');
const gallery = JSON.parse(await readFile(join(root, 'store-assets/current-play-gallery.json'), 'utf8'));
const assets = args.includes('--assets') ? resolve(root, value('--assets')) : resolve(root, 'store-assets', gallery.directory);
const backup = args.includes('--backup-dir')
  ? resolve(value('--backup-dir'))
  : join(root, '.local/store-listing', basename(assets), String(Date.now()));
const localeMappings = JSON.parse(await readFile(join(root, 'store-assets/store-locales.json'), 'utf8'));
const galleryDirectories = {'en-US': 'en-US', 'ko-KR': 'ko-KR', 'ja-JP': 'ja', 'zh-CN': 'zh-CN', id: 'id'};
const available = Object.fromEntries(Object.entries(localeMappings).flatMap(([metadata, mapping]) => mapping.google.map(language => [language, {metadata, gallery: galleryDirectories[language]}])));
const languages = args.includes('--locales') ? value('--locales').split(',') : textOnly ? Object.keys(available) : gallery.locales;
if (!languages.length || new Set(languages).size !== languages.length || languages.some(language => !(language in available))) throw Error('Unsupported or repeated Play locale');
if (!textOnly && languages.some(language => !available[language].gallery)) throw Error('A locale without a dedicated gallery requires --text-only');
const metadata = Object.fromEntries(languages.map(language => [language, available[language].metadata]));
const manifest = textOnly ? {panels: []} : JSON.parse(await readFile(join(assets, 'manifest.json'), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const plans = [];
for (const [language, locale] of Object.entries(metadata)) {
  const copy = JSON.parse(await readFile(join(root, `store-assets/metadata/${locale}.json`), 'utf8')).google;
  const files = textOnly ? [] : manifest.panels.filter((item) => item.locale === available[language].gallery);
  if ((!textOnly && files.length !== 8) || [...copy.name].length > 30 || [...copy.shortDescription].length > 80 || [...copy.fullDescription].length > 4000) throw Error('Invalid listing contract');
  if (!textOnly && files.map(file => file.scene).join(',') !== gallery.scenes.join(',')) throw Error(`Unexpected gallery order: ${language}`);
  for (const file of files) {
    const bytes = await readFile(join(assets, available[language].gallery, file.file));
    const info = await sharp(bytes).metadata();
    if (hash(bytes) !== file.sha256 || info.width !== 1080 || info.height !== 1920 || info.hasAlpha || bytes.length > 8 * 1024 * 1024) throw Error(`Image changed after review: ${file.file}`);
  }
  plans.push({language, title: copy.name, shortDescription: copy.shortDescription, fullDescription: copy.fullDescription, files});
}
const key = JSON.parse(await readFile(resolve(value('--credentials')), 'utf8'));
const assertion = await new SignJWT({scope: 'https://www.googleapis.com/auth/androidpublisher'})
  .setProtectedHeader({alg: 'RS256'}).setIssuer(key.client_email).setAudience('https://oauth2.googleapis.com/token')
  .setIssuedAt().setExpirationTime('1h').sign(await importPKCS8(key.private_key, 'RS256'));
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion})});
if (!tokenResponse.ok) throw Error(`Authentication failed: ${tokenResponse.status}`);
const token = (await tokenResponse.json()).access_token;
const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/dev.hyo.bookoo/edits';
async function api(url, method = 'GET', body, contentType = 'application/json') {
  const response = await fetch(url, {method, headers: {Authorization: `Bearer ${token}`, 'Content-Type': contentType}, body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body});
  const text = await response.text();
  if (!response.ok) throw Error(`Play ${method} failed (${response.status})`);
  return text ? JSON.parse(text) : null;
}
const edit = await api(base, 'POST', {});
const endpoint = `${base}/${edit.id}`;
let committed = false;
try {
  const tracks = await api(`${endpoint}/tracks`);
  const listings = await api(`${endpoint}/listings`);
  const details = await api(`${endpoint}/details`);
  if (details.defaultLanguage !== gallery.defaultLanguage) throw Error('Play default language does not match the reviewed English-first gallery');
  const before = {tracks, listings, details, images: {}};
  for (const plan of plans) {
    const exists = listings.listings.some((item) => item.language === plan.language);
    if (!exists && !textOnly) throw Error(`Locale missing: ${plan.language}`);
    before.images[plan.language] = exists ? await api(`${endpoint}/listings/${plan.language}/phoneScreenshots`) : {images: []};
  }
  await mkdir(backup, {recursive: true});
  await writeFile(join(backup, 'before.json'), `${JSON.stringify(before, null, 2)}\n`);
  await writeFile(join(backup, 'plan.json'), `${JSON.stringify(plans, null, 2)}\n`);
  console.log(JSON.stringify({mode: apply ? 'APPLY' : 'DRY RUN', textOnly, defaultLanguage: details.defaultLanguage, plans: plans.map((plan) => {
    const current = listings.listings.find((item) => item.language === plan.language);
    const images = before.images[plan.language].images ?? [];
    return {language: plan.language, title: plan.title, shortDescription: plan.shortDescription, previousPhoneImages: images.length, nextPhoneImages: textOnly ? images.length : plan.files.length,
      currentCopyMatches: current?.title === plan.title && current?.shortDescription === plan.shortDescription && current?.fullDescription === plan.fullDescription,
      currentImageOrderMatches: textOnly ? true : images.length === plan.files.length && images.every((image, index) => image.sha256 === plan.files[index].sha256)};
  }), tracksUnchanged: true}, null, 2));
  const changedPlans = plans.filter(plan => {
    const current = listings.listings.find(item => item.language === plan.language);
    const sameCopy = current?.title === plan.title && current?.shortDescription === plan.shortDescription && current?.fullDescription === plan.fullDescription;
    const images = before.images[plan.language].images ?? [];
    const sameImages = textOnly || (images.length === plan.files.length && images.every((image, index) => image.sha256 === plan.files[index].sha256));
    return !sameCopy || !sameImages;
  });
  if (apply && changedPlans.length) {
    // Keep recoverable originals before replacing this edit's gallery.
    for (const plan of changedPlans) {
      for (const [index, image] of (textOnly ? [] : before.images[plan.language].images ?? []).entries()) {
        const result = await fetch(image.url);
        if (!result.ok) throw Error('Could not back up existing phone screenshot');
        await writeFile(join(backup, `${plan.language}-before-${index + 1}.png`), Buffer.from(await result.arrayBuffer()));
      }
      const prior = listings.listings.find((item) => item.language === plan.language);
      await api(`${endpoint}/listings/${plan.language}`, 'PUT', {...prior, language: plan.language, title: plan.title, shortDescription: plan.shortDescription, fullDescription: plan.fullDescription});
      if (!textOnly) await api(`${endpoint}/listings/${plan.language}/phoneScreenshots`, 'DELETE');
      for (const file of plan.files) {
        const url = `${endpoint}/listings/${plan.language}/phoneScreenshots`.replace('/androidpublisher/v3/', '/upload/androidpublisher/v3/') + '?uploadType=media';
        await api(url, 'POST', await readFile(join(assets, available[plan.language].gallery, file.file)), 'image/png');
      }
      const images = (await api(`${endpoint}/listings/${plan.language}/phoneScreenshots`)).images ?? [];
      if (!textOnly && (images.length !== 8 || images.some((image, index) => image.sha256 !== plan.files[index].sha256))) throw Error('Uploaded image order or digest mismatch');
      if (textOnly && prior && JSON.stringify(images.map(({id, sha256}) => ({id, sha256}))) !== JSON.stringify((before.images[plan.language].images ?? []).map(({id, sha256}) => ({id, sha256})))) throw Error('Existing screenshot order or digest changed');
      const saved = await api(`${endpoint}/listings/${plan.language}`);
      if (saved.title !== plan.title || saved.shortDescription !== plan.shortDescription || saved.fullDescription !== plan.fullDescription) throw Error('Listing readback mismatch');
    }
    if (JSON.stringify(await api(`${endpoint}/tracks`)) !== JSON.stringify(tracks)) throw Error('Track state changed unexpectedly');
    if (JSON.stringify(await api(`${endpoint}/details`)) !== JSON.stringify(details)) throw Error('App details changed unexpectedly');
    const currentListings = await api(`${endpoint}/listings`);
    for (const original of listings.listings.filter((item) => !(item.language in metadata))) {
      if (JSON.stringify(currentListings.listings.find((item) => item.language === original.language)) !== JSON.stringify(original)) throw Error('Unrelated locale changed');
    }
    await api(`${endpoint}:validate`, 'POST');
    const result = await api(`${endpoint}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, 'POST');
    committed = true;
    await writeFile(join(backup, 'committed.json'), `${JSON.stringify({result, appliedAt: Date.now(), panels: manifest.panels}, null, 2)}\n`);
    console.log(`COMMITTED: ${changedPlans.map(plan => plan.language).join('/')} listing text${textOnly ? '; existing screenshots preserved' : ' and eight phone screenshots each'}. No binary or track changes.`);
  } else if (apply) console.log('NO CHANGES: all selected listings already match. No commit sent.');
} finally {
  if (!committed) await api(endpoint, 'DELETE');
}
