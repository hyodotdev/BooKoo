export const LEGAL_DOCUMENT_VERSION = '2026-11-04';
export const TERMS_DOCUMENT_SHA256 =
  '4c955b90c2dd137014fc57b0660d405230d29b07be9b331b5662b50ad889ada6';
export const PRIVACY_DOCUMENT_SHA256 =
  '40b55668d4abd2985a0a3db9eb926bae34c1846278645beb9373ed16e22e9c5c';

/** New clients identify the exact documents they displayed. */
export const LEGAL_ACKNOWLEDGEMENT = {
  legalDocumentVersion: LEGAL_DOCUMENT_VERSION,
  termsDocumentSha256: TERMS_DOCUMENT_SHA256,
  privacyDocumentSha256: PRIVACY_DOCUMENT_SHA256,
} as const;

/** Older 1.3.1 clients did not send document metadata. Never relabel their notice. */
export const LEGACY_LEGAL_ACKNOWLEDGEMENT = {
  legalDocumentVersion: '2026-10-22',
  termsDocumentSha256:
    '20a2de89ca649cd8fd11902c7608ac320754a77bd78113da158403c888765bf2',
  privacyDocumentSha256:
    '2826b2360060ab16cfc849368d2f595def14ebabbab9a4d0c837ec95df3988b6',
} as const;

export const PUBLIC_URLS = {
  privacy: 'https://bookoo.hyo.dev/legal/privacy',
  terms: 'https://bookoo.hyo.dev/legal/terms',
  privacyChoices: 'https://bookoo.hyo.dev/privacy-choices',
  accountDeletion: 'https://bookoo.hyo.dev/account-deletion',
  support: 'https://bookoo.hyo.dev/support',
} as const;

export function publicLegalUrl(
  document: 'privacy' | 'terms',
  locale: string,
): string {
  return `${PUBLIC_URLS[document]}?lang=${locale}`;
}
