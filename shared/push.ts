import {SUPPORTED_LOCALES, type SupportedLocale} from './locales';
import {formatMoney} from './money';

export const PUSH_LOCALES = SUPPORTED_LOCALES;
export type PushLocale = SupportedLocale;

export const INBOX_PUSH_KINDS = [
  'LEDGER_INVITE',
  'JOIN_REQUESTED',
  'JOIN_APPROVED',
  'MEMBER_JOINED',
  'MEMBER_LEFT',
  'MEMBER_REMOVED',
  'ROLE_CHANGED',
  'OWNERSHIP_TRANSFERRED',
  'LEDGER_ARCHIVED',
  'COMMENT_ADDED',
  'LEGACY_CLAIMED',
  'ANNOUNCEMENT',
  'SYSTEM',
] as const;

export type InboxPushKind = (typeof INBOX_PUSH_KINDS)[number];
export type PushChannel =
  | 'ledger-activity'
  | 'ledger-social'
  | 'ledger-governance';

export const isInboxPushKind = (value: string): value is InboxPushKind =>
  (INBOX_PUSH_KINDS as readonly string[]).includes(value);

const copy: Record<PushLocale, {readonly title: (ledger: string) => string; readonly separator: string}> = {
  vi: {title: (ledger) => `Giao dịch mới trong ${ledger}`, separator: ' · '},
  ko: {title: (ledger) => `${ledger}에 새 내역이 추가됐어요`, separator: ' · '},
  en: {title: (ledger) => `New entry in ${ledger}`, separator: ' · '},
  ja: {title: (ledger) => `${ledger}に新しい記録があります`, separator: ' · '},
  zh: {title: (ledger) => `${ledger}中有一条新记录`, separator: ' · '},
  id: {title: (ledger) => `Entri baru di ${ledger}`, separator: ' · '},
  de: {title: (ledger) => `Neuer Eintrag in ${ledger}`, separator: ' · '},
  es: {title: (ledger) => `Nuevo registro en ${ledger}`, separator: ' · '},
  fr: {title: (ledger) => `Nouvelle écriture dans ${ledger}`, separator: ' · '},
  it: {title: (ledger) => `Nuova voce in ${ledger}`, separator: ' · '},
  nl: {title: (ledger) => `Nieuwe boeking in ${ledger}`, separator: ' · '},
  pt: {title: (ledger) => `Novo lançamento em ${ledger}`, separator: ' · '},
};

const clean = (value: string, maxLength: number): string =>
  value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);

export const renderItemAddedPush = (input: {
  readonly locale: PushLocale;
  readonly ledgerTitle: string;
  readonly categoryLabel: string;
  readonly amountMinor: number;
  readonly currency: string;
}): {readonly title: string; readonly body: string} => {
  const strings = copy[input.locale];
  const ledger = clean(input.ledgerTitle, 48);
  const category = clean(input.categoryLabel, 48);
  return {
    title: clean(strings.title(ledger), 96),
    body: clean(
      `${formatMoney(
        {amountMinor: input.amountMinor, currency: input.currency},
        input.locale,
        {absolute: true},
      )}${strings.separator}${category}`,
      128,
    ),
  };
};

const inboxCopy: Record<
  PushLocale,
  Record<InboxPushKind, readonly [title: string, body: string]>
> = {
  vi: {
    LEDGER_INVITE: ['Lời mời vào sổ', 'Bạn nhận được lời mời vào một sổ thu chi dùng chung.'],
    JOIN_REQUESTED: ['Yêu cầu tham gia mới', 'Có yêu cầu tham gia mới đang chờ trong sổ của bạn.'],
    JOIN_APPROVED: ['Đã duyệt yêu cầu', 'Yêu cầu tham gia sổ của bạn đã được duyệt.'],
    MEMBER_JOINED: ['Thành viên mới', 'Một thành viên mới đã tham gia sổ.'],
    MEMBER_LEFT: ['Thành viên đã rời sổ', 'Một thành viên đã rời sổ thu chi.'],
    MEMBER_REMOVED: ['Thay đổi tư cách thành viên', 'Tư cách thành viên trong sổ đã thay đổi.'],
    ROLE_CHANGED: ['Đã đổi vai trò', 'Vai trò của bạn trong sổ đã thay đổi.'],
    OWNERSHIP_TRANSFERRED: ['Đã chuyển quyền sở hữu', 'Quyền sở hữu sổ đã được chuyển.'],
    LEDGER_ARCHIVED: ['Đã lưu trữ sổ', 'Một sổ thu chi đã được lưu trữ.'],
    COMMENT_ADDED: ['Bình luận mới', 'Có bình luận mới trên một giao dịch.'],
    LEGACY_CLAIMED: ['Đã khôi phục dữ liệu cũ', 'Dữ liệu BooKoo cũ của bạn đã được liên kết.'],
    ANNOUNCEMENT: ['Tin từ BooKoo', 'Có tin mới từ BooKoo.'],
    SYSTEM: ['Thông báo BooKoo', 'Có thông tin mới về tài khoản của bạn.'],
  },
  ko: {
    LEDGER_INVITE: ['새 가계부 초대', '공유 가계부 초대가 도착했습니다.'],
    JOIN_REQUESTED: ['새 참여 요청', '가계부에 새로운 참여 요청이 있습니다.'],
    JOIN_APPROVED: ['참여 요청 승인', '가계부 참여 요청이 승인되었습니다.'],
    MEMBER_JOINED: ['새 멤버 참여', '가계부에 새 멤버가 참여했습니다.'],
    MEMBER_LEFT: ['멤버 나감', '가계부에서 멤버가 나갔습니다.'],
    MEMBER_REMOVED: ['멤버십 변경', '가계부 멤버십 상태가 변경되었습니다.'],
    ROLE_CHANGED: ['역할 변경', '가계부에서 내 역할이 변경되었습니다.'],
    OWNERSHIP_TRANSFERRED: ['소유권 이전', '가계부 소유권이 이전되었습니다.'],
    LEDGER_ARCHIVED: ['가계부 보관', '가계부가 보관되었습니다.'],
    COMMENT_ADDED: ['새 댓글', '내역에 새 댓글이 추가되었습니다.'],
    LEGACY_CLAIMED: ['이전 데이터 연결 완료', '이전 BooKoo 데이터가 연결되었습니다.'],
    ANNOUNCEMENT: ['BooKoo 공지', '새 공지사항이 있습니다.'],
    SYSTEM: ['BooKoo 알림', '계정에 새로운 안내가 있습니다.'],
  },
  en: {
    LEDGER_INVITE: ['New ledger invite', 'You received an invitation to a shared ledger.'],
    JOIN_REQUESTED: ['New join request', 'A new request is waiting in your ledger.'],
    JOIN_APPROVED: ['Request approved', 'Your request to join the ledger was approved.'],
    MEMBER_JOINED: ['New member', 'A new member joined the ledger.'],
    MEMBER_LEFT: ['Member left', 'A member left the ledger.'],
    MEMBER_REMOVED: ['Membership changed', 'A ledger membership status changed.'],
    ROLE_CHANGED: ['Role changed', 'Your role in a ledger changed.'],
    OWNERSHIP_TRANSFERRED: ['Ownership transferred', 'Ledger ownership was transferred.'],
    LEDGER_ARCHIVED: ['Ledger archived', 'A ledger was archived.'],
    COMMENT_ADDED: ['New comment', 'A new comment was added to an entry.'],
    LEGACY_CLAIMED: ['Previous data restored', 'Your previous BooKoo data is now connected.'],
    ANNOUNCEMENT: ['BooKoo announcement', 'A new announcement is available.'],
    SYSTEM: ['BooKoo update', 'There is a new update for your account.'],
  },
  ja: {
    LEDGER_INVITE: ['家計簿への招待', '共有家計簿への招待が届きました。'],
    JOIN_REQUESTED: ['新しい参加申請', '家計簿に新しい参加申請があります。'],
    JOIN_APPROVED: ['参加申請を承認', '家計簿への参加申請が承認されました。'],
    MEMBER_JOINED: ['新しいメンバー', '家計簿に新しいメンバーが参加しました。'],
    MEMBER_LEFT: ['メンバーが退出', '家計簿からメンバーが退出しました。'],
    MEMBER_REMOVED: ['メンバー状態の変更', '家計簿のメンバー状態が変更されました。'],
    ROLE_CHANGED: ['役割の変更', '家計簿での役割が変更されました。'],
    OWNERSHIP_TRANSFERRED: ['所有権の移行', '家計簿の所有権が移行されました。'],
    LEDGER_ARCHIVED: ['家計簿を保管', '家計簿がアーカイブされました。'],
    COMMENT_ADDED: ['新しいコメント', '記録に新しいコメントが追加されました。'],
    LEGACY_CLAIMED: ['以前のデータを復元', '以前のBooKooデータが接続されました。'],
    ANNOUNCEMENT: ['BooKooのお知らせ', '新しいお知らせがあります。'],
    SYSTEM: ['BooKooからのお知らせ', 'アカウントに新しい案内があります。'],
  },
  zh: {
    LEDGER_INVITE: ['新的账本邀请', '你收到了共享账本邀请。'],
    JOIN_REQUESTED: ['新的加入请求', '账本中有新的加入请求。'],
    JOIN_APPROVED: ['请求已批准', '你的账本加入请求已获批准。'],
    MEMBER_JOINED: ['新成员加入', '一位新成员加入了账本。'],
    MEMBER_LEFT: ['成员已退出', '一位成员退出了账本。'],
    MEMBER_REMOVED: ['成员状态变更', '账本成员状态已变更。'],
    ROLE_CHANGED: ['角色已变更', '你在账本中的角色已变更。'],
    OWNERSHIP_TRANSFERRED: ['所有权已转移', '账本所有权已转移。'],
    LEDGER_ARCHIVED: ['账本已归档', '一个账本已归档。'],
    COMMENT_ADDED: ['新评论', '一条记录收到了新评论。'],
    LEGACY_CLAIMED: ['旧数据已恢复', '你以前的BooKoo数据已连接。'],
    ANNOUNCEMENT: ['BooKoo公告', '有一则新公告。'],
    SYSTEM: ['BooKoo通知', '你的账户有一条新通知。'],
  },
  id: {
    LEDGER_INVITE: ['Undangan buku kas baru', 'Anda menerima undangan ke buku kas bersama.'],
    JOIN_REQUESTED: ['Permintaan bergabung baru', 'Ada permintaan baru di buku kas Anda.'],
    JOIN_APPROVED: ['Permintaan disetujui', 'Permintaan bergabung Anda telah disetujui.'],
    MEMBER_JOINED: ['Anggota baru', 'Anggota baru bergabung ke buku kas.'],
    MEMBER_LEFT: ['Anggota keluar', 'Seorang anggota keluar dari buku kas.'],
    MEMBER_REMOVED: ['Keanggotaan berubah', 'Status keanggotaan buku kas berubah.'],
    ROLE_CHANGED: ['Peran berubah', 'Peran Anda di buku kas telah berubah.'],
    OWNERSHIP_TRANSFERRED: ['Kepemilikan dialihkan', 'Kepemilikan buku kas telah dialihkan.'],
    LEDGER_ARCHIVED: ['Buku kas diarsipkan', 'Sebuah buku kas telah diarsipkan.'],
    COMMENT_ADDED: ['Komentar baru', 'Komentar baru ditambahkan ke entri.'],
    LEGACY_CLAIMED: ['Data lama dipulihkan', 'Data BooKoo lama Anda telah terhubung.'],
    ANNOUNCEMENT: ['Pengumuman BooKoo', 'Ada pengumuman baru.'],
    SYSTEM: ['Pembaruan BooKoo', 'Ada pembaruan baru untuk akun Anda.'],
  },
  de: {
    LEDGER_INVITE: ['Neue Haushaltsbuch-Einladung', 'Sie wurden zu einem gemeinsamen Haushaltsbuch eingeladen.'],
    JOIN_REQUESTED: ['Neue Beitrittsanfrage', 'In Ihrem Haushaltsbuch wartet eine neue Anfrage.'],
    JOIN_APPROVED: ['Anfrage genehmigt', 'Ihre Beitrittsanfrage wurde genehmigt.'],
    MEMBER_JOINED: ['Neues Mitglied', 'Ein neues Mitglied ist dem Haushaltsbuch beigetreten.'],
    MEMBER_LEFT: ['Mitglied ausgetreten', 'Ein Mitglied hat das Haushaltsbuch verlassen.'],
    MEMBER_REMOVED: ['Mitgliedschaft geändert', 'Der Mitgliedsstatus im Haushaltsbuch hat sich geändert.'],
    ROLE_CHANGED: ['Rolle geändert', 'Ihre Rolle im Haushaltsbuch hat sich geändert.'],
    OWNERSHIP_TRANSFERRED: ['Eigentum übertragen', 'Das Eigentum am Haushaltsbuch wurde übertragen.'],
    LEDGER_ARCHIVED: ['Haushaltsbuch archiviert', 'Ein Haushaltsbuch wurde archiviert.'],
    COMMENT_ADDED: ['Neuer Kommentar', 'Ein Eintrag hat einen neuen Kommentar.'],
    LEGACY_CLAIMED: ['Frühere Daten verbunden', 'Ihre früheren BooKoo-Daten sind jetzt verbunden.'],
    ANNOUNCEMENT: ['BooKoo-Mitteilung', 'Es gibt eine neue Mitteilung.'],
    SYSTEM: ['BooKoo-Hinweis', 'Es gibt eine neue Information zu Ihrem Konto.'],
  },
  es: {
    LEDGER_INVITE: ['Nueva invitación al libro de cuentas', 'Has recibido una invitación a un libro de cuentas compartido.'],
    JOIN_REQUESTED: ['Nueva solicitud de unión', 'Hay una solicitud nueva en tu libro de cuentas.'],
    JOIN_APPROVED: ['Solicitud aprobada', 'Tu solicitud para unirte al libro de cuentas fue aprobada.'],
    MEMBER_JOINED: ['Nuevo miembro', 'Un nuevo miembro se unió al libro de cuentas.'],
    MEMBER_LEFT: ['Miembro salió', 'Un miembro salió del libro de cuentas.'],
    MEMBER_REMOVED: ['Membresía cambiada', 'Cambió el estado de un miembro del libro de cuentas.'],
    ROLE_CHANGED: ['Rol cambiado', 'Tu rol en el libro de cuentas cambió.'],
    OWNERSHIP_TRANSFERRED: ['Propiedad transferida', 'Se transfirió la propiedad del libro de cuentas.'],
    LEDGER_ARCHIVED: ['Libro de cuentas archivado', 'Se archivó un libro de cuentas.'],
    COMMENT_ADDED: ['Nuevo comentario', 'Se añadió un comentario a un registro.'],
    LEGACY_CLAIMED: ['Datos anteriores restaurados', 'Tus datos anteriores de BooKoo ya están conectados.'],
    ANNOUNCEMENT: ['Aviso de BooKoo', 'Hay un aviso nuevo.'],
    SYSTEM: ['Actualización de BooKoo', 'Hay una novedad en tu cuenta.'],
  },
  fr: {
    LEDGER_INVITE: ['Nouvelle invitation au livret', 'Vous avez reçu une invitation à un livret de comptes partagé.'],
    JOIN_REQUESTED: ['Nouvelle demande d’adhésion', 'Une nouvelle demande attend dans votre livret.'],
    JOIN_APPROVED: ['Demande acceptée', 'Votre demande d’adhésion au livret a été acceptée.'],
    MEMBER_JOINED: ['Nouveau membre', 'Un nouveau membre a rejoint le livret.'],
    MEMBER_LEFT: ['Membre parti', 'Un membre a quitté le livret.'],
    MEMBER_REMOVED: ['Adhésion modifiée', 'Le statut d’un membre du livret a changé.'],
    ROLE_CHANGED: ['Rôle modifié', 'Votre rôle dans le livret a changé.'],
    OWNERSHIP_TRANSFERRED: ['Propriété transférée', 'La propriété du livret a été transférée.'],
    LEDGER_ARCHIVED: ['Livret archivé', 'Un livret a été archivé.'],
    COMMENT_ADDED: ['Nouveau commentaire', 'Un commentaire a été ajouté à une écriture.'],
    LEGACY_CLAIMED: ['Anciennes données restaurées', 'Vos anciennes données BooKoo sont maintenant liées.'],
    ANNOUNCEMENT: ['Annonce BooKoo', 'Une nouvelle annonce est disponible.'],
    SYSTEM: ['Notification BooKoo', 'Il y a une nouvelle information pour votre compte.'],
  },
  it: {
    LEDGER_INVITE: ['Nuovo invito al libro conti', 'Hai ricevuto un invito a un libro conti condiviso.'],
    JOIN_REQUESTED: ['Nuova richiesta di adesione', 'C’è una nuova richiesta nel tuo libro conti.'],
    JOIN_APPROVED: ['Richiesta approvata', 'La tua richiesta di adesione è stata approvata.'],
    MEMBER_JOINED: ['Nuovo membro', 'Un nuovo membro si è unito al libro conti.'],
    MEMBER_LEFT: ['Membro uscito', 'Un membro ha lasciato il libro conti.'],
    MEMBER_REMOVED: ['Iscrizione modificata', 'Lo stato di un membro del libro conti è cambiato.'],
    ROLE_CHANGED: ['Ruolo modificato', 'Il tuo ruolo nel libro conti è cambiato.'],
    OWNERSHIP_TRANSFERRED: ['Proprietà trasferita', 'La proprietà del libro conti è stata trasferita.'],
    LEDGER_ARCHIVED: ['Libro conti archiviato', 'Un libro conti è stato archiviato.'],
    COMMENT_ADDED: ['Nuovo commento', 'È stato aggiunto un commento a una voce.'],
    LEGACY_CLAIMED: ['Dati precedenti ripristinati', 'I tuoi dati BooKoo precedenti sono ora collegati.'],
    ANNOUNCEMENT: ['Avviso BooKoo', 'C’è un nuovo avviso.'],
    SYSTEM: ['Aggiornamento BooKoo', 'C’è una novità per il tuo account.'],
  },
  nl: {
    LEDGER_INVITE: ['Nieuwe uitnodiging voor huishoudboekje', 'Je hebt een uitnodiging voor een gedeeld huishoudboekje ontvangen.'],
    JOIN_REQUESTED: ['Nieuw deelnameverzoek', 'Er wacht een nieuw verzoek in je huishoudboekje.'],
    JOIN_APPROVED: ['Verzoek goedgekeurd', 'Je verzoek om deel te nemen is goedgekeurd.'],
    MEMBER_JOINED: ['Nieuw lid', 'Een nieuw lid is tot het huishoudboekje toegetreden.'],
    MEMBER_LEFT: ['Lid vertrokken', 'Een lid heeft het huishoudboekje verlaten.'],
    MEMBER_REMOVED: ['Lidmaatschap gewijzigd', 'De lidstatus van het huishoudboekje is gewijzigd.'],
    ROLE_CHANGED: ['Rol gewijzigd', 'Je rol in het huishoudboekje is gewijzigd.'],
    OWNERSHIP_TRANSFERRED: ['Eigendom overgedragen', 'Het eigendom van het huishoudboekje is overgedragen.'],
    LEDGER_ARCHIVED: ['Huishoudboekje gearchiveerd', 'Een huishoudboekje is gearchiveerd.'],
    COMMENT_ADDED: ['Nieuwe reactie', 'Er is een reactie toegevoegd aan een boeking.'],
    LEGACY_CLAIMED: ['Eerdere gegevens hersteld', 'Je eerdere BooKoo-gegevens zijn nu gekoppeld.'],
    ANNOUNCEMENT: ['BooKoo-bericht', 'Er is een nieuw bericht.'],
    SYSTEM: ['BooKoo-update', 'Er is een nieuwe melding voor je account.'],
  },
  pt: {
    LEDGER_INVITE: ['Novo convite para o livro de contas', 'Recebeu um convite para um livro de contas partilhado.'],
    JOIN_REQUESTED: ['Novo pedido de adesão', 'Há um novo pedido no seu livro de contas.'],
    JOIN_APPROVED: ['Pedido aprovado', 'O seu pedido para aderir ao livro de contas foi aprovado.'],
    MEMBER_JOINED: ['Novo membro', 'Um novo membro entrou no livro de contas.'],
    MEMBER_LEFT: ['Membro saiu', 'Um membro saiu do livro de contas.'],
    MEMBER_REMOVED: ['Adesão alterada', 'O estado de um membro do livro de contas mudou.'],
    ROLE_CHANGED: ['Função alterada', 'A sua função no livro de contas mudou.'],
    OWNERSHIP_TRANSFERRED: ['Propriedade transferida', 'A propriedade do livro de contas foi transferida.'],
    LEDGER_ARCHIVED: ['Livro de contas arquivado', 'Um livro de contas foi arquivado.'],
    COMMENT_ADDED: ['Novo comentário', 'Foi adicionado um comentário a um lançamento.'],
    LEGACY_CLAIMED: ['Dados anteriores restaurados', 'Os seus dados anteriores do BooKoo estão ligados.'],
    ANNOUNCEMENT: ['Aviso BooKoo', 'Há um novo aviso.'],
    SYSTEM: ['Atualização BooKoo', 'Há uma novidade na sua conta.'],
  },
};

const rejectedCopy: Record<
  PushLocale,
  readonly [title: string, body: string]
> = {
  vi: ['Đã từ chối yêu cầu', 'Yêu cầu tham gia sổ của bạn đã bị từ chối.'],
  ko: ['참여 요청 거절', '가계부 참여 요청이 거절되었습니다.'],
  en: ['Request declined', 'Your request to join the ledger was declined.'],
  ja: ['参加申請を却下', '家計簿への参加申請が却下されました。'],
  zh: ['请求已拒绝', '你的账本加入请求已被拒绝。'],
  id: ['Permintaan ditolak', 'Permintaan bergabung Anda telah ditolak.'],
  de: ['Anfrage abgelehnt', 'Ihre Beitrittsanfrage wurde abgelehnt.'],
  es: ['Solicitud rechazada', 'Tu solicitud para unirte al libro de cuentas fue rechazada.'],
  fr: ['Demande refusée', 'Votre demande d’adhésion au livret a été refusée.'],
  it: ['Richiesta rifiutata', 'La tua richiesta di adesione è stata rifiutata.'],
  nl: ['Verzoek afgewezen', 'Je verzoek om deel te nemen is afgewezen.'],
  pt: ['Pedido recusado', 'O seu pedido para aderir ao livro de contas foi recusado.'],
};

export const renderInboxPush = (
  locale: PushLocale,
  kind: InboxPushKind,
): {readonly title: string; readonly body: string} => {
  const [title, body] = inboxCopy[locale][kind];
  return {title: clean(title, 96), body: clean(body, 128)};
};

export const renderInboxNotification = (
  locale: PushLocale,
  kind: InboxPushKind | 'JOIN_REJECTED',
): {readonly title: string; readonly body: string} => {
  if (kind !== 'JOIN_REJECTED') return renderInboxPush(locale, kind);
  const [title, body] = rejectedCopy[locale];
  return {title, body};
};

export const pushChannelForKind = (kind: InboxPushKind): PushChannel => {
  if (kind === 'COMMENT_ADDED') return 'ledger-activity';
  if (
    kind === 'LEDGER_INVITE' ||
    kind === 'JOIN_REQUESTED' ||
    kind === 'MEMBER_JOINED' ||
    kind === 'MEMBER_LEFT' ||
    kind === 'ANNOUNCEMENT'
  )
    return 'ledger-social';
  return 'ledger-governance';
};

export const isQuietMinute = (
  minute: number,
  start: number | undefined,
  end: number | undefined,
): boolean => {
  if (start === undefined || end === undefined || start === end) return false;
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
};
