import {mkdir, readdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';

import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const STORE_ROOT = join(ROOT, 'store-assets');
const OUTPUT_ROOT = join(STORE_ROOT, 'marketing', '1.0.0');
const MARKETING_SOURCE_ROOT = join(STORE_ROOT, 'marketing', 'sources');
const GENERATED_BACKGROUND = join(
  STORE_ROOT,
  'marketing',
  'backgrounds',
  'bookoo-orbits-v1.png',
);

const LOCALES = {
  'en-US': {
    language: 'English',
    slides: [
      ['Shared money, shared record.', 'For money a group spends together.'],
      ['Every entry, easy to find.', 'A fast timeline that stays organized.'],
      ['See spending at a glance.', 'Clear categories and monthly trends.'],
      [
        'Switch without missing a beat.',
        'Personal and shared ledgers, side by side.',
      ],
      [
        'Nobody keeps the book alone.',
        'Invite members and manage roles safely.',
      ],
      [
        'Categories that feel like yours.',
        'Choose the colors and icons that fit.',
      ],
      ['Add an entry in seconds.', 'Amount, date, place, memo, and photos.'],
      [
        'Comfortable day or night.',
        'Light, dark, and system themes for every screen.',
      ],
    ],
  },
  ko: {
    language: '한국어',
    slides: [
      ['함께 쓰는 돈, 함께 보는 기록', '공동 자금을 각자 기록하세요.'],
      ['내역을 빠르게, 한눈에', '날짜별 기록을 놓치지 않아요.'],
      ['소비 흐름을 한눈에', '카테고리와 월별 추이를 쉽게 확인하세요.'],
      ['가계부 전환도 자연스럽게', '개인 가계부와 공유 가계부를 오가세요.'],
      ['총무 혼자 들지 않아요', '초대와 멤버 권한을 안전하게 관리하세요.'],
      ['나에게 맞는 카테고리', '색과 아이콘으로 쉽게 구분하세요.'],
      ['몇 초면 기록 완료', '금액부터 사진까지 한 화면에서.'],
      ['낮에도 밤에도 편안하게', '라이트·다크·시스템 테마를 지원해요.'],
    ],
  },
  ja: {
    language: '日本語',
    slides: [
      ['みんなのお金を、みんなの記録に。', '共同経費をそれぞれが記録。'],
      ['履歴がすぐ見つかる', '日付ごとにすっきり整理。'],
      ['支出の流れをひと目で', 'カテゴリと月別推移をわかりやすく。'],
      ['家計簿の切り替えも軽快', '個人用と共有用をスムーズに。'],
      ['幹事ひとりが抱えない', '招待とメンバー権限を安全に管理。'],
      ['自分らしいカテゴリ', '色とアイコンでわかりやすく。'],
      ['記録はわずか数秒', '金額、日付、場所、写真まで。'],
      ['昼も夜も快適に', 'ライト、ダーク、システムテーマに対応。'],
    ],
  },
  'zh-Hans': {
    language: '简体中文',
    slides: [
      ['一起花的钱，一起看的记录', '共同开支，各自记录。'],
      ['每笔记录，一目了然', '按日期整理，查找更轻松。'],
      ['轻松看懂收支趋势', '分类统计和月度变化清晰呈现。'],
      ['账本切换更顺畅', '个人账本与共享账本自由切换。'],
      ['不再让一个人扛账本', '安全管理邀请和成员权限。'],
      ['适合你的分类方式', '用颜色和图标轻松区分。'],
      ['几秒完成一笔记录', '金额、日期、地点、备注和照片。'],
      ['日夜使用，都舒适', '支持浅色、深色与跟随系统主题。'],
    ],
  },
  id: {
    language: 'Bahasa Indonesia',
    slides: [
      ['Uang bersama, catatan bersama.', 'Untuk uang kas yang dipakai bersama.'],
      ['Setiap catatan mudah ditemukan.', 'Linimasa cepat dan tetap rapi.'],
      ['Pahami pengeluaran sekilas.', 'Kategori dan tren bulanan yang jelas.'],
      [
        'Beralih buku tanpa hambatan.',
        'Buku pribadi dan bersama dalam satu tempat.',
      ],
      [
        'Bendahara tidak sendirian.',
        'Kelola undangan dan peran dengan aman.',
      ],
      ['Kategori yang terasa milikmu.', 'Bedakan dengan warna dan ikon.'],
      [
        'Catat transaksi dalam hitungan detik.',
        'Jumlah, tanggal, lokasi, catatan, dan foto.',
      ],
      [
        'Nyaman siang maupun malam.',
        'Tema terang, gelap, dan sistem di setiap layar.',
      ],
    ],
  },
  'fr-FR': {
    language: 'Français',
    slides: [
      ['Argent commun, comptes communs.', 'Pour une caisse partagée à plusieurs.'],
      ['Chaque opération, bien rangée.', 'Une chronologie claire et rapide.'],
      ['Comprenez vos dépenses.', 'Catégories et tendances en un regard.'],
      [
        'Passez d’un carnet à l’autre.',
        'Comptes personnels et partagés réunis.',
      ],
      ['Le trésorier n’est plus seul.', 'Invitations et rôles sous contrôle.'],
      [
        'Des catégories à votre image.',
        'Couleurs et icônes faciles à repérer.',
      ],
      [
        'Ajoutez une dépense en un instant.',
        'Montant, date, lieu, note et photos.',
      ],
      [
        'Confortable, de jour comme de nuit.',
        'Thèmes clair, sombre et système sur chaque écran.',
      ],
    ],
  },
  'de-DE': {
    language: 'Deutsch',
    slides: [
      [
        'Gemeinsames Geld, gemeinsame Aufzeichnung.',
        'Für eine Kasse, die mehreren gehört.',
      ],
      ['Jeder Eintrag schnell gefunden.', 'Eine klare, geordnete Zeitleiste.'],
      ['Ausgaben sofort verstehen.', 'Kategorien und Trends auf einen Blick.'],
      [
        'Nahtlos zwischen Büchern wechseln.',
        'Privat und gemeinsam, direkt beieinander.',
      ],
      [
        'Niemand führt die Kasse allein.',
        'Einladungen und Rollen sicher verwalten.',
      ],
      [
        'Kategorien, die zu dir passen.',
        'Farben und Symbole schaffen Überblick.',
      ],
      ['Eintrag in wenigen Sekunden.', 'Betrag, Datum, Ort, Notiz und Fotos.'],
      [
        'Angenehm bei Tag und Nacht.',
        'Helles, dunkles und System-Design auf jedem Bildschirm.',
      ],
    ],
  },
  'es-ES': {
    language: 'Español',
    slides: [
      ['Dinero común, cuentas comunes.', 'Para un bote que es de varios.'],
      ['Cada movimiento, a mano.', 'Una cronología rápida y ordenada.'],
      [
        'Entiende tus gastos al instante.',
        'Categorías y tendencias de un vistazo.',
      ],
      [
        'Cambia de libro sin perder el ritmo.',
        'Cuentas personales y compartidas.',
      ],
      ['Nadie carga con el libro solo.', 'Invitaciones y permisos bajo control.'],
      ['Categorías hechas para ti.', 'Colores e iconos fáciles de reconocer.'],
      [
        'Añade un movimiento en segundos.',
        'Importe, fecha, lugar, nota y fotos.',
      ],
      [
        'Cómodo de día y de noche.',
        'Temas claro, oscuro y del sistema en cada pantalla.',
      ],
    ],
  },
  'it-IT': {
    language: 'Italiano',
    slides: [
      ['Soldi condivisi, conti condivisi.', 'Per una cassa che è di più persone.'],
      [
        'Ogni movimento, facile da trovare.',
        'Una cronologia veloce e sempre ordinata.',
      ],
      ['Le spese a colpo d’occhio.', 'Categorie chiare e andamento mensile.'],
      [
        'Passa da un registro all’altro.',
        'Registri personali e condivisi, fianco a fianco.',
      ],
      ['Nessuno tiene la cassa da solo.', 'Inviti e ruoli gestiti in sicurezza.'],
      ['Categorie davvero tue.', 'Scegli colori e icone più adatti a te.'],
      ['Aggiungi in pochi secondi.', 'Importo, data, luogo, nota e foto.'],
      [
        'Comodo di giorno e di notte.',
        'Temi chiaro, scuro e di sistema in ogni schermata.',
      ],
    ],
  },
};

const SCENES = [
  {
    slug: 'calendar',
    iphone: '01-calendar.png',
    ipad: '01-calendar.png',
    android: '001-calendar.png',
  },
  {
    slug: 'timeline',
    iphone: '02-timeline.png',
    ipad: '02-timeline-detail.png',
    android: '002-timeline.png',
    overrides: {android: '02-timeline-realistic.png'},
  },
  {
    slug: 'statistics',
    iphone: '03-stats.png',
    ipad: '03-stats.png',
    android: '003-stats.png',
    overrides: {
      iphone: '03-statistics-expense.png',
      android: '03-statistics-balanced.png',
    },
  },
  {
    slug: 'ledgers',
    iphone: '04-ledger-switcher.png',
    ipad: '04-ledger-switcher.png',
    android: '008-ledgers.png',
    overrides: {
      iphone: '04-ledgers-three.png',
      ipad: '04-ledgers-three.png',
      android: '04-ledgers-three.png',
    },
    ipadDeviceWidth: 1100,
    ipadDeviceX: 1480,
  },
  {
    slug: 'members',
    iphone: '05-members.png',
    ipad: '05-members.png',
    android: '022-ledger-members.png',
  },
  {
    slug: 'categories',
    iphone: '06-category-picker.png',
    ipad: '06-category-picker.png',
    android: '073-entry-category-picker.png',
  },
  {
    slug: 'new-entry',
    iphone: '07-new-entry.png',
    ipad: '07-new-entry.png',
    android: '032-ledger-item-new.png',
  },
  {
    slug: 'more',
    iphone: '08-more.png',
    ipad: '08-more.png',
    android: '004-more.png',
    overrides: {
      iphone: '08-dark-theme.png',
      ipad: '08-dark-theme.png',
      android: '08-dark-theme.png',
    },
    ipadDeviceWidth: 1050,
    ipadDeviceX: 1500,
  },
];

const SOURCE = {
  iphone: join(STORE_ROOT, '1.0.0', 'en', 'iphone-6.9'),
  ipad: join(STORE_ROOT, '1.0.0', 'en', 'ipad-13'),
  android: join(
    ROOT,
    'docs',
    'debugs',
    'e2e',
    '2026-08-31-final',
    'android-emulator',
    'routes-final-verified',
  ),
};

const sourcePathFor = (platform, index) => {
  const scene = SCENES[index];
  const override = scene.overrides?.[platform];
  return override
    ? join(MARKETING_SOURCE_ROOT, platform, override)
    : join(SOURCE[platform], scene[platform]);
};

const palettes = [
  {
    background: '#24324B',
    foreground: '#FFFFFF',
    muted: '#C9D6E8',
    accent: '#20D6B2',
    generated: true,
  },
  {
    background: '#20D6B2',
    foreground: '#10233C',
    muted: '#1C5260',
    accent: '#FFFFFF',
  },
  {
    background: '#F5F8FC',
    foreground: '#24324B',
    muted: '#5F6F89',
    accent: '#20D6B2',
  },
  {
    background: '#24324B',
    foreground: '#FFFFFF',
    muted: '#C9D6E8',
    accent: '#FF7B8B',
  },
  {
    background: '#FFF5F4',
    foreground: '#24324B',
    muted: '#6D7383',
    accent: '#FF6B7D',
  },
  {
    background: '#16263F',
    foreground: '#FFFFFF',
    muted: '#C7D4E6',
    accent: '#20D6B2',
    generated: true,
  },
  {
    background: '#DDF9F3',
    foreground: '#24324B',
    muted: '#53647B',
    accent: '#20D6B2',
  },
  {
    background: '#283754',
    foreground: '#FFFFFF',
    muted: '#CFD8E8',
    accent: '#20D6B2',
  },
];

const escapeXml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const splitLine = (text, locale, max, maxLines = 2) => {
  if ([...text].length <= max) return [text];
  if (locale === 'ko' || locale === 'ja' || locale === 'zh-Hans') {
    const chars = [...text];
    const breakAt = Math.ceil(chars.length / 2);
    let index = breakAt;
    for (let offset = 0; offset < 7; offset += 1) {
      const right = breakAt + offset;
      const left = breakAt - offset;
      if (
        chars[right] === ' ' ||
        chars[right] === '、' ||
        chars[right] === '，'
      ) {
        index = right;
        break;
      }
      if (chars[left] === ' ' || chars[left] === '、' || chars[left] === '，') {
        index = left;
        break;
      }
    }
    return [
      chars.slice(0, index).join('').trim(),
      chars.slice(index).join('').trim(),
    ];
  }
  const words = text.split(' ');
  const lines = [''];
  for (const word of words) {
    const current = lines.at(-1);
    if (
      `${current} ${word}`.trim().length <= max ||
      lines.length === maxLines
    ) {
      lines[lines.length - 1] = `${current} ${word}`.trim();
    } else {
      lines.push(word);
    }
  }
  return lines;
};

const textSvg = ({width, height, locale, copy, palette, layout}) => {
  const isTablet = layout === 'ipad';
  const isCompactPhone = !isTablet && width < 1200;
  const titleLines = splitLine(
    copy[0],
    locale,
    isTablet ? 16 : isCompactPhone ? 22 : 30,
    isTablet ? 3 : 2,
  );
  const subtitleLines = splitLine(copy[1], locale, isTablet ? 40 : 46);
  const fontFamily =
    locale === 'ko'
      ? 'Apple SD Gothic Neo, Arial Unicode MS, sans-serif'
      : locale === 'ja'
        ? 'Hiragino Sans, Arial Unicode MS, sans-serif'
        : locale === 'zh-Hans'
          ? 'Hiragino Sans GB, Arial Unicode MS, sans-serif'
          : 'Avenir Next, Helvetica Neue, Arial, sans-serif';
  const x = isTablet ? 180 : width / 2;
  const anchor = isTablet ? 'start' : 'middle';
  const titleY = isTablet ? 410 : 310;
  const titleSize = isTablet ? 80 : isCompactPhone ? 68 : 82;
  const subtitleSize = isTablet ? 39 : 37;
  const titleGap = isTablet ? 96 : isCompactPhone ? 88 : 104;
  const subtitleY =
    titleY + titleLines.length * titleGap + (isTablet ? 32 : 38);

  const lines = (items, y, gap, attrs) =>
    items
      .map(
        (line, index) =>
          `<text x="${x}" y="${y + index * gap}" ${attrs}>${escapeXml(line)}</text>`,
      )
      .join('');

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        text { font-family: ${fontFamily}; }
      </style>
      <text x="${x}" y="${isTablet ? 190 : 132}" text-anchor="${anchor}" font-size="${isTablet ? 34 : 30}" font-weight="700" letter-spacing="2" fill="${palette.accent}">BooKoo</text>
      ${lines(titleLines, titleY, titleGap, `text-anchor="${anchor}" font-size="${titleSize}" font-weight="750" letter-spacing="-2" fill="${palette.foreground}"`)}
      ${lines(subtitleLines, subtitleY, isTablet ? 60 : 56, `text-anchor="${anchor}" font-size="${subtitleSize}" font-weight="500" fill="${palette.muted}"`)}
      <rect x="${isTablet ? 180 : width / 2 - 44}" y="${isTablet ? 840 : 660}" width="88" height="9" rx="4.5" fill="${palette.accent}"/>
    </svg>
  `);
};

const baseCanvas = async (width, height, palette) => {
  if (!palette.generated) {
    const svg = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="glow" cx="88%" cy="15%" r="74%">
            <stop offset="0" stop-color="${palette.accent}" stop-opacity=".20"/>
            <stop offset=".42" stop-color="${palette.background}" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="${palette.background}"/>
        <rect width="100%" height="100%" fill="url(#glow)"/>
        <circle cx="${width - 90}" cy="${height * 0.37}" r="180" fill="none" stroke="${palette.accent}" stroke-width="3" opacity=".16"/>
        <circle cx="${width - 90}" cy="${height * 0.37}" r="12" fill="${palette.accent}" opacity=".9"/>
        <circle cx="86" cy="${height - 380}" r="280" fill="${palette.accent}" opacity=".06"/>
      </svg>
    `);
    return sharp(svg).png().toBuffer();
  }

  return sharp(GENERATED_BACKGROUND)
    .resize(width, height, {fit: 'cover'})
    .modulate({brightness: 0.96, saturation: 0.92})
    .png()
    .toBuffer();
};

const roundedScreenshot = async (path, width, radius) => {
  const resized = await sharp(path).resize({width}).png().toBuffer();
  const {height} = await sharp(resized).metadata();
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="${radius}" fill="white"/></svg>`,
  );
  return {
    buffer: await sharp(resized)
      .composite([{input: mask, blend: 'dest-in'}])
      .png()
      .toBuffer(),
    height,
  };
};

const deviceLayers = async ({path, width, x, y, radius = 72}) => {
  const screen = await roundedScreenshot(path, width, radius);
  const frame = 24;
  const frameWidth = width + frame * 2;
  const frameHeight = screen.height + frame * 2;
  const shadow = Buffer.from(`
    <svg width="${frameWidth + 160}" height="${frameHeight + 160}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="34"/></filter></defs>
      <rect x="80" y="70" width="${frameWidth}" height="${frameHeight}" rx="${radius + frame}" fill="#08162D" opacity=".30" filter="url(#b)"/>
    </svg>
  `);
  const shell = Buffer.from(
    `<svg width="${frameWidth}" height="${frameHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="${radius + frame}" fill="#F9FBFD"/><rect x="${frame}" y="${frame}" width="${width}" height="${screen.height}" rx="${radius}" fill="#FFFFFF"/></svg>`,
  );
  return [
    {input: shadow, left: x - frame - 80, top: y - frame - 70},
    {input: shell, left: x - frame, top: y - frame},
    {input: screen.buffer, left: x, top: y},
  ];
};

const renderPhone = async ({locale, index, platform}) => {
  const isApple = platform === 'iphone';
  const width = isApple ? 1320 : 1080;
  const height = isApple ? 2868 : 1920;
  const palette = palettes[index];
  const outputDir = join(
    OUTPUT_ROOT,
    locale,
    isApple ? 'apple-iphone-6.9' : 'google-play-phone',
  );
  await mkdir(outputDir, {recursive: true});
  const sourcePath = sourcePathFor(platform, index);
  const deviceWidth = isApple ? 930 : 720;
  const deviceX = Math.round((width - deviceWidth) / 2);
  const deviceY = isApple ? 810 : 610;
  const background = await baseCanvas(width, height, palette);
  const text = textSvg({
    width,
    height,
    locale,
    copy: LOCALES[locale].slides[index],
    palette,
    layout: 'phone',
  });
  const device = await deviceLayers({
    path: sourcePath,
    width: deviceWidth,
    x: deviceX,
    y: deviceY,
    radius: isApple ? 84 : 52,
  });
  const output = join(
    outputDir,
    `${String(index + 1).padStart(2, '0')}-${SCENES[index].slug}.png`,
  );
  await sharp(background)
    .composite([{input: text, left: 0, top: 0}, ...device])
    .flatten({background: palette.background})
    .removeAlpha()
    .png({compressionLevel: 9})
    .toFile(output);
  return output;
};

const renderIphone65 = async ({locale, index, source}) => {
  const outputDir = join(OUTPUT_ROOT, locale, 'apple-iphone-6.5');
  await mkdir(outputDir, {recursive: true});
  const output = join(
    outputDir,
    `${String(index + 1).padStart(2, '0')}-${SCENES[index].slug}.png`,
  );
  await sharp(source)
    .resize(1284, 2778, {fit: 'fill'})
    .flatten({background: palettes[index].background})
    .removeAlpha()
    .png({compressionLevel: 9})
    .toFile(output);
  return output;
};

const renderIpad = async ({locale, index}) => {
  const width = 2752;
  const height = 2064;
  const palette = palettes[index];
  const outputDir = join(OUTPUT_ROOT, locale, 'apple-ipad-13');
  await mkdir(outputDir, {recursive: true});
  const sourcePath = sourcePathFor('ipad', index);
  const background = await baseCanvas(width, height, palette);
  const text = textSvg({
    width,
    height,
    locale,
    copy: LOCALES[locale].slides[index],
    palette,
    layout: 'ipad',
  });
  const device = await deviceLayers({
    path: sourcePath,
    width: SCENES[index].ipadDeviceWidth ?? 1470,
    x: SCENES[index].ipadDeviceX ?? 1120,
    y: 300,
    radius: 72,
  });
  const output = join(
    outputDir,
    `${String(index + 1).padStart(2, '0')}-${SCENES[index].slug}.png`,
  );
  await sharp(background)
    .composite([{input: text, left: 0, top: 0}, ...device])
    .flatten({background: palette.background})
    .removeAlpha()
    .png({compressionLevel: 9})
    .toFile(output);
  return output;
};

const renderPlayGraphic = async (locale) => {
  const outputDir = join(OUTPUT_ROOT, locale, 'google-play');
  await mkdir(outputDir, {recursive: true});
  const background = await baseCanvas(1024, 500, palettes[0]);
  const icon = await sharp(join(ROOT, 'assets', 'icon.png'))
    .resize(190, 190)
    .png()
    .toBuffer();
  const iconMask = Buffer.from(
    '<svg width="190" height="190" xmlns="http://www.w3.org/2000/svg"><rect width="190" height="190" rx="44" fill="white"/></svg>',
  );
  const roundedIcon = await sharp(icon)
    .composite([{input: iconMask, blend: 'dest-in'}])
    .png()
    .toBuffer();
  const [title, subtitle] = LOCALES[locale].slides[0];
  const titleLines = splitLine(title, locale, 25, 2);
  const fontFamily =
    locale === 'ko'
      ? 'Apple SD Gothic Neo, Arial Unicode MS, sans-serif'
      : locale === 'ja'
        ? 'Hiragino Sans, Arial Unicode MS, sans-serif'
        : locale === 'zh-Hans'
          ? 'Hiragino Sans GB, Arial Unicode MS, sans-serif'
          : 'Avenir Next, Helvetica Neue, Arial, sans-serif';
  const titleMarkup = titleLines
    .map(
      (line, index) =>
        `<text x="360" y="${206 + index * 58}" fill="#FFFFFF" font-family="${fontFamily}" font-size="46" font-weight="750">${escapeXml(line)}</text>`,
    )
    .join('');
  const copy = Buffer.from(`
    <svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
      <text x="360" y="104" fill="#20D6B2" font-family="${fontFamily}" font-size="28" font-weight="750" letter-spacing="2">BooKoo</text>
      ${titleMarkup}
      <text x="360" y="${252 + titleLines.length * 58}" fill="#C9D6E8" font-family="${fontFamily}" font-size="24" font-weight="500">${escapeXml(subtitle)}</text>
    </svg>
  `);
  const exact = join(outputDir, 'feature-graphic-1024x500.png');
  await sharp(background)
    .composite([
      {input: roundedIcon, left: 104, top: 155},
      {input: copy, left: 0, top: 0},
    ])
    .flatten({background: '#24324B'})
    .removeAlpha()
    .png({compressionLevel: 9})
    .toFile(exact);
  const upload = join(outputDir, 'feature-graphic-upload-2048x1000.png');
  await sharp(exact)
    .resize(2048, 1000)
    .removeAlpha()
    .png({compressionLevel: 9})
    .toFile(upload);
  const iconOutput = join(outputDir, 'icon-512.png');
  await sharp(join(ROOT, 'assets', 'icon.png'))
    .resize(512, 512)
    .removeAlpha()
    .png({compressionLevel: 9})
    .toFile(iconOutput);
  return [exact, upload, iconOutput];
};

const contactSheet = async (directory, outputName) => {
  const files = (await readdir(directory))
    .filter((name) => /^\d{2}-.*\.png$/.test(name))
    .sort();
  const thumbWidth = 330;
  const thumbHeight = 717;
  const columns = 4;
  const rows = Math.ceil(files.length / columns);
  const canvas = sharp({
    create: {
      width: thumbWidth * columns,
      height: thumbHeight * rows,
      channels: 3,
      background: '#E9EEF6',
    },
  });
  const composites = [];
  for (const [index, file] of files.entries()) {
    const thumbnail = await sharp(join(directory, file))
      .resize(thumbWidth - 18, thumbHeight - 18, {
        fit: 'contain',
        background: '#E9EEF6',
      })
      .png()
      .toBuffer();
    composites.push({
      input: thumbnail,
      left: (index % columns) * thumbWidth + 9,
      top: Math.floor(index / columns) * thumbHeight + 9,
    });
  }
  const output = join(dirname(directory), outputName);
  await canvas.composite(composites).png({compressionLevel: 9}).toFile(output);
  return output;
};

const outputs = [];
for (const locale of Object.keys(LOCALES)) {
  for (let index = 0; index < SCENES.length; index += 1) {
    const iphone69 = await renderPhone({locale, index, platform: 'iphone'});
    outputs.push(iphone69);
    outputs.push(await renderIphone65({locale, index, source: iphone69}));
    outputs.push(await renderIpad({locale, index}));
    outputs.push(await renderPhone({locale, index, platform: 'android'}));
  }
  outputs.push(
    await contactSheet(
      join(OUTPUT_ROOT, locale, 'apple-iphone-6.9'),
      'apple-iphone-contact-sheet.png',
    ),
  );
  outputs.push(
    await contactSheet(
      join(OUTPUT_ROOT, locale, 'google-play-phone'),
      'google-play-contact-sheet.png',
    ),
  );
  outputs.push(...(await renderPlayGraphic(locale)));
}

const manifest = {
  generatedAt: new Date().toISOString(),
  defaultLocale: 'en-US',
  locales: Object.entries(LOCALES).map(([locale, value]) => ({
    locale,
    language: value.language,
  })),
  sourcePolicy:
    'real BooKoo simulator screenshots with deterministic localized marketing copy',
  imageGeneration: {
    mode: 'generated abstract background only; no generated UI or text',
    asset: 'store-assets/marketing/backgrounds/bookoo-orbits-v1.png',
  },
  outputs: outputs.map((path) => path.slice(ROOT.length + 1)),
};
await writeFile(
  join(OUTPUT_ROOT, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

process.stdout.write(
  `marketing screenshots: ${Object.keys(LOCALES).length} locales, ${SCENES.length} scenes, iPhone + iPad + Android\n`,
);
