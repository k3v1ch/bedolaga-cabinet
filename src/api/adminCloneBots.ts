import apiClient from './client';

export interface CloneBotItem {
  id: number;
  bot_id: number;
  bot_username: string | null;
  bot_title: string | null;
  status: string;
  external_squad_name: string | null;
  profile_title: string | null;
  owner_user_id: number;
  users_brought: number;
  revenue_kopeks: number;
  real_topup_kopeks: number;
  pricing_markup_pct: number;
  last_error: string | null;
  created_at: string | null;
}

export interface CloneBotListResponse {
  items: CloneBotItem[];
  total: number;
}

export interface CloneOwner {
  user_id: number;
  telegram_id: number | null;
  username: string | null;
  full_name: string | null;
}

export interface CloneBroughtUser {
  id: number;
  telegram_id: number | null;
  username: string | null;
  full_name: string | null;
  status: string;
  balance_kopeks: number;
  has_active_subscription: boolean;
  created_at: string | null;
}

export interface CloneBotDetail extends CloneBotItem {
  owner: CloneOwner | null;
  active_subscribers: number;
  users: CloneBroughtUser[];
}

export type CloneStatsPeriod = 'day' | 'week' | 'month' | 'all';

export interface CloneStats {
  period: CloneStatsPeriod;
  new_users: number;
  purchases: number;
  real_topup_kopeks: number;
  owner_reward_kopeks: number;
  owner_reward_days: number;
}

export interface CloneLinkItem {
  id: number;
  name: string;
  url: string;
  clicks_count: number;
  registrations_count: number;
  real_topup_kopeks: number;
  created_at: string | null;
}

export interface CloneLinksResponse {
  items: CloneLinkItem[];
  max_links: number;
}

export const adminCloneBotsApi = {
  list: async (): Promise<CloneBotListResponse> => {
    const { data } = await apiClient.get<CloneBotListResponse>('/cabinet/admin/clone-bots');
    return data;
  },
  detail: async (id: number): Promise<CloneBotDetail> => {
    const { data } = await apiClient.get<CloneBotDetail>(`/cabinet/admin/clone-bots/${id}/detail`);
    return data;
  },
  toggle: async (id: number): Promise<{ id: number; status: string }> => {
    const { data } = await apiClient.post<{ id: number; status: string }>(
      `/cabinet/admin/clone-bots/${id}/toggle`,
    );
    return data;
  },
  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`/cabinet/admin/clone-bots/${id}`);
  },
  stats: async (id: number, period: CloneStatsPeriod): Promise<CloneStats> => {
    const { data } = await apiClient.get<CloneStats>(`/cabinet/admin/clone-bots/${id}/stats`, {
      params: { period },
    });
    return data;
  },
  setMarkup: async (
    id: number,
    pct: number,
  ): Promise<{ id: number; pricing_markup_pct: number }> => {
    const { data } = await apiClient.patch<{ id: number; pricing_markup_pct: number }>(
      `/cabinet/admin/clone-bots/${id}/markup`,
      { pct },
    );
    return data;
  },
  rename: async (id: number, title: string): Promise<{ id: number; profile_title: string }> => {
    const { data } = await apiClient.patch<{ id: number; profile_title: string }>(
      `/cabinet/admin/clone-bots/${id}/title`,
      { title },
    );
    return data;
  },
  setToken: async (
    id: number,
    token: string,
  ): Promise<{ id: number; bot_username: string | null }> => {
    const { data } = await apiClient.put<{ id: number; bot_username: string | null }>(
      `/cabinet/admin/clone-bots/${id}/token`,
      { token },
    );
    return data;
  },
  links: async (id: number): Promise<CloneLinksResponse> => {
    const { data } = await apiClient.get<CloneLinksResponse>(
      `/cabinet/admin/clone-bots/${id}/links`,
    );
    return data;
  },
  createLink: async (id: number, name: string): Promise<CloneLinkItem> => {
    const { data } = await apiClient.post<CloneLinkItem>(`/cabinet/admin/clone-bots/${id}/links`, {
      name,
    });
    return data;
  },
  deleteLink: async (id: number, linkId: number): Promise<void> => {
    await apiClient.delete(`/cabinet/admin/clone-bots/${id}/links/${linkId}`);
  },
};
