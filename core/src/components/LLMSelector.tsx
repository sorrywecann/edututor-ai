'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

import { API_BASE } from '@/lib/config';

interface LLMModel {
  id: string;
  name: string;
  description: string;
  provider: string;
  available: boolean;
}

interface LLMSelectorProps {
  value: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'dropdown' | 'cards';
}

export function LLMSelector({ value, onChange, className, variant = 'cards' }: LLMSelectorProps) {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/llm/models`)
      .then(res => res.json())
      .then(data => {
        if (data?.models) {
          setModels(data.models);
          if (!value && data.current) {
            onChange(data.current);
          }
        }
      })
      .catch(err => console.error('Failed to load LLM models:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="h-20 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (variant === 'dropdown') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "bg-transparent border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/60",
          "focus:outline-none focus:border-white/30 cursor-pointer",
          className
        )}
      >
        {models.filter(m => m.available).map((m) => (
          <option key={m.id} value={m.id} className="bg-black">
            {m.name}
          </option>
        ))}
      </select>
    );
  }

  const getProviderIcon = (id: string) => {
    switch (id) {
      case 'openai':
        return (
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
          </svg>
        );
      case 'azure':
        return (
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M5.483 21.3H24L14.025 4.013l-3.038 8.347 5.836 6.938L5.483 21.3zM13.23 2.7L6.105 8.677 0 19.253h5.505v.014L13.23 2.7z"/>
          </svg>
        );
      case 'anthropic':
        return (
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M17.304 3.541h-3.672l6.696 16.918h3.672l-6.696-16.918zm-10.608 0L0 20.459h3.744l1.368-3.6h6.624l1.368 3.6h3.744L10.152 3.541H6.696zm.456 10.08l2.304-6.048 2.304 6.048H7.152z"/>
          </svg>
        );
      case 'local':
        return (
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
        );
    }
  };

  const getProviderColor = (id: string, isSelected: boolean) => {
    if (!isSelected) return 'text-white/40';
    switch (id) {
      case 'openai': return 'text-emerald-400';
      case 'azure': return 'text-blue-400';
      case 'anthropic': return 'text-orange-400';
      case 'local': return 'text-purple-400';
      default: return 'text-white';
    }
  };

  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {models.map((model) => {
        const isSelected = value === model.id;
        const isDisabled = !model.available;

        return (
          <button
            key={model.id}
            onClick={() => !isDisabled && onChange(model.id)}
            disabled={isDisabled}
            className={cn(
              "relative p-4 rounded-xl border text-left transition-all duration-200",
              isSelected
                ? "border-white/30 bg-white/5"
                : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]",
              isDisabled && "opacity-40 cursor-not-allowed hover:border-white/10 hover:bg-transparent"
            )}
          >
            {isSelected && (
              <div className="absolute top-3 right-3">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}

            <div className={cn("mb-2", getProviderColor(model.id, isSelected))}>
              {getProviderIcon(model.id)}
            </div>

            <div className="font-medium text-sm text-white/90">
              {model.id === 'openai' && 'OpenAI'}
              {model.id === 'azure' && 'Azure OpenAI'}
              {model.id === 'anthropic' && 'Anthropic'}
              {model.id === 'local' && 'Local GPU'}
            </div>

            <div className="text-xs text-white/40 mt-0.5">
              {model.id === 'openai' && 'GPT-4o-mini'}
              {model.id === 'azure' && 'GPT-4o-mini'}
              {model.id === 'anthropic' && 'Claude 3 Haiku'}
              {model.id === 'local' && 'Mistral 7B'}
            </div>

            <div className={cn(
              "mt-2 text-[10px] font-medium uppercase tracking-wider",
              model.available ? "text-emerald-500/70" : "text-red-500/70"
            )}>
              {model.available ? 'Available' : 'No API Key'}
            </div>
          </button>
        );
      })}
    </div>
  );
}
