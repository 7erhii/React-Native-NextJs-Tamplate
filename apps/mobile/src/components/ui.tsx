/**
 * Small set of themed primitives shared by the platform screens.
 *
 * Deliberately plain React Native rather than a UI library: a foundation that
 * imposes a styling stack on every game built on it is a foundation people fork
 * instead of use.
 */

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const content = (
    <View style={[styles.contentWidth, { padding: Spacing.three }, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.scrollContent]}>{content}</View>
      )}
    </SafeAreaView>
  );
}

export function Heading({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return <Text style={[styles.heading, { color: theme.text }, style]}>{children}</Text>;
}

export function Subheading({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.subheading, { color: theme.text }]}>{children}</Text>;
}

export function Body({
  children,
  muted = false,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useTheme();
  return (
    <Text style={[styles.body, { color: muted ? theme.textSecondary : theme.text }, style]}>
      {children}
    </Text>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.mono, { color: theme.text }]}>{children}</Text>;
}

export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const base: StyleProp<ViewStyle> = [
    styles.card,
    { backgroundColor: theme.backgroundElement },
    style,
  ];

  if (!onPress) return <View style={base}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed && { backgroundColor: theme.backgroundSelected, transform: [{ scale: 0.99 }] },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const theme = useTheme();
  const isDisabled = disabled || busy;

  const palette = {
    primary: { background: theme.accent, text: '#ffffff' },
    secondary: { background: theme.backgroundSelected, text: theme.text },
    danger: { background: theme.danger, text: '#ffffff' },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.background, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text style={[styles.buttonLabel, { color: palette.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'positive' | 'warning';
}) {
  const theme = useTheme();
  const background = {
    neutral: theme.backgroundSelected,
    positive: `${theme.success}22`,
    warning: `${theme.warning}22`,
  }[tone];
  const color = {
    neutral: theme.textSecondary,
    positive: theme.success,
    warning: theme.warning,
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeLabel, { color }]}>{label}</Text>
    </View>
  );
}

export function Row({
  children,
  gap = Spacing.two,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, { gap }, style]}>{children}</View>;
}

export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />;
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.keyValue}>
      <Text style={[styles.body, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.body, styles.keyValueValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.fill, styles.centered, { backgroundColor: theme.background }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { alignItems: 'center' },
  contentWidth: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  centered: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  heading: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  subheading: { fontSize: 19, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  mono: { fontSize: 22, fontWeight: '600', letterSpacing: 3 },
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  button: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  badgeLabel: { fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: 1, width: '100%' },
  keyValue: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  keyValueValue: { fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
