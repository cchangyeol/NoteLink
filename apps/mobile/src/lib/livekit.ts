import { useEffect, useState } from 'react';
import { api } from './api';
import { socket } from './socket';

// 캠 · 음성 스터디 (LiveKit Cloud). 입장 토큰은 메인 API가 발급하고, 영상 · 음성은 앱이 LiveKit에 직접 연결한다 (p.19).
// 마이크 · 카메라 상태는 Socket.IO로 다른 멤버에게도 알린다.
// TODO(스터디룸 담당): @livekit/react-native 설치 후 connect()에서 Room.connect(url, token) 호출

export function useLiveRoom(roomId: string) {
  const [micOn, setMic] = useState(true);
  const [camOn, setCam] = useState(true);
  const [token, setToken] = useState<{ token: string; url: string } | null>(null);

  useEffect(() => {
    let alive = true;
    api.rooms
      .livekitToken(roomId)
      .then((t) => alive && setToken(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roomId]);

  useEffect(() => {
    socket.emit('room:state', { roomId, micOn, camOn, todaySec: 0 });
  }, [roomId, micOn, camOn]);

  return {
    connected: !!token,
    token,
    micOn,
    camOn,
    toggleMic: () => setMic((v) => !v),
    toggleCam: () => setCam((v) => !v),
  };
}
