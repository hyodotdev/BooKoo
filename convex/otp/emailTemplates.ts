import type {AppLocale} from '../schema/userProfiles';

export interface EmailTemplate {
  readonly subject: string;
  readonly text: (code: string) => string;
  readonly html: (code: string) => string;
  readonly linkSubject: string;
  readonly linkText: (code: string) => string;
  readonly linkHtml: (code: string) => string;
}

function html(title: string, body: string, code: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#17201d"><h1>${title}</h1><p>${body}</p><p style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</p><p>BooKoo</p></body></html>`;
}

export const emailTemplates: Record<AppLocale, EmailTemplate> = {
  vi: {
    subject: 'Mã đăng nhập BooKoo của bạn',
    text: (code) =>
      `Mã đăng nhập BooKoo của bạn là ${code}. Mã có hiệu lực trong 10 phút.`,
    html: (code) =>
      html(
        'Mã đăng nhập của bạn',
        'Nhập mã trong BooKoo trong vòng 10 phút.',
        code,
      ),
    linkSubject: 'Mã liên kết email BooKoo',
    linkText: (code) =>
      `Mã liên kết email BooKoo của bạn là ${code}. Mã có hiệu lực trong 10 phút.`,
    linkHtml: (code) =>
      html('Mã liên kết email', 'Nhập mã trong vòng 10 phút.', code),
  },
  ko: {
    subject: 'BooKoo 로그인 인증코드',
    text: (code) =>
      `BooKoo 로그인 인증코드는 ${code}입니다. 10분 안에 입력해 주세요.`,
    html: (code) =>
      html('로그인 인증코드', '10분 안에 앱에 입력해 주세요.', code),
    linkSubject: 'BooKoo 이메일 연결 인증코드',
    linkText: (code) =>
      `BooKoo 이메일 연결 인증코드는 ${code}입니다. 10분 안에 입력해 주세요.`,
    linkHtml: (code) =>
      html('이메일 연결 인증코드', '10분 안에 앱에 입력해 주세요.', code),
  },
  en: {
    subject: 'Your BooKoo sign-in code',
    text: (code) =>
      `Your BooKoo sign-in code is ${code}. It expires in 10 minutes.`,
    html: (code) =>
      html('Your sign-in code', 'Enter it in BooKoo within 10 minutes.', code),
    linkSubject: 'Your BooKoo email-link code',
    linkText: (code) =>
      `Your BooKoo email-link code is ${code}. It expires in 10 minutes.`,
    linkHtml: (code) =>
      html('Your email-link code', 'Enter it within 10 minutes.', code),
  },
  ja: {
    subject: 'BooKoo ログイン認証コード',
    text: (code) =>
      `BooKoo の認証コードは ${code} です。10分以内に入力してください。`,
    html: (code) =>
      html('ログイン認証コード', '10分以内にアプリへ入力してください。', code),
    linkSubject: 'BooKoo メール連携コード',
    linkText: (code) =>
      `BooKoo のメール連携コードは ${code} です。10分以内に入力してください。`,
    linkHtml: (code) =>
      html('メール連携コード', '10分以内に入力してください。', code),
  },
  zh: {
    subject: 'BooKoo 登录验证码',
    text: (code) => `您的 BooKoo 登录验证码是 ${code}，请在 10 分钟内输入。`,
    html: (code) => html('登录验证码', '请在 10 分钟内输入到 BooKoo。', code),
    linkSubject: 'BooKoo 邮箱绑定验证码',
    linkText: (code) =>
      `您的 BooKoo 邮箱绑定验证码是 ${code}，请在 10 分钟内输入。`,
    linkHtml: (code) => html('邮箱绑定验证码', '请在 10 分钟内输入。', code),
  },
  id: {
    subject: 'Kode masuk BooKoo',
    text: (code) =>
      `Kode masuk BooKoo Anda adalah ${code}. Masukkan dalam 10 menit.`,
    html: (code) =>
      html('Kode masuk Anda', 'Masukkan ke BooKoo dalam 10 menit.', code),
    linkSubject: 'Kode penautan email BooKoo',
    linkText: (code) =>
      `Kode penautan email BooKoo Anda adalah ${code}. Masukkan dalam 10 menit.`,
    linkHtml: (code) =>
      html('Kode penautan email', 'Masukkan dalam 10 menit.', code),
  },
  de: {
    subject: 'Ihr BooKoo-Anmeldecode',
    text: (code) =>
      `Ihr BooKoo-Anmeldecode lautet ${code}. Er läuft in 10 Minuten ab.`,
    html: (code) =>
      html(
        'Ihr Anmeldecode',
        'Geben Sie ihn innerhalb von 10 Minuten in BooKoo ein.',
        code,
      ),
    linkSubject: 'Ihr BooKoo-E-Mail-Verknüpfungscode',
    linkText: (code) =>
      `Ihr BooKoo-E-Mail-Verknüpfungscode lautet ${code}. Er läuft in 10 Minuten ab.`,
    linkHtml: (code) =>
      html(
        'E-Mail-Verknüpfungscode',
        'Geben Sie ihn innerhalb von 10 Minuten ein.',
        code,
      ),
  },
  es: {
    subject: 'Tu código de acceso a BooKoo',
    text: (code) =>
      `Tu código de acceso a BooKoo es ${code}. Caduca en 10 minutos.`,
    html: (code) =>
      html(
        'Tu código de acceso',
        'Introdúcelo en BooKoo en un plazo de 10 minutos.',
        code,
      ),
    linkSubject: 'Tu código para vincular el correo de BooKoo',
    linkText: (code) =>
      `Tu código para vincular el correo de BooKoo es ${code}. Caduca en 10 minutos.`,
    linkHtml: (code) =>
      html(
        'Código para vincular el correo',
        'Introdúcelo en un plazo de 10 minutos.',
        code,
      ),
  },
  fr: {
    subject: 'Votre code de connexion BooKoo',
    text: (code) =>
      `Votre code de connexion BooKoo est ${code}. Il expire dans 10 minutes.`,
    html: (code) =>
      html(
        'Votre code de connexion',
        'Saisissez-le dans BooKoo dans les 10 minutes.',
        code,
      ),
    linkSubject: 'Votre code de liaison d’e-mail BooKoo',
    linkText: (code) =>
      `Votre code de liaison d’e-mail BooKoo est ${code}. Il expire dans 10 minutes.`,
    linkHtml: (code) =>
      html(
        'Code de liaison d’e-mail',
        'Saisissez-le dans les 10 minutes.',
        code,
      ),
  },
  it: {
    subject: 'Il tuo codice di accesso BooKoo',
    text: (code) =>
      `Il tuo codice di accesso BooKoo è ${code}. Scade tra 10 minuti.`,
    html: (code) =>
      html(
        'Il tuo codice di accesso',
        'Inseriscilo in BooKoo entro 10 minuti.',
        code,
      ),
    linkSubject: 'Il tuo codice di collegamento e-mail BooKoo',
    linkText: (code) =>
      `Il tuo codice di collegamento e-mail BooKoo è ${code}. Scade tra 10 minuti.`,
    linkHtml: (code) =>
      html(
        'Codice di collegamento e-mail',
        'Inseriscilo entro 10 minuti.',
        code,
      ),
  },
  nl: {
    subject: 'Je BooKoo-inlogcode',
    text: (code) =>
      `Je BooKoo-inlogcode is ${code}. De code verloopt over 10 minuten.`,
    html: (code) =>
      html('Je inlogcode', 'Voer hem binnen 10 minuten in BooKoo in.', code),
    linkSubject: 'Je BooKoo-e-maillinkcode',
    linkText: (code) =>
      `Je BooKoo-e-maillinkcode is ${code}. De code verloopt over 10 minuten.`,
    linkHtml: (code) =>
      html('E-maillinkcode', 'Voer hem binnen 10 minuten in.', code),
  },
  pt: {
    subject: 'O seu código de acesso BooKoo',
    text: (code) =>
      `O seu código de acesso BooKoo é ${code}. Expira em 10 minutos.`,
    html: (code) =>
      html(
        'O seu código de acesso',
        'Introduza-o no BooKoo no prazo de 10 minutos.',
        code,
      ),
    linkSubject: 'O seu código de associação de e-mail BooKoo',
    linkText: (code) =>
      `O seu código de associação de e-mail BooKoo é ${code}. Expira em 10 minutos.`,
    linkHtml: (code) =>
      html(
        'Código de associação de e-mail',
        'Introduza-o no prazo de 10 minutos.',
        code,
      ),
  },
};
