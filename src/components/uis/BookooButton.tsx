import type {ReactElement} from 'react';
import {Button, useCPK} from 'cpk-ui';
import type {Props as ButtonProps} from 'cpk-ui/components/uis/Button/Button';

import {ledgerAccentSurface, type AccentSet} from '~/theme/ledgerAccent';
import {useLedgerActionAccent} from '~/theme/ledgerAccentProvider';

export type BookooButtonProps = ButtonProps & {
  /** Override the active ledger accent while previewing an unsaved colour. */
  readonly accent?: AccentSet;
};

/**
 * cpk-ui button with BooKoo's softer shape and contextual ledger colour.
 * Semantic danger/warning/etc. colours remain owned by cpk-ui.
 */
export function BookooButton({
  accent: accentOverride,
  borderRadius = 16,
  color,
  disabled,
  loading,
  loadingColor,
  onPress,
  styles,
  type = 'solid',
  ...props
}: BookooButtonProps): ReactElement {
  const activeAccent = useLedgerActionAccent();
  const {theme, themeType} = useCPK();
  const accent = accentOverride ?? activeAccent;
  const surface = ledgerAccentSurface(
    accent,
    themeType === 'dark' ? 'dark' : 'light',
  );
  const usesLedgerAccent = color === undefined || color === 'primary';
  const isDisabled = disabled || loading || onPress === undefined;
  const contextualStyles = usesLedgerAccent
    ? {
        container:
          type === 'solid'
            ? {
                backgroundColor: surface.background,
                borderColor: surface.background,
              }
            : type === 'outlined' && !isDisabled
              ? {
                  // cpk-ui defines per-edge borders; override each edge too.
                  borderColor: accent.text,
                  borderTopColor: accent.text,
                  borderBottomColor: accent.text,
                  borderLeftColor: accent.text,
                  borderRightColor: accent.text,
                }
              : undefined,
        text: isDisabled
          ? undefined
          : {color: type === 'solid' ? surface.foreground : accent.text},
      }
    : undefined;

  return (
    <Button
      borderRadius={borderRadius}
      color={color}
      disabled={disabled}
      loading={loading}
      loadingColor={
        loadingColor ??
        (usesLedgerAccent && type === 'solid' ? surface.foreground : undefined)
      }
      onPress={onPress}
      styles={{
        ...styles,
        container: [contextualStyles?.container, styles?.container],
        disabled: [
          loading && type === 'solid'
            ? {
                backgroundColor: usesLedgerAccent
                  ? surface.background
                  : theme.button[color ?? 'primary'].bg,
                borderColor: usesLedgerAccent
                  ? surface.background
                  : theme.button[color ?? 'primary'].bg,
                opacity: 0.82,
              }
            : undefined,
          styles?.disabled,
        ],
        text: [{fontWeight: 'bold'}, contextualStyles?.text, styles?.text],
      }}
      type={type}
      {...props}
    />
  );
}
