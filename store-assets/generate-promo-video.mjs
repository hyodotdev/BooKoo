import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

import sharp from 'sharp';

// The Play promo videos, one per listing language. Silent by design: Play
// autoplays muted, so captions carry it, and no music is worth a licence
// question on a store listing.
//
// Play holds a separate trailer per store listing language, so a Korean-only
// video leaves every other listing without one. Run with a locale argument:
//   node store-assets/generate-promo-video.mjs ko-KR
//   node store-assets/generate-promo-video.mjs en-US
//
// Every shot is real app footage against the Korean KRW marketing fixture — the
// same fixture the screenshots use. Screens that animate come from `screenrecord`
// under `video-sources/`; screens that do not (구성원, 댓글, 테마) reuse the
// screenshot sources, because `screenrecord` emits almost no frames for a static
// surface.
//
// Sources are cropped, never retouched — same rule as the panels. `SOURCE_CROP`
// removes the phone's status bar at the display cutout inset and stops above the
// AdMob test banner.
const root = resolve(import.meta.dirname, '..');
const dir = join(root, 'store-assets/marketing/2026-09-13');
const SCREEN = {width: 482, height: 900, left: 194, top: 90};
const FRAME = {x: 180, y: 76, width: 510, height: 928, radius: 44};

/**
 * en-US was re-shot on 2026-09-20 against an English "Climbing Club" fixture —
 * two members, September dues and spending, and one entry carrying a comment
 * thread — so it now shows the same eight scenes as ko, including the comment
 * thread the English listing had never had. It is stills only: there are still
 * no English screen recordings, so nothing animates.
 */
const LOCALES = {
  'ko-KR': {
    crop: {top: 173, bottom: 234},
    font: 'Apple SD Gothic Neo, AppleGothic, sans-serif',
    brand: 'BooKoo 부쿠',
    cta: 'Google Play에서 BooKoo 부쿠 검색',
    shots: [
  {kind: 'still', src: 'sources/ko-KR-sharing.png',        seconds: 4, head: '함께 쓰는 돈, 함께 보는 기록', sub: '초대 링크로 합류해 각자 기록해요'},
  {kind: 'clip',  src: 'video-sources/ko-KR-entry.mp4',    seconds: 4, start: 7.0, head: '10초면 기록 끝', sub: '금액·카테고리·메모를 한 화면에서'},
  {kind: 'clip',  src: 'video-sources/ko-KR-timeline.mp4', seconds: 4, start: 1.8, head: '무엇에 얼마가 나갔는지', sub: '날짜별로 차곡차곡 정리돼요'},
  {kind: 'still', src: 'sources/ko-KR-comments.png',       seconds: 5, head: '기록마다 대화가 남아요', sub: '궁금한 지출은 그 자리에서 물어보세요'},
  {kind: 'clip',  src: 'video-sources/ko-KR-calendar.mp4', seconds: 4, start: 1.0, head: '날짜별로 깔끔하게', sub: '달력에서 하루 합계까지 확인'},
  {kind: 'clip',  src: 'video-sources/ko-KR-stats.mp4',    seconds: 4, start: 1.2, head: '이번 달 지출 한눈에', sub: '카테고리별 비중을 바로 파악'},
  {kind: 'still', src: 'sources/ko-KR-theme.png',          seconds: 4, head: '우리 방식대로', sub: '라이트·다크 테마를 선택하세요'},
  {kind: 'end',   seconds: 4, head: '함께 쓰는 돈, 함께 보는 기록', sub: '무료 공유 가계부 · 초대 링크 하나로 시작하세요'},
    ],
  },
  'en-US': {
    crop: {top: 0, bottom: 234},
    font: 'Helvetica Neue, Helvetica, Arial, sans-serif',
    brand: 'BooKoo',
    cta: 'Search BooKoo on Google Play',
    shots: [
      {kind: 'still', src: 'sources/en-US-sharing.png',    seconds: 4, head: 'Shared money, shared record', sub: 'One invite link and everyone logs their own'},
      {kind: 'still', src: 'sources/en-US-entry.png',      seconds: 4, head: 'Add an entry in seconds', sub: 'Amount, category, date, memo and receipt'},
      {kind: 'still', src: 'sources/en-US-timeline.png',   seconds: 4, head: 'Every entry, in order', sub: 'Income and expenses grouped by date'},
      {kind: 'still', src: 'sources/en-US-comments.png',   seconds: 5, head: 'A conversation on every entry', sub: 'Ask about a charge right where it sits'},
      {kind: 'still', src: 'sources/en-US-calendar.png',   seconds: 4, head: 'Daily totals at a glance', sub: 'A calendar in the ledger\u2019s own time zone'},
      {kind: 'still', src: 'sources/en-US-stats.png',      seconds: 4, head: 'See where the money went', sub: 'Spending by category, month by month'},
      {kind: 'still', src: 'sources/en-US-theme.png',      seconds: 4, head: 'Comfortable day or night', sub: 'Light, dark or your system theme'},
      {kind: 'end',   seconds: 4, head: 'Shared money, shared record', sub: 'Free shared ledger · start with one invite link'},
    ],
  },
  ja: {
    crop: {top: 0, bottom: 234},
    font: 'Hiragino Sans, Hiragino Kaku Gothic ProN, sans-serif',
    brand: 'BooKoo',
    cta: 'Google Play で BooKoo を検索',
    shots: [
      {kind: 'still', src: 'sources/ja-sharing.png',        seconds: 4, head: 'みんなのお金を、みんなの記録に', sub: '招待リンクひとつで、それぞれが記録'},
      {kind: 'still', src: 'sources/ja-entry.png',          seconds: 4, head: '記録は数秒で', sub: '金額もメモも領収書も一か所に'},
      {kind: 'still', src: 'sources/ja-timeline.png',       seconds: 4, head: '何にいくら使ったか', sub: '日付ごとに整理されます'},
      {kind: 'still', src: 'sources/ja-comments.png',       seconds: 5, head: '記録ごとに会話が残ります', sub: '気になる支出はその場で聞けます'},
      {kind: 'still', src: 'sources/ja-calendar.png',       seconds: 4, head: '共同のお金の流れをひと目で', sub: '日別の合計をカレンダーで確認'},
      {kind: 'still', src: 'sources/ja-stats.png',          seconds: 4, head: 'どこに使ったかひと目で', sub: 'カテゴリ別の割合を確認'},
      {kind: 'still', src: 'sources/ja-theme.png',          seconds: 4, head: '昼も夜も心地よく', sub: 'ライトとダークを選べます'},
      {kind: 'end',   seconds: 4, head: 'みんなのお金を、みんなの記録に', sub: '無料の共有家計簿 · 招待リンクひとつで'},
    ],
  },
  'zh-CN': {
    crop: {top: 0, bottom: 234},
    font: 'PingFang SC, Heiti SC, sans-serif',
    brand: 'BooKoo',
    cta: '在 Google Play 搜索 BooKoo',
    shots: [
      {kind: 'still', src: 'sources/zh-CN-sharing.png',        seconds: 4, head: '一起花的钱，一起看的记录', sub: '一条邀请链接，各自记账'},
      {kind: 'still', src: 'sources/zh-CN-entry.png',          seconds: 4, head: '几秒记一笔', sub: '金额、备注、票据都在一处'},
      {kind: 'still', src: 'sources/zh-CN-timeline.png',       seconds: 4, head: '什么花了多少', sub: '按日期整理得清清楚楚'},
      {kind: 'still', src: 'sources/zh-CN-comments.png',       seconds: 5, head: '每笔记录都留下对话', sub: '想问的支出当场就能问'},
      {kind: 'still', src: 'sources/zh-CN-calendar.png',       seconds: 4, head: '共同开支一目了然', sub: '在日历上查看每日合计'},
      {kind: 'still', src: 'sources/zh-CN-stats.png',          seconds: 4, head: '钱花在哪里一目了然', sub: '查看各分类的占比'},
      {kind: 'still', src: 'sources/zh-CN-theme.png',          seconds: 4, head: '白天黑夜都舒适', sub: '可选浅色与深色主题'},
      {kind: 'end',   seconds: 4, head: '一起花的钱，一起看的记录', sub: '免费共享账本 · 一条邀请链接开始'},
    ],
  },
  id: {
    crop: {top: 0, bottom: 234},
    font: 'Helvetica Neue, Helvetica, Arial, sans-serif',
    brand: 'BooKoo',
    cta: 'Cari BooKoo di Google Play',
    shots: [
      {kind: 'still', src: 'sources/id-sharing.png',        seconds: 4, head: 'Uang bersama, catatan bersama', sub: 'Satu tautan undangan, semua mencatat sendiri'},
      {kind: 'still', src: 'sources/id-entry.png',          seconds: 4, head: 'Catat dalam hitungan detik', sub: 'Nominal, memo, dan struk di satu tempat'},
      {kind: 'still', src: 'sources/id-timeline.png',       seconds: 4, head: 'Apa saja dan berapa', sub: 'Tersusun rapi per tanggal'},
      {kind: 'still', src: 'sources/id-comments.png',       seconds: 5, head: 'Percakapan di tiap catatan', sub: 'Tanya langsung di catatannya'},
      {kind: 'still', src: 'sources/id-calendar.png',       seconds: 4, head: 'Alur uang bersama sekilas', sub: 'Lihat total harian di kalender'},
      {kind: 'still', src: 'sources/id-stats.png',          seconds: 4, head: 'Ke mana uangnya pergi', sub: 'Lihat porsi tiap kategori'},
      {kind: 'still', src: 'sources/id-theme.png',          seconds: 4, head: 'Nyaman siang maupun malam', sub: 'Pilih tema terang atau gelap'},
      {kind: 'end',   seconds: 4, head: 'Uang bersama, catatan bersama', sub: 'Catatan bersama gratis · mulai dengan satu tautan'},
    ],
  },
};

const locale = process.argv[2] ?? 'ko-KR';
const config = LOCALES[locale];
if (config === undefined)
  throw new Error(`Unknown locale ${locale}; expected one of ${Object.keys(LOCALES).join(', ')}`);
const output = join(dir, `bookoo-promo-${locale}-1080p.mp4`);
const SOURCE_CROP = config.crop;
const FONT = config.font;
const SHOTS = config.shots;

const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

const backdrop = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0B1733"/><stop offset="1" stop-color="#24395F"/>
    </linearGradient>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#20D8B0" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#20D8B0" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <circle cx="1720" cy="130" r="430" fill="url(#acc)"/>
  <circle cx="120" cy="1010" r="300" fill="#20D8B0" opacity="0.09"/>
  <circle cx="840" cy="150" r="8" fill="#20D8B0" opacity="0.7"/>
  <circle cx="1640" cy="900" r="11" fill="#20D8B0" opacity="0.5"/>`;

// A caption that runs past the frame is invisible in everything a build looks
// at: the file name, the duration, the byte count and the resolution are all
// correct, and only watching the video shows the cut. The Indonesian and
// Japanese trailers shipped to Google Play that way — "Setiap catatan
// menyimpan percakapan" lost its last nine characters off the right edge.
// So measure the rendered ink and size the type to the space that exists.
//
// Shot plate text is left-anchored at x=790 on a 1920 canvas, so 1130px
// remain; 1110 keeps the ~20px gutter the widest shipped English caption
// already had. The end card is centred at x=960, so 1760 leaves 80px gutters.
const SHOT_TEXT_WIDTH = 1110;
const END_TEXT_WIDTH = 1760;

const inkWidth = async (text, size, weight, letterSpacing) => {
  const svg = `<svg width="6000" height="400" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="280" font-family="${FONT}" font-size="${size}" font-weight="${weight}" letter-spacing="${letterSpacing}">${xml(text)}</text>
  </svg>`;
  const {info} = await sharp(Buffer.from(svg))
    .png()
    .trim({threshold: 1})
    .toBuffer({resolveWithObject: true});
  return info.width;
};

// Step the type down until the ink fits, and refuse outright rather than emit a
// clipped frame. Shrinking beyond 60% would no longer look like the same deck,
// so that is a copy problem and the error says so.
const fitSize = async (text, startSize, weight, budget, letterSpacing = 0) => {
  const floor = Math.round(startSize * 0.6);
  for (let size = startSize; size >= floor; size -= 2)
    if ((await inkWidth(text, size, weight, letterSpacing)) <= budget) return size;
  throw new Error(
    `${locale}: "${text}" still exceeds ${budget}px at ${floor}px; shorten the copy`,
  );
};

const shotPlate = async (head, sub) => {
  const headSize = await fitSize(head, 78, 700, SHOT_TEXT_WIDTH);
  const subSize = await fitSize(sub, 38, 400, SHOT_TEXT_WIDTH);
  return Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
  ${backdrop}
  <rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.width}" height="${FRAME.height}" rx="${FRAME.radius}" fill="#FFFFFF"/>
  <rect x="388" y="96" width="94" height="9" rx="4.5" fill="#E2E6EC"/>
  <g font-family="${FONT}">
    <text x="790" y="392" fill="#20D8B0" font-size="34" font-weight="600" letter-spacing="3">${xml(config.brand)}</text>
    <text x="790" y="508" fill="#FFFFFF" font-size="${headSize}" font-weight="700">${xml(head)}</text>
    <text x="790" y="584" fill="#C7D3E7" font-size="${subSize}">${xml(sub)}</text>
  </g>
</svg>`);
};

const endPlate = async (head, sub) => {
  const headSize = await fitSize(head, 86, 700, END_TEXT_WIDTH);
  const subSize = await fitSize(sub, 40, 400, END_TEXT_WIDTH);
  const ctaSize = await fitSize(config.cta, 38, 600, END_TEXT_WIDTH, 2);
  return Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
  ${backdrop}
  <g font-family="${FONT}" text-anchor="middle">
    <text x="960" y="648" fill="#FFFFFF" font-size="${headSize}" font-weight="700">${xml(head)}</text>
    <text x="960" y="736" fill="#C7D3E7" font-size="${subSize}">${xml(sub)}</text>
    <text x="960" y="862" fill="#20D8B0" font-size="${ctaSize}" font-weight="600" letter-spacing="2">${xml(config.cta)}</text>
  </g>
</svg>`);
};

const ffmpeg = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], {stdio: 'inherit'});

const work = mkdtempSync(join(tmpdir(), 'bookoo-promo-'));
try {
  const crop = `crop=1080:${2424 - SOURCE_CROP.top - SOURCE_CROP.bottom}:0:${SOURCE_CROP.top},scale=${SCREEN.width}:${SCREEN.height}`;
  const segments = [];

  for (const [index, shot] of SHOTS.entries()) {
    const id = String(index + 1).padStart(2, '0');
    const plate = join(work, `plate-${id}.png`);
    const segment = join(work, `seg-${id}.mp4`);
    const fadeOut = (shot.seconds - 0.35).toFixed(2);

    if (shot.kind === 'end') {
      const icon = await sharp(join(root, 'assets/icon.png'))
        .resize(200, 200)
        .composite([
          {
            blend: 'dest-in',
            input: Buffer.from('<svg width="200" height="200"><rect width="200" height="200" rx="46" fill="white"/></svg>'),
          },
        ])
        .png()
        .toBuffer();
      const base = await sharp(await endPlate(shot.head, shot.sub)).png().toBuffer();
      await sharp(base).composite([{input: icon, left: 860, top: 300}]).png().toFile(plate);
      ffmpeg(['-loop', '1', '-t', String(shot.seconds), '-i', plate,
        '-filter_complex', `[0:v]fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOut}:d=0.35,format=yuv420p`,
        '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', segment]);
      segments.push(segment);
      continue;
    }

    await sharp(await shotPlate(shot.head, shot.sub)).png().toFile(plate);
    const source = join(dir, shot.src);
    const overlay = `overlay=${SCREEN.left}:${SCREEN.top}`;
    const fades = `fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOut}:d=0.35,format=yuv420p`;

    if (shot.kind === 'still') {
      ffmpeg(['-loop', '1', '-t', String(shot.seconds), '-i', plate,
        '-loop', '1', '-t', String(shot.seconds), '-i', source,
        '-filter_complex', `[1:v]${crop}[s];[0:v][s]${overlay},${fades}`,
        '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', segment]);
    } else {
      // tpad clones the last frame so a clip a touch shorter than the hold does
      // not end on a black flash.
      ffmpeg(['-loop', '1', '-t', String(shot.seconds), '-i', plate,
        '-ss', String(shot.start), '-t', String(shot.seconds), '-i', source,
        '-filter_complex', `[1:v]${crop},fps=30,tpad=stop_mode=clone:stop_duration=0.5[s];[0:v][s]${overlay}:shortest=0,${fades}`,
        '-r', '30', '-t', String(shot.seconds), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', segment]);
    }
    segments.push(segment);
  }

  const list = join(work, 'segments.txt');
  execFileSync('bash', ['-c', `printf "file '%s'\\n" ${segments.map((s) => `'${s}'`).join(' ')} > '${list}'`]);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', output]);

  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output])
    .toString()
    .trim();
  const seconds = Number(probe);
  const expected = SHOTS.reduce((total, shot) => total + shot.seconds, 0);
  if (!Number.isFinite(seconds) || Math.abs(seconds - expected) > 1.5)
    throw new Error(`Promo video is ${probe}s; expected about ${expected}s`);
  console.log(`Promo video ${locale}: 1920x1080, ${seconds.toFixed(1)}s, ${SHOTS.length} shots, silent.`);
} finally {
  rmSync(work, {recursive: true, force: true});
}
