export const APP_CONTENT_LOCALES = ['en', 'ko', 'ja', 'zh', 'id'] as const;

type AppContentLocale = (typeof APP_CONTENT_LOCALES)[number];

interface DefaultTranslation {
  readonly locale: AppContentLocale;
  readonly title: string;
  readonly body: string;
}

export interface DefaultAppContent {
  readonly key: string;
  readonly kind: 'NOTICE' | 'FAQ';
  readonly translations: readonly DefaultTranslation[];
  readonly sortOrder: number;
  readonly pinned: boolean;
  readonly publishedAt: number;
  readonly legacyStringKey?: string;
}

type Copy = readonly [title: string, body: string];

const five = (
  en: Copy,
  ko: Copy,
  ja: Copy,
  zh: Copy,
  id: Copy,
): readonly DefaultTranslation[] => [
  {locale: 'en', title: en[0], body: en[1]},
  {locale: 'ko', title: ko[0], body: ko[1]},
  {locale: 'ja', title: ja[0], body: ja[1]},
  {locale: 'zh', title: zh[0], body: zh[1]},
  {locale: 'id', title: id[0], body: id[1]},
];

const launchedAt = Date.UTC(2026, 7, 29, 0, 0, 0);

export const DEFAULT_APP_CONTENT = [
  {
    key: 'welcome-to-new-bookoo',
    kind: 'NOTICE',
    sortOrder: 10,
    pinned: true,
    publishedAt: launchedAt,
    translations: five(
      [
        'A new BooKoo, built to share again',
        'BooKoo has been rebuilt as a new app for private shared ledgers. It keeps the fast calendar, shared entries, receipts, comments, and statistics people valued in the original app, with a new account and security foundation. This is a separate installation using dev.hyo.bookoo, not an automatic update of the app removed years ago. Existing-app recovery will be offered only through a verified migration flow.',
      ],
      [
        '다시 함께 쓰는, 새로운 BooKoo',
        'BooKoo가 팀·모임·여행·가족처럼 여럿이 함께 쓰는 비공개 가계부로 새롭게 만들어졌어요. 예전 앱에서 사랑받았던 빠른 달력, 공유 내역, 영수증, 댓글과 통계는 살리고 계정과 보안 기반은 새로 설계했습니다. dev.hyo.bookoo로 출시되는 별도 앱이며, 수년 전에 내려간 앱의 자동 업데이트가 아닙니다. 과거 계정 연결은 본인 확인을 거치는 안전한 복구 절차로만 제공할 예정이에요.',
      ],
      [
        'もう一度一緒に使う、新しいBooKoo',
        'BooKooは、チーム・サークル・旅行・家族など、みんなで使う非公開の共有家計簿として作り直されました。旧アプリの素早いカレンダー、共有記録、レシート、コメント、統計を活かしつつ、アカウントとセキュリティ基盤を刷新しています。dev.hyo.bookooとして公開する別アプリで、数年前に配信終了したアプリの自動更新ではありません。旧アカウントの接続は、本人確認を伴う安全な移行手順でのみ提供します。',
      ],
      [
        '重新一起记账，全新的 BooKoo',
        'BooKoo 已重建为供团队、社团、旅行、家人等一起使用的私密共享账本。我们保留了旧应用中快捷的日历、共享记录、票据、评论和统计，同时重做了账户与安全基础。它将以 dev.hyo.bookoo 作为独立新应用发布，并不是多年前下架应用的自动更新。旧账户只会通过经过身份验证的安全迁移流程连接。',
      ],
      [
        'BooKoo baru untuk mencatat bersama lagi',
        'BooKoo dibangun ulang sebagai buku kas bersama yang privat untuk tim, komunitas, perjalanan, dan keluarga. Kalender cepat, catatan bersama, struk, komentar, dan statistik dari aplikasi lama dipertahankan dengan fondasi akun dan keamanan yang baru. Ini adalah aplikasi terpisah dengan identitas dev.hyo.bookoo, bukan pembaruan otomatis aplikasi yang diturunkan bertahun-tahun lalu. Pemulihan akun lama hanya akan tersedia melalui alur migrasi dengan verifikasi identitas.',
      ],
    ),
  },
  {
    key: 'free-and-pro-launch',
    kind: 'NOTICE',
    sortOrder: 20,
    pinned: false,
    publishedAt: launchedAt,
    translations: five(
      [
        'Free for everyday records, Pro for more ledgers and more people',
        'Free includes a complete first ledger, unlimited income and expense entries, photos, comments, statistics, export, and access to your own data. A restrained non-personalized banner may appear directly below the main tabs. A new ledger holds two members on Free. Pro removes ads for the owner and invited members, unlocks additional ledgers, and supports up to five people in each new ledger. One owner subscribes and every ledger they own is covered; invited members are not charged per seat.',
      ],
      [
        '매일의 기록은 Free, 가계부와 인원을 늘릴 때 Pro',
        'Free에서도 첫 가계부, 수입·지출 기록, 사진, 댓글, 통계, 내보내기와 내 데이터 접근을 온전히 이용할 수 있어요. 메인 탭 바로 아래에는 절제된 비개인 맞춤형 배너가 표시될 수 있습니다. 새 가계부는 Free에서 2명까지 함께 쓸 수 있어요. Pro는 소유자와 초대된 멤버 모두의 광고를 없애고, 가계부를 추가로 만들 수 있으며 새 가계부마다 최대 5명이 함께 쓸 수 있습니다. 소유자가 한 번 구독하면 그 소유자의 가계부 전체에 적용되고, 초대 멤버에게 좌석별 요금을 받지 않아요.',
      ],
      [
        '毎日の記録はFree、家計簿と人数を増やすならPro',
        'Freeでも最初の家計簿、収支記録、写真、コメント、統計、書き出し、自分のデータへのアクセスをすべて利用できます。メインタブの直下に控えめな非パーソナライズ広告が表示される場合があります。新しい家計簿はFreeでは2人まで共有できます。Proは所有者と招待メンバー全員の広告をなくし、家計簿を追加作成でき、新しい家計簿ごとに最大5人で共有できます。所有者が1つ購読すれば、その所有者の家計簿すべてに適用され、招待メンバーごとの料金はありません。',
      ],
      [
        '日常记录用 Free，增加账本和成员用 Pro',
        'Free 包含第一个完整账本、无限收支记录、照片、评论、统计、导出以及对本人数据的完整访问。主标签栏正下方可能显示克制的非个性化横幅广告。新账本在 Free 下可由两人共享。Pro 会为所有者和受邀成员移除广告，允许创建更多账本，并让每个新账本最多由五人共享。所有者订阅一次即覆盖其名下的所有账本，不会按受邀成员人数收费。',
      ],
      [
        'Free untuk catatan harian, Pro untuk lebih banyak buku kas dan anggota',
        'Free mencakup buku kas pertama yang lengkap, catatan pemasukan dan pengeluaran tanpa batas, foto, komentar, statistik, ekspor, serta akses ke data Anda sendiri. Banner nonpersonalisasi yang sederhana dapat muncul tepat di bawah tab utama. Buku kas baru memuat dua anggota pada Free. Pro menghapus iklan bagi pemilik dan anggota undangan, membuka buku kas tambahan, dan mendukung hingga lima orang di setiap buku kas baru. Satu langganan pemilik mencakup semua buku kas miliknya; anggota undangan tidak dikenai biaya per kursi.',
      ],
    ),
  },
  {
    key: 'privacy-and-control',
    kind: 'NOTICE',
    sortOrder: 30,
    pinned: false,
    publishedAt: launchedAt,
    translations: five(
      [
        'Your ledger stays private to its members',
        'Amounts, memos, comments, locations, and receipt photos are visible only to current members of that ledger. BooKoo does not connect to a bank, sell financial data, or send ledger content to advertising or subscription providers. Privacy, Terms, export, blocked accounts, and withdrawal guidance are available in Settings.',
      ],
      [
        '가계부 내용은 멤버 안에서만',
        '금액, 메모, 댓글, 장소와 영수증 사진은 해당 가계부의 현재 멤버만 볼 수 있어요. BooKoo는 은행에 연결하지 않고 금융 데이터를 판매하지 않으며, 가계부 내용을 광고사나 구독 처리업체에 보내지 않습니다. 개인정보처리방침, 이용약관, 내보내기, 차단 계정과 탈퇴 안내는 설정에서 확인할 수 있어요.',
      ],
      [
        '家計簿の内容はメンバーだけに',
        '金額、メモ、コメント、場所、レシート写真を見られるのは、その家計簿の現在のメンバーだけです。BooKooは銀行と接続せず、金融データを販売せず、家計簿内容を広告会社や購読処理会社へ送りません。プライバシー、利用規約、書き出し、ブロック済みアカウント、退会案内は設定で確認できます。',
      ],
      [
        '账本内容仅限成员查看',
        '金额、备注、评论、地点和票据照片仅对该账本的当前成员可见。BooKoo 不连接银行、不出售财务数据，也不会把账本内容发送给广告或订阅服务商。隐私政策、服务条款、数据导出、已屏蔽账户和注销说明可在设置中查看。',
      ],
      [
        'Isi buku kas hanya untuk anggotanya',
        'Jumlah, memo, komentar, lokasi, dan foto struk hanya terlihat oleh anggota buku kas saat ini. BooKoo tidak terhubung ke bank, tidak menjual data keuangan, dan tidak mengirim isi buku kas ke penyedia iklan atau langganan. Privasi, Ketentuan, ekspor, akun yang diblokir, dan panduan keluar tersedia di Pengaturan.',
      ],
    ),
  },
  {
    key: 'faq-what-is-bookoo',
    kind: 'FAQ',
    sortOrder: 10,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_11',
    translations: five(
      [
        'What is BooKoo?',
        'BooKoo is a private manual ledger for recording income and expenses alone or with people you trust. It focuses on fast entry, a calendar and timeline, useful statistics, receipt photos, comments, and clear member roles. It is not a bank, money-transfer service, tax service, or automatic account aggregator.',
      ],
      [
        'BooKoo는 어떤 앱인가요?',
        'BooKoo는 혼자 또는 믿는 사람들과 수입·지출을 직접 기록하는 비공개 가계부예요. 빠른 입력, 달력과 타임라인, 보기 쉬운 통계, 영수증 사진, 댓글과 명확한 멤버 역할에 집중합니다. 은행, 송금, 세무 서비스나 자동 계좌 연동 앱은 아니에요.',
      ],
      [
        'BooKooはどんなアプリですか？',
        'BooKooは、一人または信頼する人と収支を手入力する非公開の家計簿です。素早い入力、カレンダーとタイムライン、見やすい統計、レシート写真、コメント、明確なメンバー権限に重点を置いています。銀行、送金、税務、口座自動連携サービスではありません。',
      ],
      [
        'BooKoo 是什么应用？',
        'BooKoo 是一款可独自或与信任的人一起手动记录收支的私密账本。它专注于快速录入、日历与时间线、实用统计、票据照片、评论和清晰的成员权限。它不是银行、转账、税务或自动账户聚合服务。',
      ],
      [
        'Apa itu BooKoo?',
        'BooKoo adalah buku kas manual privat untuk mencatat pemasukan dan pengeluaran sendiri atau bersama orang tepercaya. Fokusnya adalah pencatatan cepat, kalender dan linimasa, statistik yang jelas, foto struk, komentar, dan peran anggota. BooKoo bukan bank, layanan transfer, pajak, atau penghubung rekening otomatis.',
      ],
    ),
  },
  {
    key: 'faq-create-ledger',
    kind: 'FAQ',
    sortOrder: 20,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_2',
    translations: five(
      [
        'How do I create a ledger?',
        'Open the ledger drawer and choose New ledger. Give it a name, base currency, time zone, and color, then save. Free includes your first ledger. If you later create another shared ledger, BooKoo explains the relevant Pro capability before asking you to choose a plan.',
      ],
      [
        '가계부는 어떻게 만드나요?',
        '가계부 서랍을 열고 새 가계부를 선택하세요. 이름, 기준 통화, 시간대와 색상을 정해 저장하면 됩니다. Free에는 첫 가계부가 포함돼요. 이후 두 번째 공유 가계부를 만들 때는 BooKoo가 필요한 Pro 기능을 먼저 설명한 뒤 플랜 선택 화면을 보여줍니다.',
      ],
      [
        '家計簿はどう作りますか？',
        '家計簿ドロワーを開き、「新しい家計簿」を選びます。名前、基準通貨、タイムゾーン、色を決めて保存してください。Freeには最初の家計簿が含まれます。2つ目の共有家計簿を作る際は、必要なPro機能を説明してからプラン選択を表示します。',
      ],
      [
        '如何创建账本？',
        '打开账本抽屉并选择“新建账本”，设置名称、基础货币、时区和颜色后保存。Free 包含第一个账本。以后创建第二个共享账本时，BooKoo 会先说明相关 Pro 功能，再显示套餐选择。',
      ],
      [
        'Bagaimana membuat buku kas?',
        'Buka laci buku kas dan pilih Buku kas baru. Tentukan nama, mata uang dasar, zona waktu, dan warna, lalu simpan. Free mencakup buku kas pertama. Saat membuat buku kas bersama kedua, BooKoo menjelaskan kemampuan Pro yang diperlukan sebelum menampilkan pilihan paket.',
      ],
    ),
  },
  {
    key: 'faq-add-entry',
    kind: 'FAQ',
    sortOrder: 30,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_5',
    translations: five(
      [
        'How do I record income or an expense?',
        'Tap the add button from Monthly or List, choose Income or Expense, enter the amount, date, category, and optional memo, place, or receipt photos, then save. You can open an existing entry to edit it. Changes appear for authorized members through live sync.',
      ],
      [
        '수입이나 지출은 어떻게 기록하나요?',
        '월별 또는 목록 화면에서 추가 버튼을 누르고 수입이나 지출을 고르세요. 금액, 날짜, 카테고리를 입력하고 필요하면 메모, 장소, 영수증 사진을 더한 뒤 저장합니다. 기존 내역을 열어 수정할 수 있고, 변경 내용은 권한이 있는 멤버에게 실시간으로 동기화돼요.',
      ],
      [
        '収入や支出はどう記録しますか？',
        '月別または一覧画面の追加ボタンから収入か支出を選び、金額、日付、カテゴリを入力します。必要ならメモ、場所、レシート写真を追加して保存してください。既存の記録は開いて編集でき、変更は権限のあるメンバーへリアルタイム同期されます。',
      ],
      [
        '如何记录收入或支出？',
        '在月历或列表页面点击添加按钮，选择收入或支出，填写金额、日期和分类；也可添加备注、地点或票据照片，然后保存。现有记录可以打开编辑，变更会实时同步给有权限的成员。',
      ],
      [
        'Bagaimana mencatat pemasukan atau pengeluaran?',
        'Ketuk tombol tambah dari Bulanan atau Daftar, pilih Pemasukan atau Pengeluaran, isi jumlah, tanggal, dan kategori. Tambahkan memo, lokasi, atau foto struk bila perlu, lalu simpan. Catatan lama dapat diedit dan perubahan disinkronkan langsung kepada anggota yang berwenang.',
      ],
    ),
  },
  {
    key: 'faq-invite-members',
    kind: 'FAQ',
    sortOrder: 40,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_6',
    translations: five(
      [
        'How do I invite someone?',
        'Open the ledger’s More tab, choose Members or Invite links, create a private invitation, and share it only with the intended person. Anyone holding an active link may be able to request or obtain access, so revoke links you no longer need. Accepting an invitation is never placed behind a paywall.',
      ],
      [
        '다른 사람은 어떻게 초대하나요?',
        '가계부의 더보기 탭에서 멤버 또는 초대 링크를 열고 비공개 초대를 만든 뒤 초대할 사람에게만 공유하세요. 활성 링크를 가진 사람은 접근을 요청하거나 참여할 수 있으므로 필요 없는 링크는 폐기해야 해요. 초대를 수락하는 기능은 유료로 막지 않습니다.',
      ],
      [
        'ほかの人をどう招待しますか？',
        '家計簿の「その他」タブでメンバーまたは招待リンクを開き、非公開の招待を作成して対象者だけに共有します。有効なリンクを持つ人はアクセスを申請または取得できるため、不要なリンクは取り消してください。招待の承認が有料になることはありません。',
      ],
      [
        '如何邀请其他人？',
        '在账本的“更多”标签中打开成员或邀请链接，创建私密邀请并只分享给目标人员。持有有效链接的人可能可以申请或获得访问权限，因此不再使用的链接应及时撤销。接受邀请不会被付费墙阻挡。',
      ],
      [
        'Bagaimana mengundang seseorang?',
        'Buka tab Lainnya pada buku kas, pilih Anggota atau Tautan undangan, buat undangan privat, lalu bagikan hanya kepada orang yang dituju. Pemegang tautan aktif mungkin dapat meminta atau memperoleh akses, jadi cabut tautan yang tidak diperlukan. Menerima undangan tidak pernah dibatasi paywall.',
      ],
    ),
  },
  {
    key: 'faq-member-roles',
    kind: 'FAQ',
    sortOrder: 50,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_7',
    translations: five(
      [
        'Who can invite or manage members?',
        'The Owner controls ownership and destructive ledger actions. Owners and Administrators can manage members and ledger settings according to the permission shown in the app. Members can add and edit permitted records, while Viewers can read without changing the ledger. BooKoo checks these roles again on the server for every protected action.',
      ],
      [
        '누가 멤버를 초대하고 관리할 수 있나요?',
        '소유자는 소유권과 가계부의 삭제 같은 중요한 작업을 관리합니다. 소유자와 관리자는 앱에 표시된 권한에 따라 멤버와 가계부 설정을 관리할 수 있어요. 멤버는 허용된 내역을 추가·수정하고, 뷰어는 내용을 바꾸지 않고 읽습니다. 보호된 작업마다 서버에서 역할을 다시 확인해요.',
      ],
      [
        '誰がメンバーを招待・管理できますか？',
        '所有者は所有権や家計簿削除など重要な操作を管理します。所有者と管理者は、アプリに表示された権限に従ってメンバーと家計簿設定を管理できます。メンバーは許可された記録を追加・編集し、閲覧者は変更せずに読みます。保護された操作ごとにサーバーで権限を再確認します。',
      ],
      [
        '谁可以邀请或管理成员？',
        '所有者负责所有权和删除账本等重要操作。所有者与管理员可按照应用中显示的权限管理成员和账本设置。成员可以添加和编辑获准的记录，查看者只能阅读而不能修改。每个受保护操作都会在服务器端再次验证角色。',
      ],
      [
        'Siapa yang dapat mengundang atau mengelola anggota?',
        'Pemilik mengendalikan kepemilikan dan tindakan penting seperti menghapus buku kas. Pemilik dan Administrator dapat mengelola anggota serta pengaturan sesuai izin yang ditampilkan. Anggota dapat menambah dan mengedit catatan yang diizinkan, sedangkan Pelihat hanya membaca. Peran diperiksa kembali oleh server pada setiap tindakan terlindungi.',
      ],
    ),
  },
  {
    key: 'faq-use-other-devices',
    kind: 'FAQ',
    sortOrder: 60,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_9',
    translations: five(
      [
        'Can I use BooKoo on another device?',
        'Yes. Sign in with the same verified account and your authorized ledgers sync from the server. Device-only preferences such as the local app-lock PIN and biometrics must be configured again. Never share a one-time code, password, or invitation link with someone claiming to restore your account.',
      ],
      [
        '다른 기기에서도 사용할 수 있나요?',
        '네. 같은 본인 확인 계정으로 로그인하면 접근 권한이 있는 가계부가 서버에서 동기화돼요. 기기에만 저장되는 앱 잠금 PIN과 생체 인증 설정은 새 기기에서 다시 해야 합니다. 계정 복구를 해 준다는 사람에게 일회용 코드, 비밀번호나 초대 링크를 공유하지 마세요.',
      ],
      [
        '別の端末でも使えますか？',
        'はい。同じ確認済みアカウントでサインインすると、権限のある家計簿がサーバーから同期されます。端末だけに保存されるアプリロックPINと生体認証は再設定が必要です。復旧を名乗る相手にワンタイムコード、パスワード、招待リンクを共有しないでください。',
      ],
      [
        '可以在其他设备上使用吗？',
        '可以。使用同一个已验证账户登录后，有权限的账本会从服务器同步。仅保存在设备上的应用锁 PIN 和生物识别需要重新设置。不要向声称可以恢复账户的人分享一次性验证码、密码或邀请链接。',
      ],
      [
        'Bisakah BooKoo digunakan di perangkat lain?',
        'Bisa. Masuk dengan akun terverifikasi yang sama dan buku kas yang diizinkan akan disinkronkan dari server. PIN kunci aplikasi dan biometrik yang hanya tersimpan di perangkat harus diatur kembali. Jangan bagikan kode sekali pakai, kata sandi, atau tautan undangan kepada orang yang mengaku dapat memulihkan akun.',
      ],
    ),
  },
  {
    key: 'faq-free-and-pro',
    kind: 'FAQ',
    sortOrder: 70,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_3',
    translations: five(
      [
        'What is the difference between Free and Pro?',
        'Free is a complete first ledger with manual entries, calendar, categories, basic statistics, and access to your own data; it may show a non-personalized banner. Pro removes ads for the owner and invited members and unlocks the shared-ledger limits and advanced collaboration tools listed on the Pro screen. Prices and trial terms shown in BooKoo come directly from the App Store or Google Play.',
      ],
      [
        'Free와 Pro는 무엇이 다른가요?',
        'Free는 첫 가계부, 직접 입력, 달력, 카테고리, 기본 통계와 내 데이터 접근을 온전히 제공하며 비개인 맞춤형 배너가 보일 수 있어요. Pro는 소유자와 초대 멤버의 광고를 없애고 Pro 화면에 표시된 공유 가계부 한도와 고급 협업 기능을 엽니다. BooKoo에 표시되는 가격과 체험 조건은 App Store 또는 Google Play에서 직접 받아옵니다.',
      ],
      [
        'FreeとProの違いは何ですか？',
        'Freeは最初の家計簿、手入力、カレンダー、カテゴリ、基本統計、自分のデータへのアクセスをすべて提供し、非パーソナライズ広告が表示される場合があります。Proは所有者と招待メンバーの広告をなくし、Pro画面に記載された共有家計簿の上限と高度な共同作業機能を利用できます。価格と体験条件はApp StoreまたはGoogle Playから直接取得します。',
      ],
      [
        'Free 和 Pro 有什么区别？',
        'Free 提供完整的第一个账本、手动录入、日历、分类、基础统计和本人数据访问，并可能显示非个性化横幅。Pro 会为所有者和受邀成员移除广告，并解锁 Pro 页面所列的共享账本额度和高级协作功能。BooKoo 显示的价格与试用条件直接来自 App Store 或 Google Play。',
      ],
      [
        'Apa perbedaan Free dan Pro?',
        'Free menyediakan buku kas pertama yang lengkap, entri manual, kalender, kategori, statistik dasar, dan akses ke data Anda; banner nonpersonalisasi dapat ditampilkan. Pro menghapus iklan bagi pemilik serta anggota undangan dan membuka batas buku kas bersama serta alat kolaborasi lanjutan di layar Pro. Harga dan uji coba berasal langsung dari App Store atau Google Play.',
      ],
    ),
  },
  {
    key: 'faq-restore-purchase',
    kind: 'FAQ',
    sortOrder: 80,
    pinned: false,
    publishedAt: launchedAt,
    translations: five(
      [
        'How do I restore Pro?',
        'Open BooKoo Pro and choose Restore purchases while signed in to the same store account used for the subscription. BooKoo verifies the store result and then reconciles it with the server. Restore never creates a new charge. If no previous purchase is found, the screen says so without changing your access.',
      ],
      [
        'Pro 구매는 어떻게 복원하나요?',
        '구독에 사용한 동일한 스토어 계정으로 로그인한 상태에서 BooKoo Pro를 열고 구매 복원을 선택하세요. BooKoo가 스토어 결과를 확인한 뒤 서버 상태와 맞춥니다. 복원은 새 결제를 만들지 않아요. 이전 구매가 없으면 접근 권한을 바꾸지 않고 찾지 못했다는 안내만 표시합니다.',
      ],
      [
        'Proの購入を復元するには？',
        '購読に使用した同じストアアカウントでサインインし、BooKoo Proの「購入を復元」を選びます。ストア結果を確認してサーバー状態と照合します。復元で新しい請求は発生しません。以前の購入がなければ、権限を変更せず見つからなかったことを表示します。',
      ],
      [
        '如何恢复 Pro？',
        '使用订阅时的同一个商店账户登录，打开 BooKoo Pro 并选择“恢复购买”。BooKoo 会验证商店结果并与服务器状态核对。恢复不会产生新收费。如果未找到历史购买，页面只会提示未找到，不会改变访问权限。',
      ],
      [
        'Bagaimana memulihkan Pro?',
        'Masuk dengan akun toko yang sama seperti saat berlangganan, buka BooKoo Pro, lalu pilih Pulihkan pembelian. BooKoo memverifikasi hasil toko dan mencocokkannya dengan server. Pemulihan tidak membuat tagihan baru. Jika tidak ada pembelian lama, akses tidak berubah dan layar memberi tahu bahwa pembelian tidak ditemukan.',
      ],
    ),
  },
  {
    key: 'faq-account-deletion',
    kind: 'FAQ',
    sortOrder: 90,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_1',
    translations: five(
      [
        'How do I leave BooKoo?',
        'Open Settings, Account, then Leave BooKoo. A 30-day recovery period starts after confirmation.',
      ],
      [
        '회원 탈퇴는 어떻게 하나요?',
        '설정 > 계정 > 탈퇴하기에서 확인하세요. 확인 후 30일 복구 기간이 시작됩니다.',
      ],
      [
        'BooKooを退会するには？',
        '「設定」→「アカウント」→「退会する」で確認します。確認後、30日間の復旧期間が始まります。',
      ],
      [
        '如何退出 BooKoo？',
        '打开“设置”>“账户”>“退出 BooKoo”并确认。确认后进入 30 天恢复期。',
      ],
      [
        'Bagaimana keluar dari BooKoo?',
        'Buka Pengaturan > Akun > Keluar dari BooKoo lalu konfirmasikan. Masa pemulihan 30 hari dimulai setelah konfirmasi.',
      ],
    ),
  },
  {
    key: 'faq-data-privacy',
    kind: 'FAQ',
    sortOrder: 100,
    pinned: false,
    publishedAt: launchedAt,
    translations: five(
      [
        'Who can see my ledger data?',
        'Only current members authorized for that ledger can see its entries, memos, comments, locations, and receipts. BooKoo does not sell financial content or use it to target ads.',
      ],
      [
        '내 가계부 데이터는 누가 볼 수 있나요?',
        '해당 가계부에 권한이 있는 현재 멤버만 내역, 메모, 댓글, 장소와 영수증을 볼 수 있어요. BooKoo는 금융 내용을 판매하거나 광고 타기팅에 사용하지 않습니다.',
      ],
      [
        '家計簿データは誰が見られますか？',
        'その家計簿で権限を持つ現在のメンバーだけが、記録、メモ、コメント、場所、レシートを見られます。BooKooは金融内容を販売したり広告のターゲティングに使ったりしません。',
      ],
      [
        '谁能看到我的账本数据？',
        '只有该账本中当前获得授权的成员才能查看记录、备注、评论、地点和票据。BooKoo 不出售财务内容，也不将其用于广告定向。',
      ],
      [
        'Siapa yang dapat melihat data buku kas saya?',
        'Hanya anggota saat ini yang berwenang pada buku kas tersebut yang dapat melihat entri, memo, komentar, lokasi, dan struk. BooKoo tidak menjual isi keuangan atau menggunakannya untuk penargetan iklan.',
      ],
    ),
  },
  {
    key: 'faq-old-app',
    kind: 'FAQ',
    sortOrder: 110,
    pinned: false,
    publishedAt: launchedAt,
    translations: five(
      [
        'Is this an update of the old BooKoo app?',
        'No. The BooKoo app removed years ago used a different package and is reference material only. The new app launches separately as dev.hyo.bookoo with new store, authentication, privacy, subscription, and backend records. Do not install or restore the old listing expecting it to update into this app. Any supported legacy recovery will verify identity and explain exactly what is imported.',
      ],
      [
        '예전 BooKoo 앱의 업데이트인가요?',
        '아니요. 수년 전에 내려간 BooKoo는 다른 패키지를 사용한 과거 참고 앱입니다. 새 앱은 dev.hyo.bookoo로 스토어, 인증, 개인정보, 구독과 백엔드를 모두 새로 만들어 별도 출시해요. 예전 목록을 설치하거나 복원해 이 앱으로 업데이트될 것이라고 기대하면 안 됩니다. 지원되는 과거 데이터 복구는 본인을 확인하고 가져오는 내용을 정확히 안내한 뒤 진행합니다.',
      ],
      [
        '旧BooKooアプリのアップデートですか？',
        'いいえ。数年前に配信終了したBooKooは別のパッケージを使う参考用の旧アプリです。新アプリはdev.hyo.bookooとして、ストア、認証、プライバシー、購読、バックエンドを新しく用意して別途公開します。旧掲載を復元してこのアプリへ更新されることはありません。対応する旧データ復旧は本人確認と取り込み内容の説明後に行います。',
      ],
      [
        '这是旧 BooKoo 应用的更新吗？',
        '不是。多年前下架的 BooKoo 使用不同的软件包，只作为历史参考。新应用将以 dev.hyo.bookoo 独立发布，并使用全新的商店、认证、隐私、订阅和后端记录。不要恢复旧应用并期待它更新为本应用。任何受支持的旧数据恢复都会先验证身份并明确说明导入内容。',
      ],
      [
        'Apakah ini pembaruan aplikasi BooKoo lama?',
        'Bukan. BooKoo yang diturunkan bertahun-tahun lalu memakai paket berbeda dan hanya menjadi referensi historis. Aplikasi baru dirilis terpisah sebagai dev.hyo.bookoo dengan catatan toko, autentikasi, privasi, langganan, dan backend yang baru. Jangan memulihkan daftar lama dengan harapan berubah menjadi aplikasi ini. Pemulihan data lama yang didukung akan memverifikasi identitas dan menjelaskan data yang diimpor.',
      ],
    ),
  },
  {
    key: 'faq-bookoo-difference',
    kind: 'FAQ',
    sortOrder: 15,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_10',
    translations: five(
      [
        'Why was BooKoo created, and what makes it different?',
        'BooKoo began with a simple problem: families, couples, friends, and groups often need the same transparent record of shared money, not one person’s private spreadsheet. It is an invite-only manual ledger where authorized members see the same entries, receipts, and discussion. BooKoo does not connect to a bank or move money, so people stay in control of what they record and share.',
      ],
      [
        'BooKoo는 왜 만들었고 무엇이 다른가요?',
        '가족, 연인, 친구와 모임의 돈을 한 사람만 관리하는 대신 모두가 같은 기록을 투명하게 확인할 수 있어야 한다는 문제에서 시작했어요. BooKoo는 초대받은 멤버가 같은 내역, 영수증과 대화를 보는 직접 입력 방식의 비공개 가계부입니다. 은행에 연결하거나 돈을 옮기지 않으므로 무엇을 기록하고 공유할지는 사용자가 직접 통제해요.',
      ],
      [
        'BooKooを作った理由と、ほかとの違いは？',
        '家族、パートナー、友人、グループのお金を一人だけが管理するのではなく、全員が同じ透明な記録を確認できるようにするために始まりました。招待されたメンバーが同じ記録、レシート、会話を見る手入力の非公開家計簿です。銀行接続や送金はなく、何を記録・共有するかを利用者が管理します。',
      ],
      [
        '为什么创建 BooKoo，它有什么不同？',
        'BooKoo 源于一个简单需求：家庭、伴侣、朋友和团体需要共同查看透明的资金记录，而不是只由一个人保管。它是仅限邀请、手动录入的私密账本，授权成员会看到相同的记录、票据和讨论。BooKoo 不连接银行也不转账，记录与分享什么始终由用户控制。',
      ],
      [
        'Mengapa BooKoo dibuat dan apa bedanya?',
        'BooKoo berawal dari kebutuhan agar keluarga, pasangan, teman, dan kelompok dapat melihat catatan uang bersama yang sama dan transparan, bukan hanya catatan pribadi satu orang. Ini buku kas manual privat berbasis undangan; anggota berwenang melihat entri, struk, dan diskusi yang sama. BooKoo tidak terhubung ke bank atau memindahkan uang, sehingga pengguna tetap mengendalikan apa yang dicatat dan dibagikan.',
      ],
    ),
  },
  {
    key: 'faq-ledger-and-entry',
    kind: 'FAQ',
    sortOrder: 25,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_4',
    translations: five(
      [
        'What is the difference between a ledger and an entry?',
        'A ledger is the shared book: it owns the members, base currency, time zone, categories, and settings. An entry is one income or expense record inside that ledger, with an amount, date, category, and optional memo, place, receipt, and comments. Changing a ledger setting can affect how many entries are organized or displayed; editing an entry changes only that record.',
      ],
      [
        '가계부와 내역은 어떻게 다른가요?',
        '가계부는 멤버, 기준 통화, 시간대, 카테고리와 설정을 담는 한 권의 공유 장부예요. 내역은 그 안에 기록하는 수입 또는 지출 한 건으로, 금액, 날짜, 카테고리와 선택적인 메모, 장소, 영수증, 댓글을 가집니다. 가계부 설정 변경은 여러 내역의 정리나 표시에 영향을 줄 수 있지만, 내역 수정은 그 기록 한 건만 바꿔요.',
      ],
      [
        '家計簿と記録の違いは何ですか？',
        '家計簿はメンバー、基準通貨、タイムゾーン、カテゴリ、設定を持つ共有の一冊です。記録はその中の収入または支出一件で、金額、日付、カテゴリと任意のメモ、場所、レシート、コメントを持ちます。家計簿設定は複数記録の整理や表示に影響しますが、記録の編集はその一件だけを変更します。',
      ],
      [
        '账本和记录有什么区别？',
        '账本是一本共享的账，包含成员、基础货币、时区、分类和设置。记录是账本中的一笔收入或支出，包含金额、日期、分类，以及可选的备注、地点、票据和评论。更改账本设置可能影响多笔记录的组织或显示；编辑记录只会改变该笔内容。',
      ],
      [
        'Apa perbedaan buku kas dan entri?',
        'Buku kas adalah catatan bersama yang memiliki anggota, mata uang dasar, zona waktu, kategori, dan pengaturan. Entri adalah satu pemasukan atau pengeluaran di dalamnya, dengan jumlah, tanggal, kategori, serta memo, lokasi, struk, dan komentar opsional. Perubahan pengaturan buku kas dapat memengaruhi susunan banyak entri; mengedit entri hanya mengubah catatan tersebut.',
      ],
    ),
  },
  {
    key: 'faq-send-feedback',
    kind: 'FAQ',
    sortOrder: 65,
    pinned: false,
    publishedAt: launchedAt,
    legacyStringKey: 'FAQ_8',
    translations: five(
      [
        'How do I contact BooKoo?',
        'Open Settings, then Customer inquiry, and tap Email inquiry.',
      ],
      [
        'BooKoo에 문의하려면 어떻게 하나요?',
        '설정에서 고객 문의를 열고 이메일 문의를 누르세요.',
      ],
      [
        'BooKooに問い合わせるには？',
        '「設定」から「お問い合わせ」を開き、「メールで問い合わせ」をタップしてください。',
      ],
      ['如何联系 BooKoo？', '打开“设置”中的“客户咨询”，然后点击“邮件咨询”。'],
      [
        'Bagaimana menghubungi BooKoo?',
        'Buka Pengaturan > Hubungi kami, lalu ketuk Tanya lewat email.',
      ],
    ),
  },
] as const satisfies readonly DefaultAppContent[];
