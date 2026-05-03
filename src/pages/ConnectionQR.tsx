import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft } from 'lucide-react';
import { useBranding } from '../hooks/useBranding';
import { AdminBackButton } from '@/components/admin';

const USE_NEW_SHELL = import.meta.env.VITE_USE_NEW_SHELL !== 'false';

interface ConnectionQRState {
  url: string;
  hideLink: boolean;
  subscriptionId?: number;
}

function isValidState(state: unknown): state is ConnectionQRState {
  if (!state || typeof state !== 'object') return false;
  const s = state as Record<string, unknown>;
  return typeof s.url === 'string' && s.url.length > 0 && typeof s.hideLink === 'boolean';
}

export default function ConnectionQR() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { appName } = useBranding();

  const state = location.state as unknown;
  const validState = isValidState(state) ? state : null;
  const subId = validState?.subscriptionId;
  const connectionPath = subId ? `/connection?sub=${subId}` : '/connection';

  useEffect(() => {
    if (!validState) {
      navigate(connectionPath, { replace: true });
    }
  }, [validState, navigate, connectionPath]);

  if (!validState) {
    return null;
  }

  if (USE_NEW_SHELL) {
    return (
      <div className="animate-fade-in" style={{ fontFamily: 'Inter, sans-serif' }}>
        <button
          onClick={() => navigate(connectionPath, { replace: true })}
          className="mb-4 flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white/65"
        >
          <ArrowLeft size={14} /> {t('common.back', { defaultValue: 'Назад' })}
        </button>
        <h1
          className="mb-8 text-white"
          style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('subscription.connection.qrTitle')}
        </h1>

        <div className="flex flex-col items-center">
          <div className="flex w-full max-w-sm flex-col items-center px-6">
            {appName && (
              <p
                className="mb-3 text-xs uppercase tracking-[0.05em] text-white/40"
                style={{ fontWeight: 500 }}
              >
                {appName}
              </p>
            )}

            <p className="mb-8 text-center text-sm text-white/35">
              {t('subscription.connection.qrScanHint')}
            </p>

            <div className="rounded-3xl bg-white p-6">
              <QRCodeSVG
                value={validState.url}
                size={280}
                level="M"
                includeMargin={false}
                className="h-[280px] w-[280px] sm:h-[360px] sm:w-[360px]"
              />
            </div>

            {!validState.hideLink && (
              <p className="mt-6 max-w-full truncate text-center font-mono text-xs text-white/30">
                {validState.url}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center gap-3">
        <AdminBackButton to={connectionPath} replace />
        <h1 className="text-2xl font-bold text-dark-100">{t('subscription.connection.qrTitle')}</h1>
      </div>

      <div className="flex flex-col items-center">
        <div className="flex w-full max-w-sm flex-col items-center px-6">
          {appName && (
            <p className="mb-3 text-sm font-medium uppercase tracking-wider text-dark-400">
              {appName}
            </p>
          )}

          <p className="mb-8 text-center text-sm text-dark-400">
            {t('subscription.connection.qrScanHint')}
          </p>

          <div className="rounded-3xl bg-white p-6">
            <QRCodeSVG
              value={validState.url}
              size={280}
              level="M"
              includeMargin={false}
              className="h-[280px] w-[280px] sm:h-[360px] sm:w-[360px]"
            />
          </div>

          {!validState.hideLink && (
            <p className="mt-6 max-w-full truncate text-center font-mono text-xs text-dark-500">
              {validState.url}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
