import type {DiscoveryLocale} from './discovery';

interface PresentationCopy {
  readonly headline: readonly [string, string];
  readonly intro: string;
  readonly storyLabel: string;
  readonly calendarTitle: string;
  readonly calendarText: string;
  readonly togetherTitle: string;
  readonly togetherText: string;
  readonly questionsLabel: string;
  readonly closing: string;
  readonly screenLabel: string;
}

// Presentation copy is intentionally shorter than search metadata. Product claims
// remain grounded in discovery.ts; these strings introduce the same capabilities.
export const PRESENTATION: Readonly<Record<DiscoveryLocale, PresentationCopy>> =
  {
    vi: {
      headline: ['Cùng chi tiêu.', 'Cùng ghi chép.'],
      intro: 'Từ chi tiêu hằng ngày đến sinh hoạt phí và quỹ nhóm. Cùng lưu lại trong một sổ thu chi BooKoo.',
      storyLabel: 'Rõ ràng hơn khi cùng theo dõi',
      calendarTitle: 'Ghi từng ngày.\nHiểu cả tháng.',
      calendarText: 'Xem thu nhập và chi tiêu trên lịch. Biết tiền được dùng vào đâu qua thống kê danh mục.',
      togetherTitle: 'Không chỉ số tiền.\nCòn cả câu chuyện.',
      togetherText: 'Mời gia đình, bạn cùng nhà hoặc nhóm của bạn. Ảnh hóa đơn và bình luận luôn ở cạnh từng khoản chi.',
      questionsLabel: 'Trước giao dịch đầu tiên',
      closing: 'Ghi chép tiếp theo,\ncùng BooKoo.',
      screenLabel: 'Màn hình ứng dụng BooKoo',
    },
    ko: {
      headline: ['함께 쓰는 돈,', '함께 보는 기록.'],
      intro: '나의 하루부터 우리의 생활비까지. 같은 가계부에 차곡차곡, 부쿠.',
      storyLabel: '돈 이야기가 편해지는 가계부',
      calendarTitle: '하루의 기록이\n한 달의 흐름으로.',
      calendarText:
        '달력에 쌓이는 수입과 지출. 카테고리별 통계로 어디에 얼마나 썼는지 돌아보세요.',
      togetherTitle: '누가 썼는지보다,\n무엇을 함께했는지.',
      togetherText:
        '가족, 연인, 룸메이트를 초대하세요. 영수증은 내역에, 이야기는 댓글에. 함께 쓴 돈의 맥락까지 한곳에 남습니다.',
      questionsLabel: '시작하기 전에',
      closing: '우리의 다음 기록,\n부쿠에서 시작해요.',
      screenLabel: 'BooKoo 앱 화면',
    },
    en: {
      headline: ['Shared expenses.', 'A shared story.'],
      intro:
        'From your daily coffee to the bills you share. Keep it together with BooKoo.',
      storyLabel: 'A little more clarity, together',
      calendarTitle: 'Little entries.\nA clearer month.',
      calendarText:
        'See income and expenses on your calendar. Look back at where your money went with category statistics.',
      togetherTitle: 'Keep the context.\nShare the everyday.',
      togetherText:
        'Invite a partner, family or roommates. Add receipt photos and talk in the comments, right beside the expense.',
      questionsLabel: 'Before your first entry',
      closing: 'Your next chapter,\nin BooKoo.',
      screenLabel: 'BooKoo app screen',
    },
    ja: {
      headline: ['一緒に使うお金。', '一緒につづる記録。'],
      intro:
        '自分の日々の出費から、ふたりの生活費まで。ひとつの家計簿に、BooKoo。',
      storyLabel: 'お金の話を、もっと自然に',
      calendarTitle: '毎日の記録から、\nひと月が見えてくる。',
      calendarText:
        'カレンダーで収入と支出を確認。カテゴリー別の統計で、お金の使い道を振り返りましょう。',
      togetherTitle: '金額だけでなく、\nその日のことも。',
      togetherText:
        'パートナーや家族、ルームメイトを招待。レシート写真とコメントで、出費の背景も一緒に残せます。',
      questionsLabel: 'はじめる前に',
      closing: '次の記録を、\nBooKooで。',
      screenLabel: 'BooKooのアプリ画面',
    },
    zh: {
      headline: ['一起花的钱，', '一起记的账。'],
      intro: '从自己的日常开销，到两个人的生活费。用 BooKoo，把账记在一起。',
      storyLabel: '让钱的事，更好聊',
      calendarTitle: '每天记一点，\n看清一个月。',
      calendarText:
        '在日历上查看收入和支出，通过分类统计，回顾钱都花在了哪里。',
      togetherTitle: '记下金额，\n也留下日常。',
      togetherText:
        '邀请伴侣、家人或室友加入。把收据照片和评论留在每笔记录旁，一起了解开销的来龙去脉。',
      questionsLabel: '开始之前',
      closing: '下一笔记录，\n从 BooKoo 开始。',
      screenLabel: 'BooKoo 应用画面',
    },
    'zh-Hant': {
      headline: ['一起花的錢，', '一起記的帳。'],
      intro: '從自己的日常開銷，到兩個人的生活費。用 BooKoo，把帳記在一起。',
      storyLabel: '讓錢的事，更好聊',
      calendarTitle: '每天記一點，\n看清一個月。',
      calendarText:
        '在日曆上查看收入和支出，透過分類統計，回顧錢都花在了哪裡。',
      togetherTitle: '記下金額，\n也留下日常。',
      togetherText:
        '邀請伴侶、家人或室友加入。把收據照片和留言留在每筆記錄旁，一起了解開銷的來龍去脈。',
      questionsLabel: '開始之前',
      closing: '下一筆記錄，\n從 BooKoo 開始。',
      screenLabel: 'BooKoo 應用程式畫面',
    },
    id: {
      headline: ['Catat bersama.', 'Cerita bersama.'],
      intro: 'Dari kopi harian hingga tagihan rumah. Catat bersama di BooKoo.',
      storyLabel: 'Lebih jelas, bersama',
      calendarTitle: 'Catatan kecil.\nSebulan lebih jelas.',
      calendarText:
        'Lihat pemasukan dan pengeluaran di kalender. Tinjau ke mana uang digunakan melalui statistik kategori.',
      togetherTitle: 'Bukan hanya angka.\nAda cerita juga.',
      togetherText:
        'Undang pasangan, keluarga atau teman serumah. Tambahkan foto struk dan komentar langsung pada catatan pengeluaran.',
      questionsLabel: 'Sebelum mulai mencatat',
      closing: 'Catatan berikutnya,\ndi BooKoo.',
      screenLabel: 'Tampilan aplikasi BooKoo',
    },
    de: {
      headline: ['Ausgaben teilen.', 'Überblick behalten.'],
      intro:
        'Vom Kaffee unterwegs bis zur Haushaltsrechnung. Mit BooKoo bleibt alles zusammen.',
      storyLabel: 'Mehr Überblick, miteinander',
      calendarTitle: 'Tag für Tag.\nDer Monat im Blick.',
      calendarText:
        'Einnahmen und Ausgaben im Kalender sehen. Mit Kategoriestatistiken erkennen, wohin das Geld fließt.',
      togetherTitle: 'Nicht nur Beträge.\nAuch die Geschichte.',
      togetherText:
        'Partner, Familie oder Mitbewohner einladen. Belegfotos und Kommentare bleiben direkt beim jeweiligen Eintrag.',
      questionsLabel: 'Vor dem ersten Eintrag',
      closing: 'Der nächste Eintrag.\nMit BooKoo.',
      screenLabel: 'BooKoo App-Ansicht',
    },
    es: {
      headline: ['Gastos en común.', 'Una misma historia.'],
      intro:
        'Del café de cada día a las cuentas de casa. Todo junto en BooKoo.',
      storyLabel: 'Más claridad, en compañía',
      calendarTitle: 'Día a día.\nEl mes, más claro.',
      calendarText:
        'Consulta ingresos y gastos en el calendario. Revisa en qué gastas con estadísticas por categoría.',
      togetherTitle: 'Más que importes.\nTambién recuerdos.',
      togetherText:
        'Invita a tu pareja, familia o compañeros de piso. Añade fotos de recibos y comentarios junto a cada gasto.',
      questionsLabel: 'Antes del primer apunte',
      closing: 'Tu próximo apunte,\nen BooKoo.',
      screenLabel: 'Pantalla de la app BooKoo',
    },
    fr: {
      headline: ['Nos dépenses.', 'Notre histoire.'],
      intro:
        'Du café quotidien aux factures du foyer. Gardez le fil avec BooKoo.',
      storyLabel: 'Plus de clarté, ensemble',
      calendarTitle: 'Au fil des jours.\nLe mois se dessine.',
      calendarText:
        'Retrouvez revenus et dépenses dans le calendrier. Les statistiques par catégorie éclairent vos habitudes.',
      togetherTitle: 'Au-delà des chiffres,\nle quotidien partagé.',
      togetherText:
        'Invitez votre partenaire, votre famille ou vos colocataires. Photos de reçus et commentaires restent auprès de chaque dépense.',
      questionsLabel: 'Avant la première note',
      closing: 'La prochaine page,\navec BooKoo.',
      screenLabel: 'Écran de l’application BooKoo',
    },
    it: {
      headline: ['Spese condivise.', 'Una storia comune.'],
      intro:
        'Dal caffè quotidiano alle bollette di casa. Tieni tutto insieme con BooKoo.',
      storyLabel: 'Più chiarezza, insieme',
      calendarTitle: 'Giorno per giorno.\nIl mese prende forma.',
      calendarText:
        'Consulta entrate e uscite sul calendario. Scopri dove vanno i soldi con le statistiche per categoria.',
      togetherTitle: 'Non solo cifre.\nAnche la loro storia.',
      togetherText:
        'Invita partner, familiari o coinquilini. Foto degli scontrini e commenti restano accanto a ogni spesa.',
      questionsLabel: 'Prima di iniziare',
      closing: 'La prossima pagina,\ncon BooKoo.',
      screenLabel: 'Schermata dell’app BooKoo',
    },
    nl: {
      headline: ['Gedeelde uitgaven.', 'Een gedeeld verhaal.'],
      intro:
        'Van je dagelijkse koffie tot de rekeningen thuis. Houd het samen bij met BooKoo.',
      storyLabel: 'Meer overzicht, samen',
      calendarTitle: 'Dag na dag.\nDe maand in beeld.',
      calendarText:
        'Bekijk inkomsten en uitgaven in de kalender. Ontdek met categoriestatistieken waar je geld naartoe gaat.',
      togetherTitle: 'Meer dan bedragen.\nOok het verhaal.',
      togetherText:
        'Nodig je partner, familie of huisgenoten uit. Bewaar foto’s van bonnetjes en opmerkingen direct bij elke uitgave.',
      questionsLabel: 'Voor je eerste notitie',
      closing: 'Je volgende verhaal,\nin BooKoo.',
      screenLabel: 'BooKoo-appscherm',
    },
    pt: {
      headline: ['Gastos em comum.', 'Uma história só.'],
      intro:
        'Do café diário às contas da casa. Guarde tudo junto com o BooKoo.',
      storyLabel: 'Mais clareza, em conjunto',
      calendarTitle: 'Dia após dia.\nO mês ganha forma.',
      calendarText:
        'Consulte receitas e despesas no calendário. Veja para onde vai o dinheiro com estatísticas por categoria.',
      togetherTitle: 'Mais do que valores.\nTambém as histórias.',
      togetherText:
        'Convide o seu par, a família ou colegas de casa. Fotografias de recibos e comentários ficam junto de cada despesa.',
      questionsLabel: 'Antes do primeiro registo',
      closing: 'O próximo registo,\nno BooKoo.',
      screenLabel: 'Ecrã da aplicação BooKoo',
    },
  };

export const CAPTURE_LOCALE: Readonly<Record<DiscoveryLocale, string>> = {
  vi: 'en-US',
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja',
  zh: 'zh-CN',
  'zh-Hant': 'en-US',
  id: 'id',
  de: 'en-US',
  es: 'en-US',
  fr: 'en-US',
  it: 'en-US',
  nl: 'en-US',
  pt: 'en-US',
};
