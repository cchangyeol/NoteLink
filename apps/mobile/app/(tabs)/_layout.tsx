import { Tabs } from 'expo-router';

// 하단 탭 5개 (세팅안 v2 6장). 화면 내용은 각 담당자가 채웁니다.
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="note" options={{ title: '노트' }} />
      <Tabs.Screen name="quiz" options={{ title: '퀴즈' }} />
      <Tabs.Screen name="studyroom" options={{ title: '스터디룸' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  );
}
