import { create } from 'zustand';
import type { MaterialKind, MaterialSource } from '@notelink/shared';
import type { LocalFile } from '@/lib/upload';

// 촬영 · 선택한 파일을 업로드(AI 변환) 화면까지 넘겨주는 임시 보관함
type Draft = {
  folderId: string | null;
  kind: MaterialKind;
  source: MaterialSource;
  files: LocalFile[];
  title: string;
  description: string;
  avatar: string | null;
  set: (p: Partial<Omit<Draft, 'set' | 'reset'>>) => void;
  reset: () => void;
};

const empty = {
  folderId: null,
  kind: 'handwriting' as MaterialKind,
  source: 'camera' as MaterialSource,
  files: [] as LocalFile[],
  title: '',
  description: '',
  avatar: null,
};

export const useDraft = create<Draft>((set) => ({
  ...empty,
  set: (p) => set(p),
  reset: () => set(empty),
}));
