import api from './api';

// Personal-information fields (item: profile personal section). Stored in the
// `employee_personal_profiles` table joined by employee code.
export interface PersonalProfile {
  address: string;
  dateOfBirth: string;
  emergencyContact: string;
  personalEmail: string;
  anniversaryDate: string;
}

export const personalProfileService = {
  // The calling user's personal profile (empty shape when none exists yet).
  async getMine(): Promise<PersonalProfile> {
    const { data } = await api.get<PersonalProfile>('/me/personal-profile');
    return data;
  },

  // Upsert the calling user's personal profile. Dates are `YYYY-MM-DD` strings.
  async updateMine(payload: Partial<PersonalProfile>): Promise<PersonalProfile> {
    const { data } = await api.put<PersonalProfile>('/me/personal-profile', payload);
    return data;
  },
};
