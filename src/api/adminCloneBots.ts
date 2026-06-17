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
};
