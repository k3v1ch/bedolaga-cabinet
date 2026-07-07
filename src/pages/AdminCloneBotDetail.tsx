import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminCloneBotsApi,
  type CloneBroughtUser,
  type CloneStatsPeriod,
} from '../api/adminCloneBots';
import { BackIcon } from '@/components/icons';
import { useToast } from '../components/Toast';
import { useDestructiveConfirm } from '../platform/hooks/useNativeDialog';
import { copyToClipboard } from '@/utils/clipboard';

const STATUS_LABEL: Record<string, string> = {
  active: '🟢 активен',
  disabled: '⚪️ выключен',
  pending: '🟡 создаётся',
  error: '🔴 ошибка',
};

const PERIODS: { key: CloneStatsPeriod; label: string }[] = [
  { key: 'day', label: 'День' },
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'all', label: 'Всё время' },
];

const ERROR_LABEL: Record<string, string> = {
  invalid_title: 'Название: 1–40 символов, только латиница, цифры, пробел, «-» и «_»',
  invalid_token_format: 'Это не похоже на токен бота от BotFather',
  token_rejected: 'Telegram отклонил токен (возможно, он отозван)',
  token_wrong_bot: 'Это токен другого бота — нужен новый токен этого же бота',
  links_limit_reached: 'Достигнут лимит рекламных ссылок',
  invalid_name: 'Название ссылки: от 1 до 50 символов',
};

function errMsg(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return (typeof detail === 'string' && ERROR_LABEL[detail]) || 'Не удалось выполнить действие';
}

function rub(kopeks: number | null | undefined): string {
  return `${Math.round((kopeks ?? 0) / 100)}₽`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
      <div className="text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-white/50">{label}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-white/40">{children}</h2>
  );
}

const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-white/25';
const smallBtnCls =
  'shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function userName(u: { full_name: string | null; username: string | null; id: number }): string {
  if (u.full_name) return u.full_name;
  if (u.username) return `@${u.username}`;
  return `ID ${u.id}`;
}

export default function AdminCloneBotDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirmDelete = useDestructiveConfirm();
  const { id } = useParams<{ id: string }>();
  const cloneId = Number(id);

  const [period, setPeriod] = useState<CloneStatsPeriod>('all');
  const [markupInput, setMarkupInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [linkName, setLinkName] = useState('');

  const { data: c, isLoading } = useQuery({
    queryKey: ['admin-clone-bot', cloneId],
    queryFn: () => adminCloneBotsApi.detail(cloneId),
    enabled: Number.isFinite(cloneId),
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-clone-bot-stats', cloneId, period],
    queryFn: () => adminCloneBotsApi.stats(cloneId, period),
    enabled: Number.isFinite(cloneId),
  });

  const { data: links } = useQuery({
    queryKey: ['admin-clone-bot-links', cloneId],
    queryFn: () => adminCloneBotsApi.links(cloneId),
    enabled: Number.isFinite(cloneId),
  });

  const invalidateDetail = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-clone-bot', cloneId] });
    queryClient.invalidateQueries({ queryKey: ['admin-clone-bots'] });
  };

  const toggle = useMutation({
    mutationFn: () => adminCloneBotsApi.toggle(cloneId),
    onSuccess: invalidateDetail,
  });
  const remove = useMutation({
    mutationFn: () => adminCloneBotsApi.remove(cloneId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clone-bots'] });
      navigate('/admin/clone-bots');
    },
  });

  const setMarkup = useMutation({
    mutationFn: (pct: number) => adminCloneBotsApi.setMarkup(cloneId, pct),
    onSuccess: (r) => {
      invalidateDetail();
      setMarkupInput('');
      showToast({
        type: 'success',
        message:
          r.pricing_markup_pct > 0
            ? `Наценка установлена: ${r.pricing_markup_pct}%`
            : 'Наценка отключена — базовые цены',
      });
    },
    onError: (e) => showToast({ type: 'error', message: errMsg(e) }),
  });

  const rename = useMutation({
    mutationFn: (title: string) => adminCloneBotsApi.rename(cloneId, title),
    onSuccess: (r) => {
      invalidateDetail();
      setTitleInput('');
      showToast({ type: 'success', message: `Название обновлено: ${r.profile_title}` });
    },
    onError: (e) => showToast({ type: 'error', message: errMsg(e) }),
  });

  const setToken = useMutation({
    mutationFn: (token: string) => adminCloneBotsApi.setToken(cloneId, token),
    onSuccess: (r) => {
      invalidateDetail();
      setTokenInput('');
      showToast({
        type: 'success',
        message: `Токен обновлён. Бот @${r.bot_username ?? ''} перезапущен`,
      });
    },
    onError: (e) => showToast({ type: 'error', message: errMsg(e) }),
  });

  const createLink = useMutation({
    mutationFn: (name: string) => adminCloneBotsApi.createLink(cloneId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clone-bot-links', cloneId] });
      setLinkName('');
      showToast({ type: 'success', message: 'Ссылка создана' });
    },
    onError: (e) => showToast({ type: 'error', message: errMsg(e) }),
  });

  const deleteLink = useMutation({
    mutationFn: (linkId: number) => adminCloneBotsApi.deleteLink(cloneId, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clone-bot-links', cloneId] });
      showToast({ type: 'success', message: 'Ссылка удалена' });
    },
    onError: (e) => showToast({ type: 'error', message: errMsg(e) }),
  });

  const submitMarkup = () => {
    const pct = Number(markupInput.trim().replace('%', ''));
    if (!Number.isInteger(pct) || pct < 0 || pct > 500) {
      showToast({ type: 'error', message: 'Наценка — целое число от 0 до 500' });
      return;
    }
    setMarkup.mutate(pct);
  };

  const copyLink = async (url: string) => {
    try {
      await copyToClipboard(url);
      showToast({ type: 'success', message: 'Ссылка скопирована' });
    } catch {
      showToast({ type: 'error', message: 'Не удалось скопировать' });
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => navigate('/admin/clone-bots')}
          className="mb-4 flex items-center gap-2 text-white/60 transition-colors hover:text-white"
        >
          <BackIcon />
          Назад
        </button>

        {isLoading ? (
          <p className="text-white/50">Загрузка…</p>
        ) : !c ? (
          <p className="text-white/50">Бот не найден.</p>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between gap-3">
              <h1 className="truncate text-2xl font-semibold">@{c.bot_username ?? c.bot_id}</h1>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => toggle.mutate()}
                  disabled={toggle.isPending}
                  className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {c.status === 'active' ? 'Выключить' : 'Включить'}
                </button>
                <button
                  onClick={async () => {
                    if (
                      await confirmDelete('Удалить клон-бота? Он перестанет работать.', 'Удалить')
                    ) {
                      remove.mutate();
                    }
                  }}
                  disabled={remove.isPending}
                  className="rounded-full border border-red-500/30 px-4 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  Удалить
                </button>
              </div>
            </div>
            <p className="mb-5 text-sm text-white/50">
              {STATUS_LABEL[c.status] ?? c.status}
              {c.bot_title ? ` · ${c.bot_title}` : ''} · создан {fmtDate(c.created_at)}
            </p>

            {c.last_error && (
              <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-3 text-sm text-red-300">
                ⚠️ {c.last_error}
              </div>
            )}

            {/* Создатель */}
            <SectionTitle>Создатель</SectionTitle>
            <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              {c.owner ? (
                <button
                  onClick={() => navigate(`/admin/users/${c.owner!.user_id}`)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {c.owner.full_name ??
                        (c.owner.username ? `@${c.owner.username}` : `ID ${c.owner.user_id}`)}
                    </div>
                    <div className="text-sm text-white/50">
                      {c.owner.username ? `@${c.owner.username} · ` : ''}
                      tg {c.owner.telegram_id ?? '—'}
                    </div>
                  </div>
                  <span className="shrink-0 text-white/30">→</span>
                </button>
              ) : (
                <span className="text-white/50">—</span>
              )}
            </div>

            {/* Статистика за всё время */}
            <SectionTitle>Статистика</SectionTitle>
            <div className="mb-2 grid grid-cols-2 gap-3">
              <Stat label="Привёл юзеров" value={c.users_brought} />
              <Stat label="С подпиской" value={c.active_subscribers} />
              <Stat label="Пополнения" value={rub(c.real_topup_kopeks)} />
              <Stat label="Выручка (оборот)" value={rub(c.revenue_kopeks)} />
            </div>
            <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/50">
              Сквад: {c.external_squad_name ?? '—'} · профиль: {c.profile_title ?? '—'}
            </div>

            {/* Статистика по периодам */}
            <SectionTitle>Статистика за период</SectionTitle>
            <div className="mb-2 flex gap-2">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    period === p.key
                      ? 'border-white/40 bg-white/10 text-white'
                      : 'border-white/10 text-white/50 hover:bg-white/5'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mb-2 grid grid-cols-2 gap-3">
              <Stat label="Новые юзеры" value={stats?.new_users ?? '…'} />
              <Stat label="Покупки подписок" value={stats?.purchases ?? '…'} />
              <Stat label="Пополнения" value={stats ? rub(stats.real_topup_kopeks) : '…'} />
              <Stat label="Доход владельца" value={stats ? rub(stats.owner_reward_kopeks) : '…'} />
            </div>
            {(stats?.owner_reward_days ?? 0) > 0 && (
              <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/50">
                🎁 Бонусные дни владельцу: +{stats!.owner_reward_days} дн.
              </div>
            )}
            <div className="mb-5" />

            {/* Наценка */}
            <SectionTitle>Наценка на тарифы</SectionTitle>
            <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-2 text-sm">
                Текущая наценка: <span className="font-semibold">{c.pricing_markup_pct}%</span>
              </div>
              <p className="mb-3 text-xs text-white/50">
                Клиенты этого бота видят и платят цены с наценкой (0–500%). Основной бот и другие
                клоны не затрагивает. Применяется сразу после сохранения.
              </p>
              <div className="flex gap-2">
                <input
                  value={markupInput}
                  onChange={(e) => setMarkupInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitMarkup()}
                  inputMode="numeric"
                  placeholder={`${c.pricing_markup_pct}`}
                  className={inputCls}
                />
                <button
                  onClick={submitMarkup}
                  disabled={setMarkup.isPending || !markupInput.trim()}
                  className={smallBtnCls}
                >
                  Сохранить
                </button>
              </div>
            </div>

            {/* Управление */}
            <SectionTitle>Управление</SectionTitle>
            <div className="mb-5 space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div>
                <div className="mb-1 text-sm">Название профиля</div>
                <p className="mb-2 text-xs text-white/50">
                  Его видят клиенты в VPN-приложении. Только латиница, цифры, пробел, «-» и «_» (до
                  40 символов).
                </p>
                <div className="flex gap-2">
                  <input
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && titleInput.trim() && rename.mutate(titleInput.trim())
                    }
                    placeholder={c.profile_title ?? 'Новое название'}
                    className={inputCls}
                  />
                  <button
                    onClick={() => rename.mutate(titleInput.trim())}
                    disabled={rename.isPending || !titleInput.trim()}
                    className={smallBtnCls}
                  >
                    Сохранить
                  </button>
                </div>
              </div>
              <div>
                <div className="mb-1 text-sm">Токен бота</div>
                <p className="mb-2 text-xs text-white/50">
                  Новый токен того же самого бота от BotFather (после смены/отзыва). Бот сразу
                  перезапустится с новым токеном.
                </p>
                <div className="flex gap-2">
                  <input
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="123456789:AA…"
                    autoComplete="off"
                    className={inputCls}
                  />
                  <button
                    onClick={() => setToken.mutate(tokenInput.trim())}
                    disabled={setToken.isPending || !tokenInput.trim()}
                    className={smallBtnCls}
                  >
                    {setToken.isPending ? 'Проверка…' : 'Обновить'}
                  </button>
                </div>
              </div>
            </div>

            {/* Рекламные ссылки */}
            <SectionTitle>Рекламные ссылки ({links?.items.length ?? 0})</SectionTitle>
            <div className="mb-5 space-y-2">
              {(links?.items ?? []).map((l) => (
                <div key={l.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{l.name}</div>
                      <button
                        onClick={() => copyLink(l.url)}
                        className="max-w-full truncate text-left text-xs text-white/50 hover:text-white/80"
                        title="Скопировать"
                      >
                        {l.url}
                      </button>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right text-xs text-white/50">
                        <div>
                          👆 {l.clicks_count} · 👥 {l.registrations_count}
                        </div>
                        <div>💳 {rub(l.real_topup_kopeks)}</div>
                      </div>
                      <button
                        onClick={async () => {
                          if (
                            await confirmDelete(
                              `Удалить ссылку «${l.name}»? Счётчики пропадут.`,
                              'Удалить',
                            )
                          ) {
                            deleteLink.mutate(l.id);
                          }
                        }}
                        disabled={deleteLink.isPending}
                        className="rounded-full border border-red-500/30 px-3 py-1 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {links && links.items.length < links.max_links && (
                <div className="flex gap-2">
                  <input
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && linkName.trim() && createLink.mutate(linkName.trim())
                    }
                    placeholder="Название размещения (например, Канал у Васи)"
                    className={inputCls}
                  />
                  <button
                    onClick={() => createLink.mutate(linkName.trim())}
                    disabled={createLink.isPending || !linkName.trim()}
                    className={smallBtnCls}
                  >
                    Создать
                  </button>
                </div>
              )}
            </div>

            {/* Пользователи */}
            <SectionTitle>Пользователи ({c.users_brought})</SectionTitle>
            {c.users.length === 0 ? (
              <p className="text-white/50">Этот бот ещё никого не привёл.</p>
            ) : (
              <div className="space-y-2">
                {c.users.map((u: CloneBroughtUser) => (
                  <button
                    key={u.id}
                    onClick={() => navigate(`/admin/users/${u.id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.07]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{userName(u)}</div>
                      <div className="text-xs text-white/50">
                        tg {u.telegram_id ?? '—'} · {fmtDate(u.created_at)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm">
                        {u.has_active_subscription ? '🟢 подписка' : '⚪️ нет'}
                      </div>
                      <div className="text-xs text-white/50">{rub(u.balance_kopeks)}</div>
                    </div>
                  </button>
                ))}
                {c.users.length >= 50 && (
                  <p className="pt-1 text-center text-xs text-white/40">
                    Показаны последние 50 пользователей
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
