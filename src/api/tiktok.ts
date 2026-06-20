import apiClient from './client';

// ==================== User-facing types ====================

export interface TikTokApplicationInfo {
  id: number;
  status: string;
  display_name: string | null;
  tiktok_url: string | null;
  other_platforms: string | null;
  audience_size: number | null;
  content_topic: string | null;
  description: string | null;
  admin_comment: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface TikTokStatusResponse {
  tiktok_status: string;
  support_username: string;
  total_earned_kopeks: number;
  latest_application: TikTokApplicationInfo | null;
}

export interface TikTokApplicationRequest {
  display_name?: string;
  tiktok_url?: string;
  other_platforms?: string;
  audience_size?: number;
  content_topic?: string;
  description?: string;
}

// ==================== Admin-facing types ====================

export interface AdminTikTokApplicationItem {
  id: number;
  user_id: number;
  username: string | null;
  first_name: string | null;
  telegram_id: number | null;
  display_name: string | null;
  tiktok_url: string | null;
  other_platforms: string | null;
  audience_size: number | null;
  content_topic: string | null;
  description: string | null;
  status: string;
  admin_comment: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface AdminTikTokApplicationsResponse {
  items: AdminTikTokApplicationItem[];
  total: number;
}

export interface AdminTikTokCreatorItem {
  user_id: number;
  username: string | null;
  first_name: string | null;
  telegram_id: number | null;
  display_name: string | null;
  tiktok_url: string | null;
  total_earned_kopeks: number;
  tiktok_status: string;
  created_at: string;
}

export interface AdminTikTokCreatorsResponse {
  items: AdminTikTokCreatorItem[];
  total: number;
}

export interface TikTokEarningItem {
  id: number;
  amount_kopeks: number;
  comment: string | null;
  created_at: string;
}

export interface TikTokEarningsResponse {
  items: TikTokEarningItem[];
  total_kopeks: number;
}

export interface TikTokStats {
  total_creators: number;
  pending_applications: number;
  total_earnings_kopeks: number;
}

export const tiktokApi = {
  // User endpoints
  getStatus: async (): Promise<TikTokStatusResponse> => {
    const response = await apiClient.get<TikTokStatusResponse>('/cabinet/tiktok/status');
    return response.data;
  },

  apply: async (data: TikTokApplicationRequest): Promise<TikTokApplicationInfo> => {
    const response = await apiClient.post<TikTokApplicationInfo>('/cabinet/tiktok/apply', data);
    return response.data;
  },

  // Admin endpoints
  getStats: async (): Promise<TikTokStats> => {
    const response = await apiClient.get<TikTokStats>('/cabinet/admin/tiktok/stats');
    return response.data;
  },

  getApplications: async (params?: {
    status?: string;
    offset?: number;
    limit?: number;
  }): Promise<AdminTikTokApplicationsResponse> => {
    const response = await apiClient.get<AdminTikTokApplicationsResponse>(
      '/cabinet/admin/tiktok/applications',
      { params },
    );
    return response.data;
  },

  approveApplication: async (applicationId: number, data: { comment?: string }): Promise<void> => {
    await apiClient.post(`/cabinet/admin/tiktok/applications/${applicationId}/approve`, data);
  },

  rejectApplication: async (applicationId: number, data: { comment?: string }): Promise<void> => {
    await apiClient.post(`/cabinet/admin/tiktok/applications/${applicationId}/reject`, data);
  },

  getCreators: async (params?: {
    offset?: number;
    limit?: number;
  }): Promise<AdminTikTokCreatorsResponse> => {
    const response = await apiClient.get<AdminTikTokCreatorsResponse>('/cabinet/admin/tiktok/creators', {
      params,
    });
    return response.data;
  },

  revokeCreator: async (userId: number): Promise<void> => {
    await apiClient.post(`/cabinet/admin/tiktok/${userId}/revoke`);
  },

  getEarnings: async (userId: number): Promise<TikTokEarningsResponse> => {
    const response = await apiClient.get<TikTokEarningsResponse>(
      `/cabinet/admin/tiktok/${userId}/earnings`,
    );
    return response.data;
  },

  addEarning: async (
    userId: number,
    data: { amount_kopeks: number; comment?: string },
  ): Promise<void> => {
    await apiClient.post(`/cabinet/admin/tiktok/${userId}/earnings`, data);
  },

  deleteEarning: async (userId: number, earningId: number): Promise<void> => {
    await apiClient.delete(`/cabinet/admin/tiktok/${userId}/earnings/${earningId}`);
  },
};
