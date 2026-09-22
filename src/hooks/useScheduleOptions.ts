import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { PersonOption } from '../types';

export function useScheduleOptions() {
  const [options, setOptions] = useState<{ students: PersonOption[]; teachers: PersonOption[] }>({ students: [], teachers: [] });
  useEffect(() => { api<typeof options>('/schedule-options').then(setOptions).catch(() => undefined); }, []);
  return options;
}
