import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeIn, SlideInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { router, useSegments } from 'expo-router';
import { ChevronLeft, ChevronRight, Search as SearchIcon, X } from 'lucide-react-native';
import { C } from '@/theme';

// 공통 UI. 웹 프로토타입(ui.tsx)과 같은 이름 · 같은 모양으로 맞췄다.

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** 탭 안의 화면인지 (하단 여백 계산용) */
const useInTabs = () => useSegments()[0] === '(tabs)';

export function Screen({
  children,
  footer,
  dark,
  className,
  pad = true,
  scroll = true,
  top = true,
  scrollRef,
  onScroll,
}: {
  children: ReactNode;
  footer?: ReactNode;
  dark?: boolean;
  className?: string;
  pad?: boolean;
  scroll?: boolean;
  top?: boolean;
  scrollRef?: React.Ref<ScrollView>;
  onScroll?: ScrollViewProps['onScroll'];
}) {
  const insets = useSafeAreaInsets();
  const inTabs = useInTabs();
  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={32}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName={cx(pad && 'px-5 pb-8', className)}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={cx('flex-1', pad && 'px-5', className)}>{children}</View>
  );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className={cx('flex-1', dark ? 'bg-black' : 'bg-white')}
      style={{ paddingTop: top ? insets.top : 0 }}
    >
      <View className="flex-1">{body}</View>
      {footer && (
        <View
          className="px-5 pt-2"
          style={{ paddingBottom: inTabs ? 12 : Math.max(insets.bottom, 16) }}
        >
          {footer}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

export function Header({
  title,
  sub,
  right,
  back = true,
  onBack,
  center,
  large = true,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  center?: boolean;
  large?: boolean;
}) {
  const goBack = onBack ?? (() => router.back());
  if (center)
    return (
      <View className="-mx-5 mb-3 h-12 flex-row items-center justify-center border-b border-line px-5">
        {back && (
          <Pressable
            accessibilityLabel="뒤로"
            onPress={goBack}
            hitSlop={10}
            className="absolute left-3 h-9 w-9 items-center justify-center"
          >
            <ChevronLeft size={24} color={C.ink} />
          </Pressable>
        )}
        <Text className="text-[17px] font-bold text-ink">{title}</Text>
        <View className="absolute right-4">{right}</View>
      </View>
    );
  return (
    <View className="pt-2 pb-3">
      <View className="h-9 flex-row items-center justify-between">
        {back ? (
          <Pressable
            accessibilityLabel="뒤로"
            onPress={goBack}
            hitSlop={10}
            className="-ml-2 h-9 w-9 items-center justify-center"
          >
            <ChevronLeft size={24} color={C.ink} />
          </Pressable>
        ) : (
          <View />
        )}
        {right}
      </View>
      {title ? (
        <Text className={cx('font-bold text-ink', large ? 'text-[22px]' : 'text-[17px]')}>
          {title}
        </Text>
      ) : null}
      {sub ? <Text className="mt-1 text-[13px] text-sub">{sub}</Text> : null}
    </View>
  );
}

export function Title({
  children,
  sub,
  right,
}: {
  children: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-end justify-between pt-4 pb-3">
      <View>
        <Text className="text-[24px] font-bold text-ink">{children}</Text>
        {sub ? <Text className="mt-1 text-[13px] text-sub">{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export const Label = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <View className="mt-5 mb-2 flex-row items-center justify-between">
    {typeof children === 'string' ? (
      <Text className="text-[13px] text-sub">{children}</Text>
    ) : (
      children
    )}
    {right}
  </View>
);

type BtnKind = 'primary' | 'outline' | 'cream' | 'dark' | 'sun' | 'danger' | 'ghost' | 'gray';
const BTN: Record<BtnKind, [string, string]> = {
  primary: ['bg-brand', 'text-white'],
  outline: ['border border-brand/40 bg-white', 'text-ink'],
  cream: ['bg-cream', 'text-ink'],
  dark: ['bg-ink', 'text-white'],
  sun: ['bg-sun', 'text-ink'],
  danger: ['bg-danger', 'text-white'],
  ghost: ['', 'text-sub'],
  gray: ['bg-[#5d6268]', 'text-white'],
};
export function Btn({
  children,
  kind = 'primary',
  onPress,
  className,
  disabled,
  small,
  loading,
  icon,
}: {
  children: ReactNode;
  kind?: BtnKind;
  onPress?: () => void;
  className?: string;
  disabled?: boolean;
  small?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}) {
  const [bg, fg] = BTN[kind];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      className={cx(
        'flex-row items-center justify-center rounded-2xl active:opacity-80',
        small ? 'h-11' : 'h-[52px]',
        bg,
        (disabled || loading) && 'opacity-40',
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator color={fg === 'text-white' ? '#fff' : C.ink} />
      ) : (
        <>
          {icon}
          {typeof children === 'string' ? (
            <Text
              className={cx(
                'font-semibold',
                small ? 'text-[14px]' : 'text-[15px]',
                fg,
                icon ? 'ml-1.5' : '',
              )}
            >
              {children}
            </Text>
          ) : (
            children
          )}
        </>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  className,
  onPress,
  tone = 'cream',
}: {
  children: ReactNode;
  className?: string;
  onPress?: () => void;
  tone?: 'cream' | 'white' | 'mint' | 'night';
}) {
  const t = {
    cream: 'bg-cream',
    white: 'bg-white border border-line',
    mint: 'bg-mint',
    night: 'bg-night',
  }[tone];
  if (!onPress) return <View className={cx('rounded-2xl', t, className)}>{children}</View>;
  return (
    <Pressable onPress={onPress} className={cx('rounded-2xl active:opacity-80', t, className)}>
      {children}
    </Pressable>
  );
}

export function Row({
  children,
  sub,
  right,
  onPress,
  chevron,
  danger,
}: {
  children: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  const inner = (
    <>
      <View className="flex-1">
        {typeof children === 'string' ? (
          <Text className={cx('text-[15px]', danger ? 'text-danger' : 'text-ink')}>{children}</Text>
        ) : (
          children
        )}
        {sub ? <Text className="mt-0.5 text-[12px] text-sub">{sub}</Text> : null}
      </View>
      {right}
      {chevron && <ChevronRight size={18} color={C.sub} />}
    </>
  );
  const cls = 'min-h-[54px] flex-row items-center gap-3 px-4 py-3';
  return onPress ? (
    <Pressable onPress={onPress} className={cx(cls, 'active:bg-black/5')}>
      {inner}
    </Pressable>
  ) : (
    <View className={cls}>{inner}</View>
  );
}

export const Group = ({ children, className }: { children: ReactNode; className?: string }) => {
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View className={cx('overflow-hidden rounded-2xl bg-cream', className)}>
      {items.map((c, i) => (
        <View key={i} className={i ? 'border-t border-line' : ''}>
          {c}
        </View>
      ))}
    </View>
  );
};

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <Switch
      accessibilityLabel={label}
      value={on}
      onValueChange={onChange}
      trackColor={{ true: C.brand, false: C['cream-2'] }}
      thumbColor="#fff"
      ios_backgroundColor={C['cream-2']}
    />
  );
}

export function Chip({
  children,
  on,
  onPress,
  className,
  small,
}: {
  children: ReactNode;
  on?: boolean;
  onPress?: () => void;
  className?: string;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cx(
        'items-center justify-center rounded-full',
        small ? 'h-8 px-3' : 'h-9 px-4',
        on ? 'bg-brand' : 'bg-cream',
        className,
      )}
    >
      {typeof children === 'string' ? (
        <Text
          className={cx(
            'font-medium',
            small ? 'text-[13px]' : 'text-[14px]',
            on ? 'text-white' : 'text-ink/80',
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function Segment<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: readonly T[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <View className={cx('flex-row rounded-xl bg-cream p-1', className)}>
      {items.map((it) => (
        <Pressable
          key={it}
          onPress={() => onChange(it)}
          className={cx(
            'h-9 flex-1 items-center justify-center rounded-lg',
            value === it && 'bg-brand',
          )}
        >
          <Text className={cx('text-[14px] font-medium', value === it ? 'text-white' : 'text-sub')}>
            {it}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  right,
  multiline,
  className,
  autoFocus,
  invalid,
  ...rest
}: TextInputProps & { right?: ReactNode; invalid?: boolean }) {
  return (
    <View
      className={cx(
        'flex-row items-center rounded-xl border bg-white px-4',
        invalid ? 'border-danger' : 'border-line',
        className,
      )}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.sub}
        multiline={multiline}
        autoFocus={autoFocus}
        className={cx('flex-1 text-[15px] text-ink', multiline ? 'min-h-28 py-3' : 'h-12')}
        style={multiline ? { textAlignVertical: 'top' } : undefined}
        {...rest}
      />
      {typeof right === 'string' ? <Text className="text-[12px] text-sub">{right}</Text> : right}
    </View>
  );
}

export function Search({
  value,
  onChangeText,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  onSubmit?: () => void;
}) {
  return (
    <View className="h-11 flex-row items-center rounded-xl bg-cream px-4">
      <SearchIcon size={16} color={C.sub} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        placeholder={placeholder}
        placeholderTextColor={C.sub}
        className="ml-2 h-11 flex-1 text-[14px] text-ink"
      />
    </View>
  );
}

/** 하단 시트. 바깥(딤)을 누르면 닫힌다. */
export function Sheet({
  open,
  onClose,
  children,
  title,
  right,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <Pressable
          accessibilityLabel="닫기"
          className="absolute inset-0 bg-black/45"
          onPress={onClose}
        />
        <Animated.View
          entering={SlideInDown.duration(260)}
          className="max-h-[88%] rounded-t-[28px] bg-white px-5 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, 20) }}
        >
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-cream-2" />
          {(title || right) && (
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[18px] font-bold text-ink">{title}</Text>
              {right ?? (
                <Pressable accessibilityLabel="닫기" onPress={onClose} hitSlop={10}>
                  <X size={20} color={C.sub} />
                </Pressable>
              )}
            </View>
          )}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Dialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 items-center justify-center px-8">
        <Pressable className="absolute inset-0 bg-black/45" onPress={onClose} />
        <Animated.View
          entering={ZoomIn.duration(180)}
          className="w-full items-center rounded-3xl bg-white p-6"
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** 경고 · 오류 다이얼로그 (p.97~102 공통 패턴) */
export function Alert({
  open,
  icon = '!',
  tone = 'danger',
  title,
  body,
  primary,
  secondary,
  onPrimary,
  onSecondary,
  extra,
}: {
  open: boolean;
  icon?: ReactNode;
  tone?: 'danger' | 'sun' | 'brand';
  title: ReactNode;
  body?: ReactNode;
  primary: string;
  secondary?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  extra?: ReactNode;
}) {
  const [bg, fg] = {
    danger: ['bg-danger/10', 'text-danger'],
    sun: ['bg-sun/20', 'text-[#b07d0c]'],
    brand: ['bg-mint', 'text-brand'],
  }[tone];
  return (
    <Dialog open={open} onClose={onSecondary}>
      <View className={cx('mb-3 h-12 w-12 items-center justify-center rounded-full', bg)}>
        {typeof icon === 'string' ? (
          <Text className={cx('text-[22px] font-bold', fg)}>{icon}</Text>
        ) : (
          icon
        )}
      </View>
      {typeof title === 'string' ? (
        <Text className="text-center text-[17px] font-bold leading-snug text-ink">{title}</Text>
      ) : (
        title
      )}
      {body ? (
        <Text className="mt-2 text-center text-[13px] leading-5 text-sub">{body}</Text>
      ) : null}
      {extra}
      <View className="mt-5 w-full flex-row gap-2">
        {secondary && (
          <View className="flex-1">
            <Btn kind="outline" small onPress={onSecondary}>
              {secondary}
            </Btn>
          </View>
        )}
        <View className="flex-1">
          <Btn small onPress={onPrimary}>
            {primary}
          </Btn>
        </View>
      </View>
    </Dialog>
  );
}

export function Empty({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <View className="items-center px-6 py-14">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-mint">
        {typeof icon === 'string' ? <Text className="text-[28px]">{icon}</Text> : icon}
      </View>
      <Text className="text-center text-[16px] font-bold text-ink">{title}</Text>
      {body ? (
        <Text className="mt-1.5 text-center text-[13px] leading-5 text-sub">{body}</Text>
      ) : null}
      {children && <View className="mt-6 w-[220px]">{children}</View>}
    </View>
  );
}

export function Success({
  title,
  body,
  card,
  children,
}: {
  title: string;
  body: string;
  card?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View className="items-center pt-24">
      <Animated.View
        entering={ZoomIn}
        className="h-20 w-20 items-center justify-center rounded-full bg-mint"
      >
        <Text className="text-[34px] text-brand">✓</Text>
      </Animated.View>
      <Text className="mt-5 text-[19px] font-bold text-ink">{title}</Text>
      <Text className="mt-1.5 text-center text-[13px] text-sub">{body}</Text>
      {card && <View className="mt-6 w-full">{card}</View>}
      {children}
    </View>
  );
}

export const Badge = ({
  children,
  tone = 'mint',
}: {
  children: ReactNode;
  tone?: 'mint' | 'sun' | 'gray' | 'dark' | 'danger';
}) => {
  const [bg, fg] = {
    mint: ['bg-mint', 'text-brand'],
    sun: ['bg-sun', 'text-ink'],
    gray: ['bg-cream-2', 'text-sub'],
    dark: ['bg-brand', 'text-white'],
    danger: ['bg-danger/10', 'text-danger'],
  }[tone];
  return (
    <View className={cx('h-6 items-center justify-center self-start rounded-full px-2.5', bg)}>
      <Text className={cx('text-[12px] font-semibold', fg)}>{children}</Text>
    </View>
  );
};

export const Avatar = ({
  name,
  size = 44,
  face,
  tone = 'brand',
}: {
  name?: string;
  size?: number;
  face?: string;
  tone?: 'brand' | 'mint';
}) => (
  <View
    className={cx(
      'items-center justify-center rounded-full',
      tone === 'brand' ? 'bg-brand' : 'bg-mint',
    )}
    style={{ width: size, height: size }}
  >
    <Text
      className={cx('font-bold', tone === 'brand' ? 'text-white' : 'text-brand')}
      style={{ fontSize: face ? size * 0.55 : size * 0.4 }}
    >
      {face ?? (name && name.length > 1 ? name.slice(-2, -1) : name)}
    </Text>
  </View>
);

export const Progress = ({
  value,
  className,
  tone = 'brand',
}: {
  value: number;
  className?: string;
  tone?: 'brand' | 'sun' | 'danger';
}) => (
  <View className={cx('h-1.5 overflow-hidden rounded-full bg-cream-2', className)}>
    <View
      className={cx(
        'h-full rounded-full',
        { brand: 'bg-brand', sun: 'bg-sun', danger: 'bg-danger' }[tone],
      )}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </View>
);

/** 원형(파이) 진행률 — AI 변환 · 삭제 중 표시 */
export function Pie({
  value,
  size = 120,
  color = C.brand,
}: {
  value: number;
  size?: number;
  color?: string;
}) {
  const r = size / 2;
  const v = Math.max(0, Math.min(99.99, value)) / 100;
  const a = v * 2 * Math.PI - Math.PI / 2;
  const x = r + r * Math.cos(a),
    y = r + r * Math.sin(a);
  return (
    <Svg width={size} height={size}>
      {value >= 100 ? (
        <Circle cx={r} cy={r} r={r} fill={color} />
      ) : (
        v > 0 && (
          <Path
            d={`M${r},${r} L${r},0 A${r},${r} 0 ${v > 0.5 ? 1 : 0} 1 ${x},${y} Z`}
            fill={color}
          />
        )
      )}
    </Svg>
  );
}

/** 원형 링 진행률 — 프로필 생성 */
export function Ring({
  value,
  size = 176,
  stroke = 8,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={C.mint}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={C.brand}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${len}`}
          strokeDashoffset={len * (1 - value / 100)}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

export const Dashed = ({ children, onPress }: { children: string; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    className="mt-2 h-12 items-center justify-center rounded-2xl border border-dashed border-brand/50 active:bg-mint"
  >
    <Text className="text-[14px] font-semibold text-brand">{children}</Text>
  </Pressable>
);

export const Fade = ({ children, className }: { children: ReactNode; className?: string }) => (
  <Animated.View entering={FadeIn} className={className}>
    {children}
  </Animated.View>
);

export const Loading = () => (
  <View className="flex-1 items-center justify-center py-20">
    <ActivityIndicator color={C.brand} />
  </View>
);

/** 0→100 으로 차오르는 진행률 (로컬 연출용) */
export function useProgress(ms: number, onDone?: () => void, start = 0) {
  const [v, setV] = useState(start);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const step = 100 / (ms / 60);
    const id = setInterval(() => setV((p) => Math.min(100, p + step)), 60);
    return () => clearInterval(id);
  }, [ms]);
  useEffect(() => {
    if (v >= 100) done.current?.();
  }, [v]);
  return Math.round(v);
}

/** 아래에 고정되지 않는 두 버튼 가로 배치 */
export const Two = ({ children }: { children: [ReactNode, ReactNode] }) => (
  <View className="flex-row gap-2">
    <View className="flex-1">{children[0]}</View>
    <View className="flex-1">{children[1]}</View>
  </View>
);
