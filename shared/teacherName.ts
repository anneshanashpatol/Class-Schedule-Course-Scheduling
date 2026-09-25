import type { Role } from './domain';

const compoundSurnames = ['欧阳', '司马', '上官', '诸葛', '东方', '皇甫', '尉迟', '公孙', '慕容', '令狐', '宇文', '司徒', '司空', '长孙', '夏侯'];

export function teacherNameForViewer(name: string, role?: Role) {
  if (role !== 'STUDENT') return name;
  const trimmed = name.trim();
  const surname = compoundSurnames.find((value) => trimmed.startsWith(value)) ?? Array.from(trimmed)[0];
  return surname ? `${surname}老师` : '';
}
