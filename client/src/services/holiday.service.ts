import api from './api';

export interface Holiday {
  id: number;
  name: string;
  date: string;
  isRecurring: boolean;
}

export const holidayService = {
  async list(): Promise<Holiday[]> {
    const { data } = await api.get<Holiday[]>('/holidays');
    return data;
  },
};
