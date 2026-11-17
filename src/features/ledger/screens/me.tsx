import type {ReactElement} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {CustomPressable, Icon, Typography, useCPK, type IconName} from 'cpk-ui';

import {AppScreen} from '../ui';

export interface MeRow {
  readonly key: string;
  readonly label: string;
  readonly detail?: string;
  readonly icon: IconName;
  readonly danger?: boolean;
  readonly onPress: () => void;
}

export interface MeSection {
  readonly key: string;
  readonly title: string;
  readonly rows: readonly MeRow[];
}

export interface MeScreenProps {
  readonly displayName: string;
  readonly handle: string | null;
  readonly emailVerified: boolean;
  readonly sections: readonly MeSection[];
}

function MeRowItem({
  isLast,
  row,
}: {
  readonly isLast: boolean;
  readonly row: MeRow;
}): ReactElement {
  const {theme} = useCPK();
  const foreground = row.danger ? theme.role.danger : theme.text.basic;
  const iconColor = row.danger ? theme.role.danger : theme.role.primary;

  return (
    <View>
      <CustomPressable
        accessibilityLabel={
          row.detail === undefined ? row.label : `${row.label}, ${row.detail}`
        }
        accessibilityRole="button"
        onPress={row.onPress}
        style={[styles.row, {backgroundColor: theme.bg.basic}]}
      >
        <View
          style={[
            styles.iconTile,
            {
              backgroundColor: row.danger
                ? theme.bg.disabled
                : theme.bg.highlight,
            },
          ]}
        >
          <Icon color={iconColor} name={row.icon} size={20} />
        </View>
        <Typography.Body2
          numberOfLines={1}
          style={[styles.rowLabel, {color: foreground}]}
        >
          {row.label}
        </Typography.Body2>
        {row.detail === undefined ? null : (
          <Typography.Body4
            numberOfLines={1}
            style={[styles.rowDetail, {color: theme.text.label}]}
          >
            {row.detail}
          </Typography.Body4>
        )}
        <Icon color={theme.text.placeholder} name="CaretRight" size={15} />
      </CustomPressable>
      {isLast ? null : (
        <View style={[styles.divider, {backgroundColor: theme.role.divider}]} />
      )}
    </View>
  );
}

function MeSectionCard({section}: {section: MeSection}): ReactElement {
  const {theme} = useCPK();
  return (
    <View style={styles.section}>
      <Typography.Body4
        $fontWeight="bold"
        style={[styles.sectionTitle, {color: theme.text.label}]}
      >
        {section.title}
      </Typography.Body4>
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: theme.bg.basic,
            borderColor: theme.role.border,
          },
        ]}
      >
        {section.rows.map((row, index) => (
          <MeRowItem
            isLast={index === section.rows.length - 1}
            key={row.key}
            row={row}
          />
        ))}
      </View>
    </View>
  );
}

function MeProfile({
  displayName,
  emailVerified,
  handle,
}: Pick<
  MeScreenProps,
  'displayName' | 'emailVerified' | 'handle'
>): ReactElement {
  const {theme} = useCPK();
  return (
    <View
      style={[
        styles.profile,
        {
          backgroundColor: theme.bg.basic,
          borderColor: theme.role.border,
        },
      ]}
      testID="settings-profile"
    >
      <View style={[styles.avatar, {backgroundColor: theme.role.primary}]}>
        <Icon color={theme.text.contrast} name="User" size={32} />
      </View>
      <View style={styles.profileCopy}>
        <View style={styles.nameLine}>
          <Typography.Heading3
            $fontWeight="bold"
            numberOfLines={1}
            style={[styles.profileName, {color: theme.text.basic}]}
          >
            {displayName}
          </Typography.Heading3>
          {emailVerified ? (
            <Icon color={theme.role.primary} name="CheckCircleFill" size={18} />
          ) : null}
        </View>
        <Typography.Body3 numberOfLines={1} style={{color: theme.text.label}}>
          {handle === null ? '' : `@${handle}`}
        </Typography.Body3>
      </View>
    </View>
  );
}

function MeContent(props: MeScreenProps): ReactElement {
  return (
    <View style={styles.contentColumn}>
      <MeProfile {...props} />
      {props.sections.map((section) => (
        <MeSectionCard key={section.key} section={section} />
      ))}
    </View>
  );
}

export function MeMobile(props: MeScreenProps): ReactElement {
  return (
    <AppScreen>
      <ScrollView
        contentContainerStyle={styles.mobileContent}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.scroll}
        testID="settings-scroll"
      >
        <MeContent {...props} />
      </ScrollView>
    </AppScreen>
  );
}

export function MeTablet(props: MeScreenProps): ReactElement {
  return (
    <AppScreen>
      <ScrollView
        contentContainerStyle={styles.tabletContent}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.scroll}
        testID="settings-scroll"
      >
        <MeContent {...props} />
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: 34,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  contentColumn: {alignSelf: 'center', gap: 24, maxWidth: 720, width: '100%'},
  divider: {height: StyleSheet.hairlineWidth, marginLeft: 68},
  iconTile: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  mobileContent: {flexGrow: 1, padding: 16, paddingBottom: 32},
  nameLine: {alignItems: 'center', flexDirection: 'row', gap: 6},
  profile: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    padding: 20,
  },
  profileCopy: {flex: 1, gap: 2},
  profileName: {flexShrink: 1},
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowDetail: {maxWidth: '34%', textAlign: 'right'},
  rowLabel: {flex: 1},
  section: {gap: 8},
  sectionCard: {
    borderCurve: 'continuous',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sectionTitle: {paddingHorizontal: 12},
  scroll: {flex: 1},
  tabletContent: {flexGrow: 1, padding: 32},
});
