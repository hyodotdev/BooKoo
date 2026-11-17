import storeLocales from '../../store-assets/store-locales.json';
import type {PublicPage} from './content';

export type DiscoveryLocale = keyof typeof storeLocales;
export const DISCOVERY_LOCALES = Object.keys(storeLocales) as DiscoveryLocale[];
export const SITE_ORIGIN = 'https://bookoo.hyo.dev';
export const APP_STORE_URL = 'https://apps.apple.com/app/id6805969489';
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=dev.hyo.bookoo';

interface DiscoveryCopy {
  readonly languageName: string;
  readonly lang: string;
  readonly title: string;
  readonly summary: string;
  readonly featureTitle: string;
  readonly featureText: string;
  readonly soloQuestion: string;
  readonly soloAnswer: string;
  readonly entryQuestion: string;
  readonly entryAnswer: string;
  readonly freeQuestion: string;
  readonly freeAnswer: string;
  readonly downloadLabel: string;
  readonly languageLabel: string;
  readonly supportLabel: string;
  readonly privacyLabel: string;
  readonly termsLabel: string;
  readonly legalNotice: string;
  readonly skipLabel: string;
}

// Website copy owns web search intent; store-locales.json owns language coverage.
// This is not a claim of support for additional in-app languages or features.
export const DISCOVERY_COPY: Readonly<Record<DiscoveryLocale, DiscoveryCopy>> =
  {
    vi: {
      languageName: 'Tiếng Việt',
      lang: 'vi',
      title: 'BooKoo — Sổ thu chi chung cho gia đình và nhóm',
      summary: 'Cùng ghi thu nhập, chi tiêu, lưu ảnh hóa đơn và trao đổi trên từng giao dịch. Theo dõi sổ cá nhân, gia đình hay nhóm qua lịch và thống kê danh mục.',
      featureTitle: 'Một sổ chung cho các khoản chi chung',
      featureText: 'Ghi sinh hoạt phí, quỹ nhóm và chi phí du lịch. Mời thành viên tự ghi giao dịch và trao đổi qua bình luận. Dùng ảnh hóa đơn, lịch, thống kê danh mục và giao diện tối trên điện thoại, máy tính bảng.',
      soloQuestion: 'Tôi có thể dùng BooKoo một mình không?',
      soloAnswer: 'Có. Bắt đầu với sổ cá nhân rồi mời người khác khi cần. Chỉ thành viên của sổ mới xem được dữ liệu.',
      entryQuestion: 'Ghi chi tiêu và hóa đơn như thế nào?',
      entryAnswer: 'Nhập số tiền, ngày và danh mục hoặc quét ảnh hóa đơn trên thiết bị rồi kiểm tra trước khi áp dụng vào bản nháp. Ảnh được đính kèm khi lưu giao dịch. BooKoo không kết nối ngân hàng, chuyển tiền hay tự động quyết toán.',
      freeQuestion: 'BooKoo có miễn phí không?',
      freeAnswer: 'Bản miễn phí cho phép sở hữu một sổ, có 2 thành viên trong mỗi sổ mới và ghi giao dịch không giới hạn, có quảng cáo hạn chế. BooKoo Pro là gói tùy chọn để loại bỏ quảng cáo, tạo thêm sổ và có tối đa 5 thành viên trong mỗi sổ mới.',
      downloadLabel: 'Tải ứng dụng',
      languageLabel: 'Ngôn ngữ',
      supportLabel: 'Hỗ trợ',
      privacyLabel: 'Chính sách quyền riêng tư',
      termsLabel: 'Điều khoản sử dụng',
      legalNotice: 'Tài liệu pháp lý hiện có bằng tiếng Anh. Chính sách quyền riêng tư tiếng Hàn là văn bản gốc; các bản dịch được cung cấp để tham khảo.',
      skipLabel: 'Chuyển đến nội dung',
    },
    ko: {
      languageName: '한국어',
      lang: 'ko',
      title: '공유 가계부 BooKoo 부쿠 — 생활비와 공동 경비 기록',
      summary:
        'BooKoo(부쿠)는 혼자 또는 커플·가족·룸메이트·모임이 함께 쓰는 가계부입니다. 수입과 지출, 영수증 사진, 댓글을 한 장부에 기록하고 달력과 카테고리 통계로 확인하세요.',
      featureTitle: '함께 쓰는 돈을 같은 가계부에',
      featureText:
        '가족 생활비, 팀 운영비, 모임 회비와 여행 경비를 기록하세요. 초대한 멤버가 직접 내역을 작성하고 각 기록에서 댓글로 이야기할 수 있습니다. 휴대폰과 태블릿에서 영수증 사진, 달력, 카테고리 통계와 다크 모드를 지원합니다.',
      soloQuestion: '혼자 쓰는 가계부로 시작해도 되나요?',
      soloAnswer:
        '네. 개인 가계부로 수입과 지출을 기록하다가 함께 관리하고 싶을 때 원하는 사람을 초대할 수 있습니다. 가계부는 참여한 멤버에게만 보입니다.',
      entryQuestion: '지출과 영수증은 어떻게 기록하나요?',
      entryAnswer:
        '금액, 날짜와 카테고리를 직접 입력합니다. 영수증 사진의 금액과 날짜를 기기에서 읽고 확인한 뒤 입력 화면에 적용할 수도 있습니다. 사진은 내역을 저장할 때 첨부되며, 은행 자동 연결·송금·자동 정산은 제공하지 않습니다.',
      freeQuestion: '무료 가계부로 사용할 수 있나요?',
      freeAnswer:
        'Free는 본인 소유 가계부 1개, 새 가계부당 2명과 무제한 내역을 지원하며 제한된 광고가 표시될 수 있습니다. 선택 구독 BooKoo Pro는 광고 제거, 추가 가계부와 새 가계부당 최대 5명을 지원합니다.',
      downloadLabel: '앱 다운로드',
      languageLabel: '언어',
      supportLabel: '지원',
      privacyLabel: '개인정보처리방침',
      termsLabel: '이용약관',
      legalNotice:
        '한국어 개인정보처리방침이 기준 문서이며 번역문은 이해를 돕기 위해 제공합니다.',
      skipLabel: '본문으로 건너뛰기',
    },
    en: {
      languageName: 'English',
      lang: 'en',
      title: 'BooKoo — Shared Expense Tracker & Household Ledger',
      summary:
        'Track income, expenses and household bills on your own or with a partner, family, roommates or group. BooKoo keeps receipt photos, comments, a calendar and category statistics in one shared ledger.',
      featureTitle: 'One shared ledger for the money you spend together',
      featureText:
        'Record household bills, team costs, club dues and travel expenses. Invite members to add their own entries and discuss each expense in its comments. Use receipt photos, a calendar, category statistics and dark mode on phones and tablets.',
      soloQuestion: 'Can I use BooKoo as a personal expense tracker?',
      soloAnswer:
        'Yes. Start with your own income and expenses, then invite someone when you want to keep a shared record. A ledger is visible only to its members.',
      entryQuestion: 'How do I record expenses and receipts?',
      entryAnswer:
        'Enter the amount, date and category manually, or read an amount and date from a receipt photo on your device and review them before applying them to a draft. Photos attach when you save an entry. BooKoo does not connect to banks, transfer money or settle balances automatically.',
      freeQuestion: 'Is BooKoo free to use?',
      freeAnswer:
        'Free includes one ledger you own, two members per new ledger and unlimited entries, with limited ads. The optional BooKoo Pro subscription removes ads, lets you create additional ledgers and supports up to five members per new ledger.',
      downloadLabel: 'Download the app',
      languageLabel: 'Languages',
      supportLabel: 'Support',
      privacyLabel: 'Privacy policy',
      termsLabel: 'Terms of use',
      legalNotice:
        'The Korean privacy policy is the controlling document; translations are provided for convenience.',
      skipLabel: 'Skip to content',
    },
    ja: {
      languageName: '日本語',
      lang: 'ja',
      title: 'BooKoo — 生活費と共同経費を記録する共有家計簿',
      summary:
        'BooKooは、一人でもカップル・家族・ルームメイト・グループでも使える共有家計簿です。収入・支出・レシート写真・コメントを一つの帳簿にまとめ、カレンダーとカテゴリ別統計で確認できます。',
      featureTitle: 'みんなで使うお金を、同じ家計簿に',
      featureText:
        '生活費、チームの経費、サークルの会費、旅行費を記録できます。招待したメンバーが自分で入力し、各記録にコメントできます。スマートフォンとタブレットでレシート写真、カレンダー、カテゴリ別統計、ダークモードを使えます。',
      soloQuestion: '一人用の家計簿として使えますか？',
      soloAnswer:
        'はい。まず自分の収入と支出を記録し、共同で管理したくなったときに相手を招待できます。家計簿は参加メンバーだけに表示されます。',
      entryQuestion: '支出やレシートはどう記録しますか？',
      entryAnswer:
        '金額・日付・カテゴリを手入力できます。端末でレシート写真から金額と日付を読み取り、確認してから入力画面に反映することもできます。写真は記録を保存するときに添付されます。銀行連携、送金、自動精算は行いません。',
      freeQuestion: '無料で使えますか？',
      freeAnswer:
        'Freeでは自分が所有する家計簿1つ、新しい家計簿ごとに2人、無制限の記録を利用でき、限定的な広告が表示される場合があります。任意のBooKoo Proは広告を除去し、所有家計簿の追加と新しい家計簿ごとに最大5人をサポートします。',
      downloadLabel: 'アプリをダウンロード',
      languageLabel: '言語',
      supportLabel: 'サポート',
      privacyLabel: 'プライバシーポリシー',
      termsLabel: '利用規約',
      legalNotice:
        '韓国語のプライバシーポリシーが基準文書です。翻訳は理解を助けるために提供します。',
      skipLabel: '本文へスキップ',
    },
    zh: {
      languageName: '简体中文',
      lang: 'zh-Hans',
      title: 'BooKoo — 记录家庭收支与共同开支的共享记账本',
      summary:
        'BooKoo可用于个人记账，也能与伴侣、家人、室友或团队共享账本。一起记录收入、支出、收据照片和评论，通过日历与分类统计查看开支。',
      featureTitle: '一起花的钱，在同一本账本里记录',
      featureText:
        '记录家庭生活费、团队经费、社团会费和旅行开支。受邀成员可以自行记账并在每笔记录旁评论。手机和平板支持收据照片、日历、分类统计和深色模式。',
      soloQuestion: '可以只用来个人记账吗？',
      soloAnswer:
        '可以。先记录自己的收入和支出，需要共同管理时再邀请他人。账本仅参与的成员可见。',
      entryQuestion: '如何记录支出与收据？',
      entryAnswer:
        '手动输入金额、日期和分类，或在设备上读取收据照片中的金额与日期，核对后应用到草稿。保存记录时才会附上照片。BooKoo不提供银行自动连接、转账或自动结算。',
      freeQuestion: '可以免费使用吗？',
      freeAnswer:
        'Free支持拥有1个账本，每个新账本2名成员和不限数量的记录，可能显示有限广告。可选订阅BooKoo Pro可移除广告、增加自有账本，并支持每个新账本最多5名成员。',
      downloadLabel: '下载应用',
      languageLabel: '语言',
      supportLabel: '支持',
      privacyLabel: '隐私政策',
      termsLabel: '使用条款',
      legalNotice: '韩文隐私政策为准，译文仅供理解参考。',
      skipLabel: '跳转到正文',
    },
    'zh-Hant': {
      languageName: '繁體中文',
      lang: 'zh-Hant',
      title: 'BooKoo — 記錄家庭收支與共同支出的共享記帳本',
      summary:
        'BooKoo可用於個人記帳，也能與伴侶、家人、室友或團隊共享帳本。一起記錄收入、支出、收據照片和留言，透過月曆與分類統計查看開支。',
      featureTitle: '一起花的錢，在同一本帳本裡記錄',
      featureText:
        '記錄家庭生活費、團隊經費、社團會費和旅行支出。受邀成員可以自行記帳並在每筆記錄旁留言。手機和平板支援收據照片、月曆、分類統計和深色模式。',
      soloQuestion: '可以只用來個人記帳嗎？',
      soloAnswer:
        '可以。先記錄自己的收入和支出，需要共同管理時再邀請他人。帳本只有參與的成員可見。',
      entryQuestion: '如何記錄支出與收據？',
      entryAnswer:
        '手動輸入金額、日期和分類，或在裝置上讀取收據照片中的金額與日期，核對後套用至草稿。儲存記錄時才會附上照片。BooKoo不提供銀行自動連結、轉帳或自動結算。',
      freeQuestion: '可以免費使用嗎？',
      freeAnswer:
        'Free支援擁有1個帳本，每個新帳本2名成員和不限數量的記錄，可能顯示有限廣告。選用訂閱BooKoo Pro可移除廣告、增加自有帳本，並支援每個新帳本最多5名成員。',
      downloadLabel: '下載應用程式',
      languageLabel: '語言',
      supportLabel: '支援（英文）',
      privacyLabel: '隱私政策（英文）',
      termsLabel: '使用條款（英文）',
      legalNotice: '韓文隱私政策為準。連結的法律與支援頁面目前提供英文版本。',
      skipLabel: '跳至正文',
    },
    id: {
      languageName: 'Bahasa Indonesia',
      lang: 'id',
      title: 'BooKoo — Buku Kas Bersama & Catatan Pengeluaran',
      summary:
        'Catat pemasukan dan pengeluaran pribadi atau bersama pasangan, keluarga, teman serumah dan kelompok. BooKoo menyatukan foto struk, komentar, kalender dan statistik kategori dalam satu buku kas.',
      featureTitle: 'Uang bersama dicatat dalam satu buku kas',
      featureText:
        'Catat biaya rumah tangga, operasional tim, iuran komunitas dan perjalanan. Anggota yang diundang dapat mencatat sendiri dan membahas setiap transaksi lewat komentar. Foto struk, kalender, statistik kategori dan mode gelap tersedia di ponsel dan tablet.',
      soloQuestion: 'Bisakah saya memakai BooKoo sendiri?',
      soloAnswer:
        'Bisa. Mulai dengan pemasukan dan pengeluaran pribadi, lalu undang orang lain saat ingin mencatat bersama. Buku kas hanya terlihat oleh anggotanya.',
      entryQuestion: 'Bagaimana cara mencatat pengeluaran dan struk?',
      entryAnswer:
        'Masukkan jumlah, tanggal dan kategori secara manual, atau baca jumlah dan tanggal dari foto struk di perangkat lalu periksa sebelum menerapkannya ke draf. Foto dilampirkan saat catatan disimpan. BooKoo tidak menghubungkan rekening bank, mentransfer uang atau menyelesaikan saldo secara otomatis.',
      freeQuestion: 'Apakah BooKoo gratis?',
      freeAnswer:
        'Free mencakup satu buku kas milik sendiri, dua anggota per buku kas baru dan catatan tanpa batas, dengan iklan terbatas. Langganan opsional BooKoo Pro menghapus iklan, menambah buku kas milik sendiri dan mendukung hingga lima anggota per buku kas baru.',
      downloadLabel: 'Unduh aplikasi',
      languageLabel: 'Bahasa',
      supportLabel: 'Bantuan',
      privacyLabel: 'Kebijakan privasi',
      termsLabel: 'Ketentuan penggunaan',
      legalNotice:
        'Kebijakan privasi bahasa Korea menjadi acuan; terjemahan disediakan untuk kemudahan.',
      skipLabel: 'Langsung ke konten',
    },
    de: {
      languageName: 'Deutsch',
      lang: 'de',
      title: 'BooKoo — Gemeinsames Kassenbuch für Einnahmen und Ausgaben',
      summary:
        'Einnahmen, Ausgaben und gemeinsame Kosten im Kassenbuch festhalten: allein, als Paar, Familie, WG oder Gruppe. BooKoo verbindet Belegfotos, Kommentare, Kalender und Kategoriestatistiken in einem gemeinsamen Buch.',
      featureTitle: 'Ein gemeinsames Kassenbuch für euer Geld',
      featureText:
        'Erfasst Haushaltskosten, Teamausgaben, Vereinsbeiträge und Reisekosten. Eingeladene Mitglieder tragen selbst ein und kommentieren einzelne Buchungen. Belegfotos, Kalender, Kategoriestatistiken und Dunkelmodus gibt es auf Smartphone und Tablet.',
      soloQuestion: 'Kann ich BooKoo allein nutzen?',
      soloAnswer:
        'Ja. Beginne mit deinen eigenen Einnahmen und Ausgaben und lade später andere zum gemeinsamen Kassenbuch ein. Nur Mitglieder können das Buch sehen.',
      entryQuestion: 'Wie erfasse ich Ausgaben und Belege?',
      entryAnswer:
        'Betrag, Datum und Kategorie werden manuell eingetragen. Betrag und Datum eines Belegfotos können auf dem Gerät gelesen und nach Prüfung in den Entwurf übernommen werden. Fotos werden erst beim Speichern angehängt. BooKoo bietet keine Bankanbindung, Überweisungen oder automatische Abrechnung.',
      freeQuestion: 'Ist BooKoo kostenlos?',
      freeAnswer:
        'Free bietet ein eigenes Kassenbuch, zwei Mitglieder pro neuem Buch und unbegrenzte Einträge mit begrenzter Werbung. Das optionale BooKoo-Pro-Abo entfernt Werbung, ermöglicht weitere eigene Bücher und bis zu fünf Mitglieder pro neuem Buch.',
      downloadLabel: 'App herunterladen',
      languageLabel: 'Sprachen',
      supportLabel: 'Hilfe (Englisch)',
      privacyLabel: 'Datenschutz (Englisch)',
      termsLabel: 'Nutzungsbedingungen (Englisch)',
      legalNotice:
        'Die koreanische Datenschutzerklärung ist maßgeblich. Verlinkte Rechts- und Hilfeseiten sind derzeit auf Englisch verfügbar.',
      skipLabel: 'Zum Inhalt springen',
    },
    es: {
      languageName: 'Español',
      lang: 'es',
      title: 'BooKoo — Registro de gastos y cuentas compartidas',
      summary:
        'Lleva tus ingresos, gastos y cuentas del hogar a solas o con tu pareja, familia, compañeros de piso o grupo. BooKoo reúne fotos de recibos, comentarios, calendario y estadísticas por categoría en un registro compartido.',
      featureTitle: 'Un registro para el dinero que gastáis juntos',
      featureText:
        'Anota gastos del hogar, costes del equipo, cuotas de una asociación y viajes. Cada miembro invitado puede añadir registros y comentarlos. Usa fotos de recibos, calendario, estadísticas por categoría y modo oscuro en móvil y tableta.',
      soloQuestion: '¿Puedo usar BooKoo para mis gastos personales?',
      soloAnswer:
        'Sí. Empieza con tus ingresos y gastos e invita a otras personas cuando quieras llevar cuentas compartidas. Solo los miembros pueden ver el registro.',
      entryQuestion: '¿Cómo registro gastos y recibos?',
      entryAnswer:
        'Introduce el importe, la fecha y la categoría manualmente, o lee el importe y la fecha de una foto de recibo en el dispositivo y revísalos antes de aplicarlos al borrador. Las fotos se adjuntan al guardar. BooKoo no conecta bancos, transfiere dinero ni liquida saldos automáticamente.',
      freeQuestion: '¿BooKoo es gratis?',
      freeAnswer:
        'Free incluye un registro propio, dos miembros por registro nuevo y anotaciones ilimitadas, con publicidad limitada. La suscripción opcional BooKoo Pro elimina los anuncios, permite más registros propios y hasta cinco miembros por registro nuevo.',
      downloadLabel: 'Descargar la app',
      languageLabel: 'Idiomas',
      supportLabel: 'Ayuda (inglés)',
      privacyLabel: 'Privacidad (inglés)',
      termsLabel: 'Condiciones de uso (inglés)',
      legalNotice:
        'La política de privacidad en coreano es el documento de referencia. Las páginas legales y de ayuda enlazadas están disponibles en inglés.',
      skipLabel: 'Ir al contenido',
    },
    fr: {
      languageName: 'Français',
      lang: 'fr',
      title: 'BooKoo — Carnet de comptes et suivi des dépenses partagées',
      summary:
        'Notez vos revenus, dépenses et frais du foyer seul, en couple, en famille, en colocation ou en groupe. BooKoo réunit photos de reçus, commentaires, calendrier et statistiques par catégorie dans un carnet partagé.',
      featureTitle: 'Un carnet commun pour vos dépenses communes',
      featureText:
        'Notez les dépenses du foyer, de votre équipe, les cotisations et les voyages. Les membres invités ajoutent leurs propres écritures et les commentent. Photos de reçus, calendrier, statistiques par catégorie et mode sombre sont disponibles sur téléphone et tablette.',
      soloQuestion: 'Puis-je utiliser BooKoo pour mes dépenses personnelles ?',
      soloAnswer:
        'Oui. Commencez par vos revenus et dépenses, puis invitez une autre personne lorsque vous souhaitez tenir un carnet commun. Seuls les membres peuvent voir le carnet.',
      entryQuestion: 'Comment enregistrer les dépenses et les reçus ?',
      entryAnswer:
        'Saisissez le montant, la date et la catégorie, ou lisez le montant et la date d’une photo de reçu sur l’appareil puis vérifiez-les avant de les appliquer au brouillon. Les photos sont jointes à l’enregistrement. BooKoo ne connecte pas les banques, ne transfère pas d’argent et ne solde pas automatiquement les comptes.',
      freeQuestion: 'BooKoo est-il gratuit ?',
      freeAnswer:
        'Free comprend un carnet dont vous êtes propriétaire, deux membres par nouveau carnet et des écritures illimitées, avec une publicité limitée. L’abonnement facultatif BooKoo Pro supprime les publicités, ajoute des carnets et permet jusqu’à cinq membres par nouveau carnet.',
      downloadLabel: 'Télécharger l’application',
      languageLabel: 'Langues',
      supportLabel: 'Assistance (anglais)',
      privacyLabel: 'Confidentialité (anglais)',
      termsLabel: 'Conditions d’utilisation (anglais)',
      legalNotice:
        'La politique de confidentialité coréenne fait foi. Les pages juridiques et d’assistance liées sont disponibles en anglais.',
      skipLabel: 'Aller au contenu',
    },
    it: {
      languageName: 'Italiano',
      lang: 'it',
      title: 'BooKoo — Registro delle spese e conti condivisi',
      summary:
        'Registra entrate, uscite e spese di casa da solo o con partner, famiglia, coinquilini e gruppi. BooKoo riunisce foto delle ricevute, commenti, calendario e statistiche per categoria in un registro condiviso.',
      featureTitle: 'Un registro per il denaro che spendete insieme',
      featureText:
        'Annota spese di casa, costi del team, quote associative e viaggi. I membri invitati possono inserire le proprie voci e commentarle. Foto delle ricevute, calendario, statistiche per categoria e modalità scura sono disponibili su telefono e tablet.',
      soloQuestion: 'Posso usare BooKoo per le spese personali?',
      soloAnswer:
        'Sì. Inizia con le tue entrate e uscite, poi invita altre persone quando vuoi tenere un registro condiviso. Solo i membri possono vederlo.',
      entryQuestion: 'Come registro spese e ricevute?',
      entryAnswer:
        'Inserisci importo, data e categoria manualmente, oppure leggi importo e data da una foto della ricevuta sul dispositivo e controllali prima di applicarli alla bozza. Le foto si allegano al salvataggio. BooKoo non collega banche, trasferisce denaro o regola saldi automaticamente.',
      freeQuestion: 'BooKoo è gratuito?',
      freeAnswer:
        'Free include un registro di tua proprietà, due membri per nuovo registro e voci illimitate, con pubblicità limitata. L’abbonamento facoltativo BooKoo Pro elimina la pubblicità, aggiunge registri di proprietà e supporta fino a cinque membri per nuovo registro.',
      downloadLabel: 'Scarica l’app',
      languageLabel: 'Lingue',
      supportLabel: 'Assistenza (inglese)',
      privacyLabel: 'Privacy (inglese)',
      termsLabel: 'Condizioni d’uso (inglese)',
      legalNotice:
        'Fa fede l’informativa sulla privacy coreana. Le pagine legali e di assistenza collegate sono disponibili in inglese.',
      skipLabel: 'Vai al contenuto',
    },
    nl: {
      languageName: 'Nederlands',
      lang: 'nl',
      title: 'BooKoo — Gedeeld kasboek voor inkomsten en uitgaven',
      summary:
        'Houd inkomsten, uitgaven en huishoudkosten bij, alleen of met je partner, gezin, huisgenoten of groep. BooKoo brengt bonfoto’s, reacties, een kalender en categoriestatistieken samen in één gedeeld kasboek.',
      featureTitle: 'Eén kasboek voor het geld dat jullie samen uitgeven',
      featureText:
        'Noteer huishoudkosten, teamuitgaven, contributies en reiskosten. Uitgenodigde leden voegen zelf posten toe en reageren bij elke boeking. Gebruik bonfoto’s, kalender, categoriestatistieken en donkere modus op telefoon en tablet.',
      soloQuestion: 'Kan ik BooKoo alleen gebruiken?',
      soloAnswer:
        'Ja. Begin met je eigen inkomsten en uitgaven en nodig later anderen uit voor een gedeeld kasboek. Alleen leden kunnen het kasboek bekijken.',
      entryQuestion: 'Hoe leg ik uitgaven en bonnen vast?',
      entryAnswer:
        'Vul bedrag, datum en categorie handmatig in, of lees bedrag en datum uit een bonfoto op je apparaat en controleer ze voordat je ze op het concept toepast. Foto’s worden bij het opslaan toegevoegd. BooKoo koppelt geen banken, maakt geen geld over en verrekent saldi niet automatisch.',
      freeQuestion: 'Is BooKoo gratis?',
      freeAnswer:
        'Free biedt één eigen kasboek, twee leden per nieuw kasboek en onbeperkte posten, met beperkte advertenties. Het optionele BooKoo Pro-abonnement verwijdert advertenties, voegt eigen kasboeken toe en ondersteunt maximaal vijf leden per nieuw kasboek.',
      downloadLabel: 'Download de app',
      languageLabel: 'Talen',
      supportLabel: 'Hulp (Engels)',
      privacyLabel: 'Privacybeleid (Engels)',
      termsLabel: 'Gebruiksvoorwaarden (Engels)',
      legalNotice:
        'Het Koreaanse privacybeleid is leidend. De gekoppelde juridische en hulppagina’s zijn beschikbaar in het Engels.',
      skipLabel: 'Naar inhoud',
    },
    pt: {
      languageName: 'Português',
      lang: 'pt',
      title: 'BooKoo — Livro de contas e despesas partilhadas',
      summary:
        'Registe receitas, despesas e contas da casa, individualmente, em casal, com a família, colegas de casa ou um grupo. O BooKoo reúne fotos de recibos, comentários, calendário e estatísticas por categoria num livro de contas partilhado.',
      featureTitle: 'Um livro para o dinheiro que gastam em conjunto',
      featureText:
        'Registe contas da casa, despesas da equipa, quotas e viagens. Os membros convidados podem adicionar os seus registos e comentar cada despesa. Fotos de recibos, calendário, estatísticas por categoria e modo escuro estão disponíveis em telemóveis e tablets.',
      soloQuestion: 'Posso usar o BooKoo para despesas pessoais?',
      soloAnswer:
        'Sim. Comece pelas suas receitas e despesas e convide outras pessoas quando quiser manter um registo partilhado. Só os membros podem ver o livro.',
      entryQuestion: 'Como registo despesas e recibos?',
      entryAnswer:
        'Introduza o valor, a data e a categoria manualmente, ou leia o valor e a data de uma foto de recibo no dispositivo e confirme antes de aplicar ao rascunho. As fotos são anexadas ao guardar. O BooKoo não liga bancos, transfere dinheiro nem faz acertos automáticos de saldos.',
      freeQuestion: 'O BooKoo é gratuito?',
      freeAnswer:
        'O Free inclui um livro próprio, dois membros por livro novo e registos ilimitados, com publicidade limitada. A subscrição opcional BooKoo Pro remove anúncios, adiciona livros próprios e permite até cinco membros por livro novo.',
      downloadLabel: 'Descarregar a aplicação',
      languageLabel: 'Idiomas',
      supportLabel: 'Apoio (inglês)',
      privacyLabel: 'Privacidade (inglês)',
      termsLabel: 'Termos de utilização (inglês)',
      legalNotice:
        'A política de privacidade coreana é o documento de referência. As páginas legais e de apoio ligadas estão disponíveis em inglês.',
      skipLabel: 'Saltar para o conteúdo',
    },
  };

export function discoveryPath(locale: DiscoveryLocale): string {
  return locale === 'ko' ? '/' : '/' + DISCOVERY_COPY[locale].lang;
}

export function discoveryPage(locale: DiscoveryLocale): PublicPage {
  const copy = DISCOVERY_COPY[locale];
  return {
    title: copy.title,
    summary: copy.summary,
    sections: [
      {heading: copy.featureTitle, paragraphs: [copy.featureText]},
      {heading: copy.soloQuestion, paragraphs: [copy.soloAnswer]},
      {heading: copy.entryQuestion, paragraphs: [copy.entryAnswer]},
      {heading: copy.freeQuestion, paragraphs: [copy.freeAnswer]},
    ],
  };
}
