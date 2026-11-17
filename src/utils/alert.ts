import {Alert} from 'react-native';

import {t} from './i18n';

/**
 * A native notice with one dismiss button in the app language.
 *
 * `Alert.alert` without buttons adds its own: iOS localizes that "OK" in the
 * system language, and Android hard-codes English, so an English app on a
 * Korean phone showed "확인". Every alert passes its buttons explicitly; ESLint
 * rejects an `Alert.alert` call with fewer than three arguments.
 */
export function showNotice(title: string, message?: string): void {
  Alert.alert(title, message, [{text: t('common.ok')}]);
}
