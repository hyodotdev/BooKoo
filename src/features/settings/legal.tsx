import {useState, type ReactElement} from 'react';
import {Linking, StyleSheet, View} from 'react-native';
import {CustomPressable, Icon, Typography, useCPK} from 'cpk-ui';
import {Stack, useRouter} from 'expo-router';

import {
  PUBLIC_LOCALES,
  PUBLIC_SITE_COPY,
  type PublicLocale,
  type PublicRoute,
  type PublicSiteCopy,
} from '../../../scripts/public-site/content';
import {useLocale} from '~/hooks/useLocale';
import {t} from '~/utils/i18n';
import {
  SettingsBottomAction,
  SettingsSectionList,
} from '~/features/settings/ui';

export const LEGAL_DOCUMENTS = [
  'terms',
  'privacy',
  'choices',
  'deletion',
  'support',
] as const satisfies readonly PublicRoute[];

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export function isLegalDocument(value: string): value is LegalDocument {
  return (LEGAL_DOCUMENTS as readonly string[]).includes(value);
}

const routeForPath = (value: string): LegalDocument | undefined => {
  if (value === '/legal/privacy') return 'privacy';
  if (value === '/legal/terms') return 'terms';
  if (value === '/privacy-choices') return 'choices';
  if (value === '/account-deletion') return 'deletion';
  if (value === '/support') return 'support';
  return undefined;
};

type LegalSectionRow =
  | {readonly kind: 'paragraph'; readonly key: string; readonly value: string}
  | {readonly kind: 'bullet'; readonly key: string; readonly value: string};

function DocumentBullet({value}: {readonly value: string}): ReactElement {
  const router = useRouter();
  const {theme} = useCPK();
  const internal = routeForPath(value);
  const isExternal = value.startsWith('https://');
  const content = (
    <>
      <View style={[styles.bulletDot, {backgroundColor: theme.role.primary}]} />
      <Typography.Body3
        selectable
        style={[
          styles.bulletText,
          isExternal || internal ? {color: theme.role.link} : undefined,
        ]}
      >
        {value}
      </Typography.Body3>
      {isExternal || internal ? (
        <Icon color={theme.text.placeholder} name="ArrowSquareOut" size={17} />
      ) : null}
    </>
  );

  if (!isExternal && internal === undefined)
    return <View style={styles.bullet}>{content}</View>;

  return (
    <CustomPressable
      accessibilityRole="link"
      onPress={() => {
        if (internal !== undefined)
          router.navigate(`/settings/legal/${internal}` as const);
        else void Linking.openURL(value);
      }}
      style={styles.bullet}
    >
      {content}
    </CustomPressable>
  );
}

export function LegalDetailScreen({
  document,
}: {
  readonly document: LegalDocument;
}): ReactElement {
  const {locale} = useLocale();
  const publicLocale: PublicLocale =
    PUBLIC_LOCALES.find((item) => item === locale) ?? 'en';
  const copy: PublicSiteCopy = PUBLIC_SITE_COPY[publicLocale];
  const page = copy.pages[document];
  const {action} = page;
  const [openingAction, setOpeningAction] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const sections = page.sections.map((section, sectionIndex) => ({
    data: [
      ...section.paragraphs.map((value, rowIndex) => ({
        key: `paragraph:${sectionIndex}:${rowIndex}`,
        kind: 'paragraph' as const,
        value,
      })),
      ...(section.bullets ?? []).map((value, rowIndex) => ({
        key: `bullet:${sectionIndex}:${rowIndex}`,
        kind: 'bullet' as const,
        value,
      })),
    ],
    key: `section:${sectionIndex}`,
    title: section.heading,
  }));

  return (
    <>
      <Stack.Screen options={{title: page.title}} />
      <SettingsSectionList<LegalSectionRow>
        footer={
          action === undefined ? undefined : (
            <SettingsBottomAction
              helperText={actionFailed ? t('error.generic') : undefined}
              helperTone="error"
              loading={openingAction}
              onPress={() => {
                setOpeningAction(true);
                setActionFailed(false);
                void Linking.openURL(action.href)
                  .catch(() => setActionFailed(true))
                  .finally(() => setOpeningAction(false));
              }}
              text={action.label}
            />
          )
        }
        keyExtractor={(row) => row.key}
        renderItem={(row) =>
          row.kind === 'bullet' ? (
            <DocumentBullet value={row.value} />
          ) : (
            <Typography.Body3 selectable style={styles.paragraph}>
              {row.value}
            </Typography.Body3>
          )
        }
        sections={sections}
        testID={`legal-${document}-sections`}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bullet: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    borderCurve: 'continuous',
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bulletDot: {borderRadius: 999, height: 6, marginTop: 8, width: 6},
  bulletText: {flex: 1, lineHeight: 21},
  paragraph: {lineHeight: 22, padding: 16},
});
