/** Local synthetic gallery fixtures. Dry run by default; never accepts cloud URLs. */
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {ConvexHttpClient} from 'convex/browser';

import {api} from '../convex/_generated/api';
import type {Id} from '../convex/_generated/dataModel';
import {LEDGER_PAGE_SIZE, MEMBER_PAGE_SIZE} from '../convex/lib/constants';
import type {SupportedLocale} from '../shared/locales';

interface Story {
  readonly locale: SupportedLocale;
  readonly currency: string;
  readonly timeZone: string;
  readonly title: string;
  readonly scale: number;
  readonly memos: readonly string[];
  readonly comments: readonly string[];
}
const stories: readonly Story[] = [
  {
    locale: 'en',
    currency: 'USD',
    timeZone: 'UTC',
    title: 'Climbing Club',
    scale: 1,
    memos: [
      'October dues',
      'Gym session fees',
      'Coffee before the trip',
      'Fuel to the crag',
      'Trail snacks',
      'Dinner after climbing',
      'New rope for the group',
      'First aid refill',
      'Gym session fees',
      'Campsite booking',
      'Coffee round',
      'Pizza after the session',
      'Fuel',
      'Quickdraws',
      'Gym session fees',
      'Energy bars',
      'Club dinner',
      'Rope washing',
      'Morning coffee',
    ],
    comments: [
      'Is this the 60m one we talked about?',
      'Yes, 9.8mm. Paid from October dues.',
      'Perfect. I will bring it on Saturday.',
    ],
  },
  {
    locale: 'ko',
    currency: 'KRW',
    timeZone: 'Asia/Seoul',
    title: '클라이밍 모임',
    scale: 10,
    memos: [
      '10월 회비',
      '암장 이용료',
      '출발 전 커피',
      '암장까지 주유비',
      '이동 중 간식',
      '클라이밍 후 저녁',
      '모임 공용 로프 구입',
      '구급함 보충',
      '암장 이용료',
      '캠핑장 예약',
      '커피 한 잔씩',
      '운동 후 피자',
      '주유비',
      '퀵드로',
      '암장 이용료',
      '에너지바',
      '모임 저녁 식사',
      '로프 세척',
      '아침 커피',
    ],
    comments: [
      '얘기했던 60m 로프 맞죠?',
      '네, 9.8mm예요. 10월 회비에서 냈어요.',
      '좋아요. 토요일에 가져갈게요.',
    ],
  },
  {
    locale: 'ja',
    currency: 'JPY',
    timeZone: 'Asia/Tokyo',
    title: '山岳部の会費',
    scale: 1,
    memos: [
      '10月の会費',
      'ジム利用料',
      '出発前のコーヒー',
      '岩場までのガソリン代',
      '行動食',
      'クライミング後の夕食',
      '部のロープを新調',
      '救急セットの補充',
      'ジム利用料',
      'キャンプ場の予約',
      'コーヒー代',
      'セッション後のピザ',
      'ガソリン代',
      'クイックドロー',
      'ジム利用料',
      'エナジーバー',
      '部の夕食会',
      'ロープの洗浄',
      '朝のコーヒー',
    ],
    comments: [
      '話していた60mのやつですか？',
      'はい、9.8mmです。10月の会費から出しました。',
      '了解です。土曜に持っていきます。',
    ],
  },
  {
    locale: 'zh',
    currency: 'CNY',
    timeZone: 'Asia/Shanghai',
    title: '登山社团经费',
    scale: 5,
    memos: [
      '十月会费',
      '岩馆场地费',
      '出发前的咖啡',
      '去岩场的油费',
      '路上的零食',
      '攀岩后的晚饭',
      '社团新绳子',
      '补充急救包',
      '岩馆场地费',
      '营地预订',
      '一轮咖啡',
      '训练后的披萨',
      '油费',
      '快挂',
      '岩馆场地费',
      '能量棒',
      '社团聚餐',
      '洗绳子',
      '早上的咖啡',
    ],
    comments: [
      '是我们说的那根60米的吗？',
      '对，9.8mm，从十月会费里出的。',
      '好，周六我带过去。',
    ],
  },
  {
    locale: 'id',
    currency: 'IDR',
    timeZone: 'Asia/Jakarta',
    title: 'Kas Klub Panjat',
    scale: 100,
    memos: [
      'Iuran Oktober',
      'Biaya sesi gym',
      'Kopi sebelum berangkat',
      'Bensin ke tebing',
      'Camilan di jalan',
      'Makan malam setelah panjat',
      'Tali baru untuk klub',
      'Isi ulang kotak P3K',
      'Biaya sesi gym',
      'Booking kemah',
      'Kopi bersama',
      'Pizza setelah sesi',
      'Bensin',
      'Quickdraw',
      'Biaya sesi gym',
      'Energy bar',
      'Makan malam klub',
      'Cuci tali',
      'Kopi pagi',
    ],
    comments: [
      'Ini yang 60m yang kita bahas?',
      'Ya, 9.8mm. Dibayar dari iuran Oktober.',
      'Mantap. Sabtu aku bawa.',
    ],
  },
  {
    locale: 'de',
    currency: 'EUR',
    timeZone: 'Europe/Berlin',
    title: 'Kletterclub',
    scale: 1,
    memos: [
      'Oktoberbeitrag',
      'Gebühren für die Kletterhalle',
      'Kaffee vor der Fahrt',
      'Fahrt zum Kletterfelsen',
      'Snacks für unterwegs',
      'Abendessen nach dem Klettern',
      'Neues Seil für die Gruppe',
      'Erste-Hilfe-Set auffüllen',
      'Gebühren für die Kletterhalle',
      'Campingplatz buchen',
      'Eine Runde Kaffee',
      'Pizza nach dem Training',
      'Kraftstoff',
      'Express-Sets',
      'Gebühren für die Kletterhalle',
      'Energieriegel',
      'Gemeinsames Abendessen',
      'Seilwäsche',
      'Morgenkaffee',
    ],
    comments: [
      'Ist das das besprochene 60-m-Seil?',
      'Ja, 9,8 mm. Vom Oktoberbeitrag bezahlt.',
      'Prima. Ich bringe es am Samstag mit.',
    ],
  },
  {
    locale: 'es',
    currency: 'EUR',
    timeZone: 'Europe/Madrid',
    title: 'Club de Escalada',
    scale: 1,
    memos: [
      'Cuotas de octubre',
      'Sesión en el rocódromo',
      'Café antes del viaje',
      'Gasolina para ir a la roca',
      'Tentempiés para el camino',
      'Cena después de escalar',
      'Cuerda nueva para el grupo',
      'Reponer el botiquín',
      'Sesión en el rocódromo',
      'Reserva del camping',
      'Ronda de cafés',
      'Pizza después de la sesión',
      'Gasolina',
      'Cintas exprés',
      'Sesión en el rocódromo',
      'Barritas energéticas',
      'Cena del club',
      'Lavar la cuerda',
      'Café de la mañana',
    ],
    comments: [
      '¿Es la de 60 m que comentamos?',
      'Sí, de 9,8 mm. Pagada con las cuotas de octubre.',
      'Perfecto. La llevaré el sábado.',
    ],
  },
  {
    locale: 'fr',
    currency: 'EUR',
    timeZone: 'Europe/Paris',
    title: 'Club d’Escalade',
    scale: 1,
    memos: [
      'Cotisations d’octobre',
      'Entrée à la salle d’escalade',
      'Café avant le départ',
      'Essence pour la falaise',
      'En-cas pour la route',
      'Dîner après l’escalade',
      'Nouvelle corde pour le groupe',
      'Réapprovisionner la trousse de secours',
      'Entrée à la salle d’escalade',
      'Réservation du camping',
      'Tournée de cafés',
      'Pizza après la séance',
      'Essence',
      'Dégaines',
      'Entrée à la salle d’escalade',
      'Barres énergétiques',
      'Dîner du club',
      'Nettoyage de la corde',
      'Café du matin',
    ],
    comments: [
      'C’est la corde de 60 m dont on a parlé ?',
      'Oui, 9,8 mm. Payée avec les cotisations d’octobre.',
      'Parfait. Je l’apporte samedi.',
    ],
  },
  {
    locale: 'it',
    currency: 'EUR',
    timeZone: 'Europe/Rome',
    title: 'Club di Arrampicata',
    scale: 1,
    memos: [
      'Quote di ottobre',
      'Ingresso in palestra',
      'Caffè prima della partenza',
      'Benzina per la falesia',
      'Spuntini per il viaggio',
      'Cena dopo l’arrampicata',
      'Corda nuova per il gruppo',
      'Rifornire il kit di primo soccorso',
      'Ingresso in palestra',
      'Prenotazione del campeggio',
      'Giro di caffè',
      'Pizza dopo la sessione',
      'Benzina',
      'Rinvii',
      'Ingresso in palestra',
      'Barrette energetiche',
      'Cena del club',
      'Lavaggio della corda',
      'Caffè del mattino',
    ],
    comments: [
      'È quella da 60 m di cui parlavamo?',
      'Sì, da 9,8 mm. Pagata con le quote di ottobre.',
      'Perfetto. La porto sabato.',
    ],
  },
];
const rows: readonly [
  number,
  number,
  number,
  'INCOME' | 'EXPENSE',
  number,
  string,
  0 | 1,
][] = [
  [1, 9, 0, 'INCOME', 24000, 'salary', 0],
  [1, 19, 30, 'EXPENSE', 4800, 'culture', 0],
  [2, 8, 40, 'EXPENSE', 1250, 'cafe', 1],
  [3, 11, 15, 'EXPENSE', 6400, 'transport', 1],
  [4, 13, 20, 'EXPENSE', 2300, 'snack', 0],
  [5, 20, 10, 'EXPENSE', 9600, 'meal', 1],
  [6, 10, 0, 'EXPENSE', 18500, 'stuffs', 0],
  [7, 16, 45, 'EXPENSE', 3200, 'hospital', 1],
  [8, 9, 30, 'EXPENSE', 4800, 'culture', 0],
  [9, 18, 0, 'EXPENSE', 5400, 'sleep', 1],
  [10, 12, 30, 'EXPENSE', 2750, 'cafe', 0],
  [11, 19, 45, 'EXPENSE', 7300, 'meal', 1],
  [12, 11, 0, 'EXPENSE', 6100, 'transport', 0],
  [13, 15, 20, 'EXPENSE', 12900, 'stuffs', 1],
  [14, 9, 10, 'EXPENSE', 4800, 'culture', 0],
  [15, 13, 0, 'EXPENSE', 2100, 'snack', 1],
  [16, 18, 30, 'EXPENSE', 8800, 'meal', 0],
  [17, 10, 15, 'EXPENSE', 3600, 'maintenance', 1],
  [18, 8, 50, 'EXPENSE', 1450, 'cafe', 0],
];
function requestId(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const endpoint = process.env.BOOKOO_FIXTURE_URL ?? 'http://127.0.0.1:3210';
const target = new URL(endpoint);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
  target.protocol !== 'http:'
)
  throw new Error('Gallery fixtures require an HTTP loopback deployment');
const selected = process.argv
  .find((arg) => arg.startsWith('--locale='))
  ?.split('=')[1];
const planned =
  selected === undefined
    ? stories
    : stories.filter((s) => s.locale === selected);
if (planned.length === 0) throw new Error('Unsupported gallery locale');
if (!process.argv.includes('--write')) {
  process.stdout.write(
    `Dry run: ${planned.length} synthetic local stories, ${rows.length} entries per story; no writes.\n`,
  );
} else {
  const records: {
    locale: SupportedLocale;
    ledgerId: Id<'ledgers'>;
    commentItemId: Id<'ledgerItems'>;
  }[] = [];
  for (const story of planned) {
    const clients: ConvexHttpClient[] = [];
    for (const [index, displayName] of ['Mina', 'Chris'].entries()) {
      const client = new ConvexHttpClient(endpoint, {logger: false});
      const email = `gallery110-${story.locale}-${index}@example.test`;
      await client.action(api.auth.signIn, {
        provider: 'bookoo-otp',
        params: {email},
      });
      const session = await client.action(api.auth.signIn, {
        provider: 'bookoo-otp',
        params: {email, code: '68686868'},
      });
      if (!session.tokens?.token) throw new Error('Synthetic sign-in failed');
      client.setAuth(session.tokens.token);
      let user = await client.query(api.user.queries.currentUser, {});
      if (!user) throw new Error('Synthetic profile missing');
      if (!user.handle)
        await client.mutation(api.user.mutations.claimHandle, {
          handle: `${displayName.toLowerCase()}_climb${story.locale === 'en' ? '' : `_${story.locale}`}`,
          locale: story.locale,
          preferredCurrency: story.currency,
        });
      await client.mutation(api.user.mutations.setLocale, {
        locale: story.locale,
      });
      await client.mutation(api.user.mutations.updateProfile, {
        displayName,
        bio: 'Synthetic gallery fixture',
        preferredCurrency: story.currency,
      });
      user = await client.query(api.user.queries.currentUser, {});
      if (user?.onboardingStep !== 'done')
        await client.mutation(api.user.mutations.completeLedgerStep, {
          skipped: true,
          termsAccepted: true,
          privacyAcknowledged: true,
          age14Plus: true,
          locale: story.locale,
        });
      clients.push(client);
    }
    const owner = clients[0];
    const guest = clients[1];
    if (!owner || !guest) throw new Error('Synthetic pair incomplete');
    const ownerUser = await owner.query(api.user.queries.currentUser, {});
    const mine = await owner.query(api.ledgers.queries.listMinePaginated, {
      paginationOpts: {numItems: LEDGER_PAGE_SIZE, cursor: null},
    });
    const previous = mine.page.find(
      (l) =>
        l.ownerId === ownerUser?.userId &&
        l.title === story.title &&
        l.description === 'Synthetic 1.1.0 gallery',
    );
    const ledgerId =
      previous?.id ??
      (
        await owner.mutation(api.ledgers.mutations.create, {
          title: story.title,
          description: 'Synthetic 1.1.0 gallery',
          colorKey: 'TEAL',
          baseCurrency: story.currency,
        })
      ).ledgerId;
    await owner.mutation(api.ledgers.mutations.setTimeZone, {
      ledgerId,
      timeZone: story.timeZone,
      weekStartsOn: 0,
      periodStartDay: 1,
    });
    const guestUser = await guest.query(api.user.queries.currentUser, {});
    const roster = await owner.query(api.ledgers.queries.rosterPaginated, {
      ledgerId,
      paginationOpts: {numItems: MEMBER_PAGE_SIZE, cursor: null},
    });
    if (!roster.page.some((member) => member.userId === guestUser?.userId)) {
      const invite = await owner.mutation(api.invites.mutations.create, {
        ledgerId,
        role: 'MEMBER',
        requiresApproval: false,
        maxUses: 1,
        inviteeUserId: guestUser?.userId,
        note: 'Synthetic gallery',
      });
      const joined = await guest.mutation(api.invites.mutations.redeem, {
        code: invite.code,
      });
      if (joined.status !== 'JOINED')
        throw new Error('Synthetic invite failed');
    }
    let commentItemId: Id<'ledgerItems'> | undefined;
    for (const [index, row] of rows.entries()) {
      const [day, hour, minute, type, amount, categoryKey, author] = row;
      const client = clients[author];
      if (!client) throw new Error('Synthetic author missing');
      const result = await client.mutation(api.items.mutations.create, {
        ledgerId,
        type,
        amountMinor: amount * story.scale,
        currency: story.currency,
        occurredAt: Date.UTC(2026, 9, day, hour, minute),
        categoryKey,
        memo: story.memos[index],
        clientRequestId: requestId(`gallery110:${story.locale}:entry:${index}`),
      });
      if (index === 6) commentItemId = result.itemId;
    }
    if (!commentItemId) throw new Error('Synthetic thread missing');
    for (const [index, body] of story.comments.entries()) {
      const client = clients[index === 1 ? 0 : 1];
      if (!client) throw new Error('Synthetic commenter missing');
      await client.mutation(api.comments.mutations.create, {
        itemId: commentItemId,
        body,
        clientRequestId: requestId(
          `gallery110:${story.locale}:comment:${index}`,
        ),
      });
    }
    records.push({locale: story.locale, ledgerId, commentItemId});
    for (const client of clients) await client.action(api.auth.signOut, {});
    process.stdout.write(
      `Prepared ${story.locale}: ${rows.length} synthetic entries, 2 members, 3 comments.\n`,
    );
  }
  const folder = '.local/marketing-fixture/2026-10-09';
  await mkdir(folder, {recursive: true});
  await writeFile(
    `${folder}/local-capture${selected ? `-${selected}` : ''}.json`,
    JSON.stringify(records, null, 2) + '\n',
    {mode: 0o600},
  );
}
