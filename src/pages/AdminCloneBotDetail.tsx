import { useNavigate, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminCloneBotsApi, type CloneBroughtUser } from '../api/adminCloneBots';
import { BackIcon } from '@/components/icons';

const STATUS_LABEL: Record<string, string> = {
  active: '🟢 активен',
  disabled: '⚪️ выключен',
  pending: '🟡 создаётся',
  error: '🔴 ошибка',
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
      <div className="text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-white/50">{label}</div>
    </div>
  );
}

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
  const { id } = useParams<{ id: string }>();
  const cloneId = Number(id);

  const { data: c, isLoading } = useQuery({
    queryKey: ['admin-clone-bot', cloneId],
    queryFn: () => adminCloneBotsApi.detail(cloneId),
    enabled: Number.isFinite(cloneId),
  });

  const toggle = useMutation({
    mutationFn: () => adminCloneBotsApi.toggle(cloneId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clone-bot', cloneId] });
      queryClient.invalidateQueries({ queryKey: ['admin-clone-bots'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => adminCloneBotsApi.remove(cloneId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clone-bots'] });
      navigate('/admin/clone-bots');
    },
  });

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
              <h1 className="truncate text-2xl font-semibold">
                @{c.bot_username ?? c.bot_id}
              </h1>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => toggle.mutate()}
                  disabled={toggle.isPending}
                  className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {c.status === 'active' ? 'Выключить' : 'Включить'}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Удалить клон-бота? Он перестанет работать.')) {
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
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-white/40">
              Создатель
            </h2>
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

            {/* Статистика */}
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-white/40">
              Статистика
            </h2>
            <div className="mb-2 grid grid-cols-2 gap-3">
              <Stat label="Привёл юзеров" value={c.users_brought} />
              <Stat label="С подпиской" value={c.active_subscribers} />
              <Stat label="Пополнения" value={`${Math.round((c.real_topup_kopeks ?? 0) / 100)}₽`} />
              <Stat label="Выручка (оборот)" value={`${Math.round(c.revenue_kopeks / 100)}₽`} />
            </div>
            <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/50">
              Сквад: {c.external_squad_name ?? '—'} · профиль: {c.profile_title ?? '—'}
            </div>

            {/* Пользователи */}
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-white/40">
              Пользователи ({c.users_brought})
            </h2>
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
                      <div className="text-xs text-white/50">
                        {Math.round((u.balance_kopeks || 0) / 100)}₽
                      </div>
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
