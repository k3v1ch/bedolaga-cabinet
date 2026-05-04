import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Paperclip, Send, MessageSquare, X } from 'lucide-react';

import { ticketsApi } from '@/api/tickets';
import { infoApi } from '@/api/info';
import { useAuthStore } from '@/store/auth';
import { usePlatform } from '@/platform';
import { checkRateLimit, getRateLimitResetTime, RATE_LIMIT_KEYS } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import type { TicketDetail, TicketMessage } from '@/types';

const log = logger.createLogger('CabinetSupport');

interface GlassCardProps {
  children: ReactNode;
  className?: string;
}

function GlassCard({ children, className = '' }: GlassCardProps) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

const statusColor: Record<string, string> = {
  open: 'text-green-400/70',
  answered: 'text-green-400/70',
  pending: 'text-yellow-400/70',
  closed: 'text-white/30',
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

interface MediaAttachment {
  file: File;
  preview: string;
  uploading: boolean;
  fileId?: string;
  error?: string;
}

function MessageMedia({ message }: { message: TicketMessage }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [full, setFull] = useState(false);

  if (!message.has_media || !message.media_file_id) return null;
  const url = ticketsApi.getMediaUrl(message.media_file_id);

  if (message.media_type === 'photo') {
    return (
      <>
        <div className="relative mt-3">
          {!loaded && !errored && (
            <div className="h-40 w-full animate-pulse rounded-lg bg-white/[0.04]" />
          )}
          {errored ? (
            <div className="flex h-24 w-full items-center justify-center rounded-lg bg-white/[0.04] text-xs text-white/40">
              {t('support.imageLoadFailed', { defaultValue: 'Не удалось загрузить изображение' })}
            </div>
          ) : (
            <img
              src={url}
              alt={message.media_caption || ''}
              className={`max-h-60 max-w-full cursor-pointer rounded-lg transition-opacity hover:opacity-90 ${
                loaded ? '' : 'hidden'
              }`}
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
              onClick={() => setFull(true)}
            />
          )}
          {message.media_caption && (
            <p className="mt-1 text-xs text-white/30">{message.media_caption}</p>
          )}
        </div>
        {full && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setFull(false)}
          >
            <button
              className="absolute right-4 top-4 text-white/70 hover:text-white"
              onClick={() => setFull(false)}
            >
              <X size={20} />
            </button>
            <img
              src={url}
              alt={message.media_caption || ''}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
      </>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-white/60 transition-colors hover:bg-white/[0.1]"
    >
      <Paperclip size={14} />
      {message.media_caption || `Download ${message.media_type}`}
    </a>
  );
}

export default function CabinetSupport() {
  log.debug('Component loaded');
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { openTelegramLink, openLink } = usePlatform();

  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  const [createAttachment, setCreateAttachment] = useState<MediaAttachment | null>(null);
  const [replyAttachment, setReplyAttachment] = useState<MediaAttachment | null>(null);
  const createFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const createPreviewRef = useRef<string | null>(null);
  const replyPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    const a = createPreviewRef;
    const b = replyPreviewRef;
    return () => {
      if (a.current) URL.revokeObjectURL(a.current);
      if (b.current) URL.revokeObjectURL(b.current);
    };
  }, []);

  const clearCreateAttachment = () => {
    if (createPreviewRef.current) {
      URL.revokeObjectURL(createPreviewRef.current);
      createPreviewRef.current = null;
    }
    setCreateAttachment(null);
  };
  const clearReplyAttachment = () => {
    if (replyPreviewRef.current) {
      URL.revokeObjectURL(replyPreviewRef.current);
      replyPreviewRef.current = null;
    }
    setReplyAttachment(null);
  };

  const { data: supportConfig, isLoading: configLoading } = useQuery({
    queryKey: ['support-config'],
    queryFn: infoApi.getSupportConfig,
    enabled: isAuthenticated,
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => ticketsApi.getTickets({ per_page: 20 }),
    enabled: isAuthenticated && supportConfig?.tickets_enabled === true,
  });

  const { data: ticketDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['ticket', selectedTicket?.id],
    queryFn: () => ticketsApi.getTicket(selectedTicket!.id),
    enabled: isAuthenticated && !!selectedTicket,
  });

  const handleFileSelect = async (
    file: File,
    setAttachment: (a: MediaAttachment | null) => void,
    previewRef: React.MutableRefObject<string | null>,
  ) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setAttachment({
        file,
        preview: '',
        uploading: false,
        error: t('support.invalidFileType', { defaultValue: 'Недопустимый тип файла' }),
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachment({
        file,
        preview: '',
        uploading: false,
        error: t('support.fileTooLarge', { defaultValue: 'Файл слишком большой' }),
      });
      return;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const preview = URL.createObjectURL(file);
    previewRef.current = preview;
    setAttachment({ file, preview, uploading: true });
    try {
      const result = await ticketsApi.uploadMedia(file, 'photo');
      setAttachment({ file, preview, uploading: false, fileId: result.file_id });
    } catch {
      setAttachment({
        file,
        preview,
        uploading: false,
        error: t('support.uploadFailed', { defaultValue: 'Ошибка загрузки' }),
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const media = createAttachment?.fileId
        ? { media_type: 'photo', media_file_id: createAttachment.fileId }
        : undefined;
      return ticketsApi.createTicket(newTitle, newMessage, media);
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setCreating(false);
      setNewTitle('');
      setNewMessage('');
      clearCreateAttachment();
      setSelectedTicket(ticket);
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const media = replyAttachment?.fileId
        ? { media_type: 'photo', media_file_id: replyAttachment.fileId }
        : undefined;
      return ticketsApi.addMessage(selectedTicket!.id, replyMessage, media);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', selectedTicket?.id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setReplyMessage('');
      clearReplyAttachment();
    },
  });

  const getStatusLabel = (status: string) =>
    t(`support.status.${status}`, { defaultValue: status });

  // ── Disabled tickets / external support modes ──
  if (!configLoading && supportConfig && !supportConfig.tickets_enabled) {
    const getContact = () => {
      if (supportConfig.support_type === 'url' && supportConfig.support_url) {
        return {
          message: t('support.useExternalLink', {
            defaultValue: 'Свяжитесь с поддержкой по внешней ссылке',
          }),
          buttonText: t('support.openSupport', { defaultValue: 'Открыть поддержку' }),
          action: () => openLink(supportConfig.support_url!, { tryInstantView: false }),
        };
      }
      const username = supportConfig.support_username || '@support';
      return {
        message: t('support.contactSupport', {
          username,
          defaultValue: `Напишите в ${username}`,
        }),
        buttonText: t('support.contactUs', { defaultValue: 'Связаться' }),
        action: () => {
          const clean = username.startsWith('@') ? username.slice(1) : username;
          openTelegramLink(`https://t.me/${clean}`);
        },
      };
    };
    const contact = getContact();
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <h1
          className="mb-8 text-white"
          style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {isAdmin
            ? t('support.ticketsDisabled', { defaultValue: 'Тикеты отключены' })
            : t('support.title', { defaultValue: 'Поддержка' })}
        </h1>
        <GlassCard className="mx-auto max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06]">
            <MessageSquare size={28} className="text-white/40" />
          </div>
          <p className="mb-6 text-sm text-white/50" style={{ lineHeight: 1.6 }}>
            {contact.message}
          </p>
          <button
            onClick={contact.action}
            className="w-full rounded-full bg-white py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
            style={{ fontWeight: 500 }}
          >
            {contact.buttonText}
          </button>
        </GlassCard>
      </motion.div>
    );
  }

  const activeTicket = selectedTicket;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div className="mb-8 flex items-center justify-between">
        <h1
          className="text-white"
          style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('support.title', { defaultValue: 'Поддержка' })}
        </h1>
        <button
          onClick={() => {
            setCreating(true);
            setSelectedTicket(null);
            clearCreateAttachment();
            setRateLimitError(null);
          }}
          className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/60 transition-colors hover:bg-white/[0.05]"
        >
          <Plus size={14} /> {t('support.newTicket', { defaultValue: 'Новый тикет' })}
        </button>
      </div>

      {/* Optional "both" contact card */}
      {supportConfig?.support_type === 'both' && supportConfig.support_username && (
        <GlassCard className="mb-4 flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
              <MessageSquare size={18} className="text-white/40" />
            </div>
            <div>
              <div className="text-sm text-white/70" style={{ fontWeight: 500 }}>
                {t('support.contactUs', { defaultValue: 'Связаться' })}
              </div>
              <div className="text-xs text-white/30">{supportConfig.support_username}</div>
            </div>
          </div>
          <button
            onClick={() => {
              const u = supportConfig.support_username!;
              const clean = u.startsWith('@') ? u.slice(1) : u;
              openTelegramLink(`https://t.me/${clean}`);
            }}
            className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/60 transition-colors hover:bg-white/[0.05]"
          >
            {t('support.contactUs', { defaultValue: 'Связаться' })}
          </button>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        {/* Ticket list */}
        <div className="space-y-2">
          <p className="mb-2 text-xs text-white/30" style={{ fontWeight: 500 }}>
            {t('support.yourTickets', { defaultValue: 'Ваши обращения' })}
          </p>
          {configLoading || isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
            </div>
          ) : tickets?.items && tickets.items.length > 0 ? (
            tickets.items.map((ticket) => {
              const selected = activeTicket?.id === ticket.id;
              return (
                <button
                  key={ticket.id}
                  onClick={() => {
                    setSelectedTicket(ticket as unknown as TicketDetail);
                    setCreating(false);
                    clearReplyAttachment();
                    setRateLimitError(null);
                  }}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${
                    selected
                      ? 'border-white/15 bg-white/[0.08]'
                      : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05]'
                  }`}
                >
                  <p className="mb-1 truncate text-sm text-white/60" style={{ fontWeight: 500 }}>
                    {ticket.title}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/20">{formatDate(ticket.updated_at)}</span>
                    <span className={`text-xs ${statusColor[ticket.status] || 'text-white/30'}`}>
                      {getStatusLabel(ticket.status)}
                    </span>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="text-xs text-white/30">
              {t('support.noTickets', { defaultValue: 'Пока нет обращений' })}
            </p>
          )}
        </div>

        {/* Right side */}
        <GlassCard className="flex min-h-[400px] flex-col p-6">
          {!activeTicket && !creating && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <MessageSquare size={32} className="mb-3 text-white/10" />
              <p className="text-sm text-white/25">
                {t('support.selectTicket', {
                  defaultValue: 'Выберите обращение или создайте новое',
                })}
              </p>
            </div>
          )}

          {activeTicket && !creating && (
            <>
              <div className="mb-4 border-b border-white/[0.06] pb-4">
                <p className="mb-1 text-sm text-white/70" style={{ fontWeight: 500 }}>
                  {ticketDetail?.title || activeTicket.title}
                </p>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs ${
                      statusColor[ticketDetail?.status || activeTicket.status] || 'text-white/30'
                    }`}
                  >
                    {getStatusLabel(ticketDetail?.status || activeTicket.status)}
                  </span>
                  <span className="text-xs text-white/20">
                    {t('support.created', { defaultValue: 'Создан' })}{' '}
                    {formatDate(activeTicket.created_at)}
                  </span>
                </div>
              </div>

              {detailLoading ? (
                <div className="flex flex-1 items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                </div>
              ) : (
                <div className="mb-4 flex-1 space-y-3 overflow-y-auto">
                  {ticketDetail?.messages?.map((m) => {
                    const isUser = !m.is_from_admin;
                    return (
                      <div key={m.id} className={`max-w-[85%] ${isUser ? 'ml-auto' : ''}`}>
                        <div
                          className={`rounded-xl p-3 text-sm ${
                            isUser
                              ? 'bg-white/[0.08] text-white/60'
                              : 'border border-white/[0.06] bg-white/[0.04] text-white/50'
                          }`}
                          style={{ lineHeight: 1.6 }}
                        >
                          <div className="whitespace-pre-wrap">{m.message_text}</div>
                          <MessageMedia message={m} />
                        </div>
                        <p className="mt-1 px-1 text-xs text-white/15">
                          {isUser
                            ? t('support.you', { defaultValue: 'Вы' })
                            : t('support.supportTeam', { defaultValue: 'Поддержка' })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {ticketDetail?.status !== 'closed' && !ticketDetail?.is_reply_blocked ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setRateLimitError(null);
                    if (!replyMessage.trim() || replyAttachment?.uploading) return;
                    if (!checkRateLimit(RATE_LIMIT_KEYS.TICKET_REPLY, 5, 30000)) {
                      const s = getRateLimitResetTime(RATE_LIMIT_KEYS.TICKET_REPLY);
                      setRateLimitError(
                        t('support.tooManyRequests', {
                          seconds: s,
                          defaultValue: `Слишком много запросов. Подождите ${s} сек.`,
                        }),
                      );
                      return;
                    }
                    replyMutation.mutate();
                  }}
                  className="space-y-2"
                >
                  {replyAttachment && (
                    <div className="relative inline-block">
                      {replyAttachment.preview && (
                        <img
                          src={replyAttachment.preview}
                          alt=""
                          className="h-20 w-auto rounded-lg border border-white/10"
                        />
                      )}
                      {replyAttachment.uploading && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        </div>
                      )}
                      {replyAttachment.error && (
                        <div className="mt-1 text-xs text-red-400">{replyAttachment.error}</div>
                      )}
                      <button
                        type="button"
                        onClick={clearReplyAttachment}
                        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      ref={replyFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelect(f, setReplyAttachment, replyPreviewRef);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => replyFileInputRef.current?.click()}
                      className="shrink-0 text-white/20 transition-colors hover:text-white/40"
                    >
                      <Paperclip size={16} />
                    </button>
                    <input
                      type="text"
                      placeholder={t('support.replyPlaceholder', { defaultValue: 'Сообщение...' })}
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      maxLength={4000}
                      className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.06] px-4 py-2.5 text-sm text-white/60 outline-none transition-all placeholder:text-white/20 focus:border-white/15"
                    />
                    <button
                      type="submit"
                      disabled={
                        !replyMessage.trim() ||
                        replyAttachment?.uploading ||
                        replyMutation.isPending
                      }
                      className="shrink-0 text-white/30 transition-colors hover:text-white/60 disabled:opacity-40"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                  {rateLimitError && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                      {rateLimitError}
                    </div>
                  )}
                </form>
              ) : ticketDetail?.is_reply_blocked ? (
                <div className="border-t border-white/[0.06] py-3 text-center text-xs text-white/30">
                  {t('support.repliesDisabled', { defaultValue: 'Ответы отключены' })}
                </div>
              ) : null}
            </>
          )}

          {creating && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setRateLimitError(null);
                if (createAttachment?.uploading) return;
                if (!checkRateLimit(RATE_LIMIT_KEYS.TICKET_CREATE, 3, 60000)) {
                  const s = getRateLimitResetTime(RATE_LIMIT_KEYS.TICKET_CREATE);
                  setRateLimitError(
                    t('support.tooManyRequests', {
                      seconds: s,
                      defaultValue: `Слишком много запросов. Подождите ${s} сек.`,
                    }),
                  );
                  return;
                }
                createMutation.mutate();
              }}
              className="flex flex-col gap-3"
            >
              <p className="mb-2 text-sm text-white/50" style={{ fontWeight: 500 }}>
                {t('support.createTicket', { defaultValue: 'Новое обращение' })}
              </p>
              <input
                type="text"
                placeholder={t('support.subjectPlaceholder', { defaultValue: 'Тема обращения' })}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                minLength={3}
                maxLength={255}
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/70 outline-none transition-all placeholder:text-white/20 focus:border-white/20"
              />
              <textarea
                placeholder={t('support.messagePlaceholder', {
                  defaultValue: 'Опишите вашу проблему...',
                })}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={5}
                required
                minLength={10}
                maxLength={4000}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/70 outline-none transition-all placeholder:text-white/20 focus:border-white/20"
              />

              <input
                ref={createFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f, setCreateAttachment, createPreviewRef);
                  e.target.value = '';
                }}
              />
              {createAttachment ? (
                <div className="relative inline-block">
                  {createAttachment.preview && (
                    <img
                      src={createAttachment.preview}
                      alt=""
                      className="h-20 w-auto rounded-lg border border-white/10"
                    />
                  )}
                  {createAttachment.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    </div>
                  )}
                  {createAttachment.error && (
                    <div className="mt-1 text-xs text-red-400">{createAttachment.error}</div>
                  )}
                  <button
                    type="button"
                    onClick={clearCreateAttachment}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => createFileInputRef.current?.click()}
                  className="flex items-center gap-2 text-white/20 transition-colors hover:text-white/40"
                >
                  <Paperclip size={16} />
                  <span className="text-xs text-white/15">
                    {t('support.attachImage', { defaultValue: 'Прикрепить файл' })}
                  </span>
                </button>
              )}

              {rateLimitError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                  {rateLimitError}
                </div>
              )}

              <button
                type="submit"
                disabled={createAttachment?.uploading || createMutation.isPending}
                className="mt-2 w-full rounded-full bg-white py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-60"
                style={{ fontWeight: 500 }}
              >
                {t('support.send', { defaultValue: 'Отправить' })}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewTitle('');
                  setNewMessage('');
                  clearCreateAttachment();
                  setRateLimitError(null);
                }}
                className="mt-1 w-full rounded-full border border-white/10 py-2.5 text-sm text-white/40 transition-colors hover:bg-white/[0.04]"
              >
                {t('common.cancel', { defaultValue: 'Отмена' })}
              </button>
            </form>
          )}
        </GlassCard>
      </div>
    </motion.div>
  );
}
