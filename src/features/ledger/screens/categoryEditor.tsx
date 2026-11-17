import type {ReactElement} from 'react';
import {useRef, useState} from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {KeyboardAvoidingView} from 'react-native-keyboard-controller';
import {useQuery} from 'convex-helpers/react/cache';
import {useMutation} from 'convex/react';
import {useRouter} from 'expo-router';
import {api} from '@convex/_generated/api';
import {CATEGORY_COLOR_TOKENS, isValidCategoryName} from '@shared/categories';
import {BookooBottomAction} from '~/components/uis/BookooBottomAction';
import {t} from '~/utils/i18n';
import {CategoryFormFields, type CategoryDraft} from '../CategoryFormFields';
import {categoryDisplayName} from '../categories';
import type {CategoryRow, LedgerRow} from '../types';
import {AppScreen, ScreenSkeleton, ScreenState} from '../ui';
import {DETAIL_CONTENT_TOP} from '~/theme/layout';

export function CategoryEditorScreen({
  ledgerId,
  categoryKey,
  kind = 'EXPENSE',
}: {
  readonly ledgerId: string;
  readonly categoryKey?: string;
  readonly kind?: 'EXPENSE' | 'INCOME';
}): ReactElement {
  const ledger = useQuery(api.ledgers.queries.getMineByRoute, {ledgerId});
  const categories = useQuery(
    api.categories.queries.list,
    ledger == null ? 'skip' : {ledgerId: ledger.id},
  );
  const category = categories?.find((item) => item.key === categoryKey);
  if (ledger === null)
    return (
      <AppScreen>
        <ScreenState icon="Wallet" title={t('error.ledger.notFound')} />
      </AppScreen>
    );
  if (ledger === undefined || categories === undefined)
    return (
      <AppScreen>
        <ScreenSkeleton rows={6} />
      </AppScreen>
    );
  if (
    (categoryKey !== undefined &&
      (!category || category.archived || category.reassigning)) ||
    ledger.maintenanceLock !== 'NONE' ||
    (categoryKey === undefined
      ? ledger.role === 'VIEWER'
      : ledger.role !== 'OWNER' && ledger.role !== 'ADMIN')
  )
    return (
      <AppScreen>
        <ScreenState icon="ShieldWarning" title={t('error.ledger.forbidden')} />
      </AppScreen>
    );
  return (
    <CategoryEditor
      key={`${ledger.id}:${categoryKey ?? kind}`}
      category={category}
      kind={kind}
      ledger={ledger}
    />
  );
}

function CategoryEditor({
  category,
  kind,
  ledger,
}: {
  readonly category?: CategoryRow;
  readonly kind: 'EXPENSE' | 'INCOME';
  readonly ledger: LedgerRow;
}): ReactElement {
  const router = useRouter();
  const create = useMutation(api.categories.mutations.create);
  const rename = useMutation(api.categories.mutations.rename);
  const [draft, setDraft] = useState<CategoryDraft>({
    label: category?.label ?? '',
    iconKey: category?.iconKey ?? (kind === 'EXPENSE' ? 'ForkKnife' : 'Wallet'),
    colorToken:
      CATEGORY_COLOR_TOKENS.find((token) => token === category?.colorToken) ??
      'category.teal',
  });
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const valid =
    isValidCategoryName(draft.label) ||
    (category !== undefined &&
      (draft.label === (category.label ?? '') ||
        (category.source === 'PRESET' && draft.label === '')));
  const save = async (): Promise<void> => {
    if (!valid || pending.current) return;
    pending.current = true;
    setSaving(true);
    setFailed(false);
    try {
      if (category)
        await rename({
          ledgerId: ledger.id,
          key: category.key,
          iconKey: draft.iconKey,
          colorToken: draft.colorToken,
          ...(draft.label === '' ? {} : {label: draft.label}),
        });
      else await create({ledgerId: ledger.id, kind, ...draft});
      if (router.canGoBack()) router.back();
      else
        router.replace({
          pathname: '/ledger/[ledgerId]/categories',
          params: {ledgerId: ledger.id},
        });
    } catch {
      setFailed(true);
      // Only a failed save resumes editing. Success is already detaching this
      // native screen; do not enqueue an idle render alongside router.back().
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <AppScreen>
      <KeyboardAvoidingView
        automaticOffset
        behavior="height"
        style={styles.flex}
        testID="category-keyboard-viewport"
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          style={styles.flex}
          testID="category-form-scroll"
        >
          <CategoryFormFields
            disabled={saving}
            nameTestID="category-form-name"
            onChange={setDraft}
            placeholder={category ? categoryDisplayName(category) : undefined}
            value={draft}
          />
        </ScrollView>
        <BookooBottomAction
          disabled={!valid || saving}
          helperText={failed ? t('error.generic') : undefined}
          helperTone="error"
          loading={saving}
          onPress={() => {
            void save();
          }}
          testID="category-form-save"
          text={t('screen.save')}
        />
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 680,
    paddingHorizontal: 24,
    paddingTop: DETAIL_CONTENT_TOP,
    paddingBottom: 32,
  },
});
