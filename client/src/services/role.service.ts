import api from './api';

// A "role" in this system is a fixed set of four access levels. The list is
// driven by the server so the UI never hardcodes a role that no longer exists.
export interface RoleAccess {
  key: string;
  label: string;
  description: string;
  view: boolean;
  edit: boolean;
}

export const roleService = {
  /**
   * Returns the four access levels with their current View / Edit grants.
   *
   * The grants are stored as a single application setting (one row per role,
   * keyed by the role key). Super Admin and HR Admin always keep View; only
   * Manager / Employee grants are mutable, so that the two privileged levels
   * can never be locked out of the system.
   */
  async get(): Promise<RoleAccess[]> {
    const { data } = await api.get<{ roles: RoleAccess[] }>('/roles/access');
    return data.roles;
  },

  async update(key: string, grants: { view: boolean; edit: boolean }): Promise<RoleAccess[]> {
    const { data } = await api.patch<{ roles: RoleAccess[] }>(`/roles/access/${key}`, grants);
    return data.roles;
  },
};
