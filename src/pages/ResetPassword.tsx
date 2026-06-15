import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { authApi } from '../api/auth';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { AnimatedCheckmark } from '@/components/ui/AnimatedCheckmark';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

// KELDARI-UI: страница сброса пароля выровнена под кабинет — тёмный фон,
// стеклянная карточка, шрифт Inter, белая pill-кнопка (как GiftClaim/CabinetSubscription).
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-[#0A0A0A] px-4 py-10"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div className="fixed right-4 top-4 z-50">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8">
        {children}
      </div>
    </div>
  );
}

const PRIMARY_BTN =
  'flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]';

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [status, setStatus] = useState<'form' | 'loading' | 'success' | 'error'>('form');
  const [error, setError] = useState('');
  // Track the post-success redirect timer so unmount cancels it instead of
  // firing navigate() on a torn-down component.
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError(t('resetPassword.invalidToken', 'Invalid or missing reset token'));
      return;
    }

    if (password.length < 8) {
      setError(t('auth.passwordTooShort', 'Password must be at least 8 characters'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch', 'Passwords do not match'));
      return;
    }

    setStatus('loading');

    try {
      await authApi.resetPassword(token, password);
      setStatus('success');
      redirectTimerRef.current = setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err: unknown) {
      setStatus('error');
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || t('common.error'));
    }
  };

  // Missing / malformed reset link
  if (!token) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-red-400/20 bg-red-400/5 text-2xl text-red-400">
            !
          </div>
          <h1 className="text-lg text-white" style={{ fontWeight: 600 }}>
            {t('resetPassword.invalidToken', 'Invalid reset link')}
          </h1>
          <p className="text-[14px] text-white/40">
            {t(
              'resetPassword.tokenExpiredOrInvalid',
              'This password reset link is invalid or has expired.',
            )}
          </p>
          <Link to="/login" className={cn(PRIMARY_BTN, 'mt-2')} style={{ fontWeight: 500 }}>
            {t('auth.backToLogin', 'Back to login')}
          </Link>
        </div>
      </Shell>
    );
  }

  // Success
  if (status === 'success') {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 py-4 text-center"
        >
          <AnimatedCheckmark />
          <h1 className="text-xl text-white" style={{ fontWeight: 700 }}>
            {t('resetPassword.success', 'Password changed!')}
          </h1>
          <p className="text-[14px] text-white/40">
            {t('resetPassword.redirectingToLogin', 'Redirecting to login...')}
          </p>
        </motion.div>
      </Shell>
    );
  }

  // Form
  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-xl text-white" style={{ fontWeight: 700 }}>
          {t('resetPassword.title', 'Set new password')}
        </h1>
        <p className="mt-1.5 text-[14px] text-white/40">
          {t('resetPassword.enterNewPassword', 'Enter your new password below.')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-[13px] text-white/50">
            {t('auth.password', 'Password')}
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 pr-11 text-[15px] text-white placeholder-white/30 outline-none transition-colors focus:border-white/25"
              autoComplete="new-password"
              disabled={status === 'loading'}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 transition-colors hover:text-white/60"
              aria-label={showPwd ? 'Hide password' : 'Show password'}
            >
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="block text-[13px] text-white/50">
            {t('auth.confirmPassword', 'Confirm Password')}
          </label>
          <input
            id="confirmPassword"
            type={showPwd ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white placeholder-white/30 outline-none transition-colors focus:border-white/25"
            autoComplete="new-password"
            disabled={status === 'loading'}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2.5 text-[13px] text-red-400"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'loading'}
          className={cn(
            PRIMARY_BTN,
            status === 'loading' && 'cursor-not-allowed bg-white/10 text-white/40 hover:shadow-none',
          )}
          style={{ fontWeight: 500 }}
        >
          {status === 'loading' ? (
            <Spinner className="h-5 w-5 border-2" />
          ) : (
            t('resetPassword.setPassword', 'Set new password')
          )}
        </button>
      </form>

      <div className="mt-5 text-center">
        <Link
          to="/login"
          className="text-[13px] text-white/40 transition-colors hover:text-white/70"
        >
          {t('auth.backToLogin', 'Back to login')}
        </Link>
      </div>
    </Shell>
  );
}
