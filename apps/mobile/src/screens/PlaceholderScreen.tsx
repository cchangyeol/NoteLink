import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

type Props = {
  title: string;
};

/** 아직 만들지 않은 화면 자리 표시 */
export function PlaceholderScreen({ title }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '600' },
});
