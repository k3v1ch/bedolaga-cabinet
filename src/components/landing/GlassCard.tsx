import { type ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, className = '', hover = false }: GlassCardProps) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl ${hover ? 'transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08] hover:shadow-lg hover:shadow-white/5' : ''} ${className} `}
    >
      {children}
    </div>
  );
}
