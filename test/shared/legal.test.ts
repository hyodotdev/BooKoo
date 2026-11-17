import {
  LEGAL_DOCUMENT_VERSION,
  PRIVACY_DOCUMENT_SHA256,
  PUBLIC_URLS,
  TERMS_DOCUMENT_SHA256,
  publicLegalUrl,
} from '@shared/legal';

describe('public legal surface', () => {
  it('pins versioned documents and canonical HTTPS URLs', () => {
    expect(LEGAL_DOCUMENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TERMS_DOCUMENT_SHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(PRIVACY_DOCUMENT_SHA256).toMatch(/^[a-f0-9]{64}$/);
    for (const url of Object.values(PUBLIC_URLS)) {
      const parsed = new URL(url);
      expect(parsed.protocol).toBe('https:');
      expect(parsed.hostname).toBe('bookoo.hyo.dev');
    }
  });

  it('keeps localized legal links on the public site', () => {
    expect(publicLegalUrl('terms', 'ko')).toBe(
      'https://bookoo.hyo.dev/legal/terms?lang=ko',
    );
    expect(publicLegalUrl('privacy', 'en')).toBe(
      'https://bookoo.hyo.dev/legal/privacy?lang=en',
    );
  });
});
