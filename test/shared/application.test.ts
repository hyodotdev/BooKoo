import {APPLICATION_ID} from '../../shared/application';
import {STORE_PRODUCT_IDS} from '../../shared/entitlements';

it('keeps Apple store products in the native application namespace', () => {
  expect(APPLICATION_ID).toBe('dev.hyo.bookoo');
  expect(STORE_PRODUCT_IDS.iosMonthly.startsWith(`${APPLICATION_ID}.`)).toBe(
    true,
  );
  expect(STORE_PRODUCT_IDS.iosAnnual.startsWith(`${APPLICATION_ID}.`)).toBe(
    true,
  );
});
