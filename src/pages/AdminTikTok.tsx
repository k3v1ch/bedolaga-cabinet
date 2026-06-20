import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  tiktokApi,
  type AdminTikTokApplicationItem,
  type AdminTikTokCreatorItem,
} from '../api/tiktok';
import { AdminBackButton } from '../components/admin';
import { useCurrency } from '../hooks/useCurrency';
import { useToast } from '../components/Toast';
import { usePrompt } from '../store/promptDialog';
import { ChevronRightIcon } from '@/components/icons';

function extractError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

export default function AdminTikTok() {
  const { t } = useTranslation();
  const { formatWithCurrency } = useCurrency();
  const { showToast } = useToast();
  const prompt = usePrompt();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'applications' | 'creators'>('applications');
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  // Local modals (the shared usePrompt treats an empty input as cancel, so it can't
  // carry an OPTIONAL comment — these dialogs let the comment be blank).
  const [reviewModal, setReviewModal] = useState<{
    app: AdminTikTokApplicationItem;
    mode: 'approve' | 'reject';
  } | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [earningModal, setEarningModal] = useState<{ creator: AdminTikTokCreatorItem } | null>(null);
  const [earningAmount, setEarningAmount] = useState('');
  const [earningComment, setEarningComment] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['admin-tiktok-stats'],
    queryFn: () => tiktokApi.getStats(),
  });

  const { data: applicationsData, isLoading: applicationsLoading } = useQuery({
    queryKey: ['admin-tiktok-applications'],
    queryFn: () => tiktokApi.getApplications({ status: 'pending' }),
  });

  const { data: creatorsData, isLoading: creatorsLoading } = useQuery({
    queryKey: ['admin-tiktok-creators'],
    queryFn: () => tiktokApi.getCreators(),
  });

  const { data: earningsData } = useQuery({
    queryKey: ['admin-tiktok-earnings', expandedUserId],
    queryFn: () => tiktokApi.getEarnings(expandedUserId as number),
    enabled: expandedUserId != null,
  });

  const applications = applicationsData?.items || [];
  const creators = creatorsData?.items || [];

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-tiktok-stats'] });
    queryClient.invalidateQueries({ queryKey: ['admin-tiktok-applications'] });
    queryClient.invalidateQueries({ queryKey: ['admin-tiktok-creators'] });
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, comment }: { id: number; comment?: string }) =>
      tiktokApi.approveApplication(id, { comment }),
    onSuccess: () => {
      showToast({ type: 'success', message: t('admin.tiktok.toasts.approved') });
      refreshAll();
    },
    onError: (err) => showToast({ type: 'error', message: extractError(err, t('common.error')) }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: number; comment?: string }) =>
      tiktokApi.rejectApplication(id, { comment }),
    onSuccess: () => {
      showToast({ type: 'success', message: t('admin.tiktok.toasts.rejected') });
      refreshAll();
    },
    onError: (err) => showToast({ type: 'error', message: extractError(err, t('common.error')) }),
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: number) => tiktokApi.revokeCreator(userId),
    onSuccess: () => {
      showToast({ type: 'success', message: t('admin.tiktok.toasts.revoked') });
      refreshAll();
    },
    onError: (err) => showToast({ type: 'error', message: extractError(err, t('common.error')) }),
  });

  const addEarningMutation = useMutation({
    mutationFn: ({ userId, amount_kopeks, comment }: { userId: number; amount_kopeks: number; comment?: string }) =>
      tiktokApi.addEarning(userId, { amount_kopeks, comment }),
    onSuccess: (_data, vars) => {
      showToast({ type: 'success', message: t('admin.tiktok.toasts.earningAdded') });
      queryClient.invalidateQueries({ queryKey: ['admin-tiktok-earnings', vars.userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-tiktok-creators'] });
      queryClient.invalidateQueries({ queryKey: ['admin-tiktok-stats'] });
    },
    onError: (err) => showToast({ type: 'error', message: extractError(err, t('common.error')) }),
  });

  const deleteEarningMutation = useMutation({
    mutationFn: ({ userId, earningId }: { userId: number; earningId: number }) =>
      tiktokApi.deleteEarning(userId, earningId),
    onSuccess: (_data, vars) => {
      showToast({ type: 'success', message: t('admin.tiktok.toasts.earningDeleted') });
      queryClient.invalidateQueries({ queryKey: ['admin-tiktok-earnings', vars.userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-tiktok-creators'] });
      queryClient.invalidateQueries({ queryKey: ['admin-tiktok-stats'] });
    },
    onError: (err) => showToast({ type: 'error', message: extractError(err, t('common.error')) }),
  });

  const openReview = (app: AdminTikTokApplicationItem, mode: 'approve' | 'reject') => {
    setReviewComment('');
    setReviewModal({ app, mode });
  };

  const submitReview = () => {
    if (!reviewModal) return;
    const comment = reviewComment.trim() || undefined;
    if (reviewModal.mode === 'approve') {
      approveMutation.mutate({ id: reviewModal.app.id, comment });
    } else {
      rejectMutation.mutate({ id: reviewModal.app.id, comment });
    }
    setReviewModal(null);
  };

  const handleRevoke = async (creator: AdminTikTokCreatorItem) => {
    const confirm = await prompt({
      title: t('admin.tiktok.actions.revoke'),
      label: t('admin.tiktok.prompts.revokeConfirm'),
      placeholder: t('admin.tiktok.prompts.revokeConfirmWord'),
    });
    if (confirm === null) return;
    revokeMutation.mutate(creator.user_id);
  };

  const openEarning = (creator: AdminTikTokCreatorItem) => {
    setEarningAmount('');
    setEarningComment('');
    setEarningModal({ creator });
  };

  const submitEarning = () => {
    if (!earningModal) return;
    const amount = Number(earningAmount.replace(',', '.').replace(/\s/g, ''));
    if (!Number.isFinite(amount) || amount === 0) {
      showToast({ type: 'error', message: t('admin.tiktok.prompts.amountInvalid') });
      return;
    }
    addEarningMutation.mutate({
      userId: earningModal.creator.user_id,
      amount_kopeks: Math.round(amount * 100),
      comment: earningComment.trim() || undefined,
    });
    setEarningModal(null);
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <AdminBackButton to="/admin" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-dark-100">{t('admin.tiktok.title')}</h1>
          <p className="text-sm text-dark-400">{t('admin.tiktok.subtitle')}</p>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-dark-700 bg-dark-800 p-4">
            <div className="text-2xl font-bold text-dark-100">{stats.total_creators}</div>
            <div className="text-sm text-dark-400">{t('admin.tiktok.totalCreators')}</div>
          </div>
          <div className="rounded-xl border border-dark-700 bg-dark-800 p-4">
            <div className="text-2xl font-bold text-accent-400">{stats.pending_applications}</div>
            <div className="text-sm text-dark-400">{t('admin.tiktok.pendingApplications')}</div>
          </div>
          <div className="rounded-xl border border-dark-700 bg-dark-800 p-4">
            <div className="text-2xl font-bold text-success-400">
              {formatWithCurrency(stats.total_earnings_kopeks / 100)}
            </div>
            <div className="text-sm text-dark-400">{t('admin.tiktok.totalEarnings')}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg border border-dark-700 bg-dark-800/40 p-1">
        <button
          onClick={() => setActiveTab('applications')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'applications'
              ? 'bg-dark-700 text-dark-100'
              : 'text-dark-400 hover:text-dark-200'
          }`}
        >
          {t('admin.tiktok.tabs.applications')}
          {applications.length > 0 && (
            <span className="ml-2 rounded-full bg-accent-500/20 px-2 py-0.5 text-xs text-accent-400">
              {applications.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('creators')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'creators'
              ? 'bg-dark-700 text-dark-100'
              : 'text-dark-400 hover:text-dark-200'
          }`}
        >
          {t('admin.tiktok.tabs.creators')}
        </button>
      </div>

      {/* Applications Tab */}
      {activeTab === 'applications' && (
        <>
          {applicationsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            </div>
          ) : applications.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-dark-400">{t('admin.tiktok.noApplications')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app: AdminTikTokApplicationItem) => (
                <div key={app.id} className="rounded-xl border border-dark-700 bg-dark-800 p-4">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex min-w-0 items-center gap-2">
                        <h3 className="truncate font-medium text-dark-100">
                          {app.display_name || app.first_name || app.username || `#${app.user_id}`}
                        </h3>
                        {app.username && (
                          <span className="shrink-0 text-sm text-dark-500">@{app.username}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mb-3 space-y-1 text-sm text-dark-400">
                    {app.tiktok_url && (
                      <div className="break-all">
                        {t('admin.tiktok.fields.tiktok')}:{' '}
                        <a
                          href={app.tiktok_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-400 hover:underline"
                        >
                          {app.tiktok_url}
                        </a>
                      </div>
                    )}
                    {app.other_platforms && (
                      <div className="break-all">
                        {t('admin.tiktok.fields.otherPlatforms')}: {app.other_platforms}
                      </div>
                    )}
                    {app.audience_size != null && (
                      <div>
                        {t('admin.tiktok.fields.audience')}: {app.audience_size}
                      </div>
                    )}
                    {app.content_topic && (
                      <div>
                        {t('admin.tiktok.fields.topic')}: {app.content_topic}
                      </div>
                    )}
                    {app.description && (
                      <div>
                        {t('admin.tiktok.fields.description')}: {app.description}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openReview(app, 'approve')}
                      disabled={approveMutation.isPending}
                      className="flex-1 rounded-lg bg-success-500/20 px-4 py-2 text-sm font-medium text-success-400 transition-colors hover:bg-success-500/30 disabled:opacity-50"
                    >
                      {t('admin.tiktok.actions.approve')}
                    </button>
                    <button
                      onClick={() => openReview(app, 'reject')}
                      disabled={rejectMutation.isPending}
                      className="flex-1 rounded-lg bg-error-500/20 px-4 py-2 text-sm font-medium text-error-400 transition-colors hover:bg-error-500/30 disabled:opacity-50"
                    >
                      {t('admin.tiktok.actions.reject')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Creators Tab */}
      {activeTab === 'creators' && (
        <>
          {creatorsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            </div>
          ) : creators.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-dark-400">{t('admin.tiktok.noCreators')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {creators.map((creator: AdminTikTokCreatorItem) => {
                const expanded = expandedUserId === creator.user_id;
                return (
                  <div
                    key={creator.user_id}
                    className="rounded-xl border border-dark-700 bg-dark-800 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex min-w-0 items-center gap-2">
                          <h3 className="truncate font-medium text-dark-100">
                            {creator.display_name ||
                              creator.first_name ||
                              creator.username ||
                              `#${creator.user_id}`}
                          </h3>
                          {creator.username && (
                            <span className="shrink-0 text-sm text-dark-500">
                              @{creator.username}
                            </span>
                          )}
                        </div>
                        {creator.tiktok_url && (
                          <a
                            href={creator.tiktok_url}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-sm text-accent-400 hover:underline"
                          >
                            {creator.tiktok_url}
                          </a>
                        )}
                        <div className="mt-1 text-sm font-medium text-success-400">
                          {t('admin.tiktok.earned')}:{' '}
                          {formatWithCurrency(creator.total_earned_kopeks / 100)}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setExpandedUserId(expanded ? null : creator.user_id)
                        }
                        className="rounded-lg bg-dark-700 p-2 text-dark-300 transition-colors hover:bg-dark-600"
                        title={t('admin.tiktok.actions.journal')}
                      >
                        <ChevronRightIcon
                          className={`h-5 w-5 transition-transform ${expanded ? 'rotate-90' : ''}`}
                        />
                      </button>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => openEarning(creator)}
                        disabled={addEarningMutation.isPending}
                        className="flex-1 rounded-lg bg-accent-500/20 px-4 py-2 text-sm font-medium text-accent-400 transition-colors hover:bg-accent-500/30 disabled:opacity-50"
                      >
                        {t('admin.tiktok.actions.addEarning')}
                      </button>
                      <button
                        onClick={() => handleRevoke(creator)}
                        disabled={revokeMutation.isPending}
                        className="rounded-lg bg-error-500/20 px-4 py-2 text-sm font-medium text-error-400 transition-colors hover:bg-error-500/30 disabled:opacity-50"
                      >
                        {t('admin.tiktok.actions.revoke')}
                      </button>
                    </div>

                    {/* Earnings journal */}
                    {expanded && (
                      <div className="mt-3 border-t border-dark-700 pt-3">
                        {!earningsData ? (
                          <div className="py-3 text-center text-sm text-dark-400">
                            {t('common.loading')}
                          </div>
                        ) : earningsData.items.length === 0 ? (
                          <div className="py-3 text-center text-sm text-dark-400">
                            {t('admin.tiktok.noEarnings')}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {earningsData.items.map((e) => (
                              <div
                                key={e.id}
                                className="flex items-center justify-between gap-2 rounded-lg bg-dark-900/40 px-3 py-2 text-sm"
                              >
                                <div className="min-w-0 flex-1">
                                  <div
                                    className={
                                      e.amount_kopeks >= 0
                                        ? 'font-medium text-success-400'
                                        : 'font-medium text-error-400'
                                    }
                                  >
                                    {formatWithCurrency(e.amount_kopeks / 100)}
                                  </div>
                                  {e.comment && (
                                    <div className="truncate text-dark-400">{e.comment}</div>
                                  )}
                                  <div className="text-xs text-dark-500">
                                    {new Date(e.created_at).toLocaleDateString()}
                                  </div>
                                </div>
                                <button
                                  onClick={() =>
                                    deleteEarningMutation.mutate({
                                      userId: creator.user_id,
                                      earningId: e.id,
                                    })
                                  }
                                  className="shrink-0 rounded-md px-2 py-1 text-xs text-error-400 transition-colors hover:bg-error-500/10"
                                >
                                  {t('admin.tiktok.actions.delete')}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Review modal (approve / reject) — comment optional */}
      {reviewModal && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          onClick={() => setReviewModal(null)}
        >
          <div className="absolute inset-0 bg-dark-950/60" aria-hidden="true" />
          <div
            className="relative w-full max-w-sm space-y-4 rounded-xl border border-dark-700 bg-dark-800 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-dark-50">
              {reviewModal.mode === 'approve'
                ? t('admin.tiktok.actions.approve')
                : t('admin.tiktok.actions.reject')}
            </h2>
            <p className="text-sm text-dark-400">
              {reviewModal.app.display_name ||
                reviewModal.app.first_name ||
                reviewModal.app.username ||
                `#${reviewModal.app.user_id}`}
            </p>
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={3}
              placeholder={
                reviewModal.mode === 'approve'
                  ? t('admin.tiktok.prompts.commentOptional')
                  : t('admin.tiktok.prompts.reasonOptional')
              }
              className="w-full resize-none rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-100 outline-none focus:border-dark-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReviewModal(null)}
                className="rounded-lg bg-dark-700 px-4 py-2 text-sm font-medium text-dark-200 transition-colors hover:bg-dark-600"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitReview}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  reviewModal.mode === 'approve'
                    ? 'bg-success-500/20 text-success-400 hover:bg-success-500/30'
                    : 'bg-error-500/20 text-error-400 hover:bg-error-500/30'
                }`}
              >
                {reviewModal.mode === 'approve'
                  ? t('admin.tiktok.actions.approve')
                  : t('admin.tiktok.actions.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add earning modal — amount required, comment optional */}
      {earningModal && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          onClick={() => setEarningModal(null)}
        >
          <div className="absolute inset-0 bg-dark-950/60" aria-hidden="true" />
          <div
            className="relative w-full max-w-sm space-y-4 rounded-xl border border-dark-700 bg-dark-800 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-dark-50">
              {t('admin.tiktok.actions.addEarning')}
            </h2>
            <label className="block">
              <span className="text-sm text-dark-400">
                {t('admin.tiktok.prompts.amountRubles')}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={earningAmount}
                onChange={(e) => setEarningAmount(e.target.value)}
                placeholder="725"
                autoFocus
                className="mt-1 w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-100 outline-none focus:border-dark-500"
              />
            </label>
            <textarea
              value={earningComment}
              onChange={(e) => setEarningComment(e.target.value)}
              rows={2}
              placeholder={t('admin.tiktok.prompts.commentOptional')}
              className="w-full resize-none rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-100 outline-none focus:border-dark-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEarningModal(null)}
                className="rounded-lg bg-dark-700 px-4 py-2 text-sm font-medium text-dark-200 transition-colors hover:bg-dark-600"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitEarning}
                disabled={addEarningMutation.isPending}
                className="rounded-lg bg-accent-500/20 px-4 py-2 text-sm font-medium text-accent-400 transition-colors hover:bg-accent-500/30 disabled:opacity-50"
              >
                {t('admin.tiktok.actions.addEarning')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
