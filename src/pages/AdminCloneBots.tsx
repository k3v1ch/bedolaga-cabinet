import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminCloneBotsApi } from '../api/adminCloneBots';
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

export default function AdminCloneBots() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-clone-bots'],
    queryFn: adminCloneBotsApi.list,
    staleTime: 15000,
  });

  const toggle = useMutation({
    mutationFn: adminCloneBotsApi.toggle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-clone-bots'] }),
  });
  const remove = useMutation({
    mutationFn: adminCloneBotsApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-clone-bots'] }),
  });

  const items = data?.items ?? [];
  const totalUsers = items.reduce((s, i) => s + i.users_brought, 0);
  const totalRev = items.reduce((s, i) => s + i.revenue_kopeks, 0);
  const totalTopup = items.reduce((s, i) => s + (i.real_topup_kopeks ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => navigate('/admin')}
          className="mb-4 flex items-center gap-2 text-white/60 transition-colors hover:text-white"
        >
          <BackIcon />
          Назад
        </button>

        <h1 className="mb-1 text-2xl font-semibold">Клон-боты</h1>
        <p className="mb-5 text-sm text-white/50">White-label боты реселлеров</p>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <Stat label="Ботов" value={items.length} />
          <Stat label="Привели юзеров" value={totalUsers} />
          <Stat label="Пополнения" value={`${Math.round(totalTopup / 100)}₽`} />
          <Stat label="Выручка (оборот)" value={`${Math.round(totalRev / 100)}₽`} />
        </div>

        {isLoading ? (
          <p className="text-white/50">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-white/50">Пока нет подключённых ботов.</p>
        ) : (
          <div className="space-y-3">
            {items.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/admin/clone-bots/${c.id}`)}
                className="cursor-pointer rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl transition-colors hover:bg-white/[0.07]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">@{c.bot_username ?? c.bot_id}</div>
                    <div className="text-sm text-white/50">
                      {STATUS_LABEL[c.status] ?? c.status} · профиль: {c.profile_title ?? '—'}
                    </div>
                    <div className="text-sm text-white/50">
                      👥 {c.users_brought} · сквад: {c.external_squad_name ?? '—'}
                    </div>
                    <div className="text-sm text-white/50">
                      💳 пополнения {Math.round((c.real_topup_kopeks ?? 0) / 100)}₽ · оборот{' '}
                      {Math.round(c.revenue_kopeks / 100)}₽
                    </div>
                    {c.last_error && (
                      <div className="mt-1 truncate text-xs text-red-400">⚠️ {c.last_error}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle.mutate(c.id);
                      }}
                      disabled={toggle.isPending}
                      className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50"
                    >
                      {c.status === 'active' ? 'Выключить' : 'Включить'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Удалить клон-бота? Он перестанет работать.')) {
                          remove.mutate(c.id);
                        }
                      }}
                      disabled={remove.isPending}
                      className="rounded-full border border-red-500/30 px-4 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
