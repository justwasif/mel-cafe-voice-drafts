'use client';

import { cn } from '@/lib/utils';

type State = 'idle' | 'listening' | 'thinking' | 'speaking';

export function MicOrb({ state, onClick, audioLevel = 0 }: { state: State; onClick?: () => void; audioLevel?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center justify-center w-32 h-32 rounded-full transition-all duration-500',
        state === 'idle' && 'bg-accent shadow-lg shadow-accent/20',
        state === 'listening' && 'bg-accent shadow-xl shadow-accent/30 scale-110',
        state === 'thinking' && 'bg-muted shadow-lg shadow-muted/20 animate-pulse',
        state === 'speaking' && 'bg-sage shadow-xl shadow-sage/30 scale-105'
      )}
      aria-label={state === 'listening' ? 'Stop listening' : 'Start listening'}
    >
      <span
        className={cn(
          'absolute inset-0 rounded-full opacity-0 transition-opacity duration-500',
          state === 'listening' && 'animate-ping bg-accent/30 opacity-100',
          state === 'speaking' && 'animate-pulse bg-sage/20 opacity-100'
        )}
      />
      {state === 'listening' && (
        <span
          className="absolute inset-0 rounded-full bg-accent/20 transition-transform duration-100"
          style={{ transform: `scale(${1 + audioLevel * 0.4})` }}
        />
      )}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          'text-white transition-colors',
          state === 'idle' && 'text-white',
          state === 'listening' && 'text-white',
          state === 'thinking' && 'text-cream-200',
          state === 'speaking' && 'text-white'
        )}
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
    </button>
  );
}

