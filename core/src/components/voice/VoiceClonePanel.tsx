'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface VoiceClone {
  id: string;
  name: string;
  engine: string;
  filename: string;
  duration_s: number;
  size_bytes: number;
}

interface VoiceClonePanelProps {
  open: boolean;
  onClose: () => void;
  onCloneCreated: () => void;
}

import { API_BASE } from '@/lib/config';

type Mode = 'idle' | 'recording' | 'recorded' | 'uploading';
type Engine = 'omnivoice';

export function VoiceClonePanel({ open, onClose, onCloneCreated }: VoiceClonePanelProps) {
  const [mode, setMode] = useState<Mode>('idle');
  const [name, setName] = useState('');
  const [engine, setEngine] = useState<Engine>('omnivoice');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setMode('idle');
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordingTime(0);
    setError(null);
    setFileName(null);
    chunksRef.current = [];
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [audioUrl]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setMode('recorded');
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setMode('recording');
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      setError('Mikrofón nie je dostupný. Skontrolujte povolenia prehliadača.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setAudioBlob(file);
    setAudioUrl(url);
    setMode('recorded');
    if (e.target) e.target.value = '';
  };

  const playPreview = () => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.play().catch(() => {});
  };

  const handleSubmit = async () => {
    if (!audioBlob) { setError('Nahrávka chýba.'); return; }
    if (!name.trim()) { setError('Zadajte meno pre klonovaný hlas.'); return; }
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      const ext = fileName ? fileName.split('.').pop() : 'webm';
      const audioFile = new File([audioBlob], `sample.${ext ?? 'webm'}`, { type: audioBlob.type });
      formData.append('audio', audioFile);
      formData.append('name', name.trim());
      formData.append('engine', engine);
      const res = await fetch(`${API_BASE}/api/v1/voice-clones/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `HTTP ${res.status}`);
      }
      onCloneCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nahrávanie zlyhalo.');
    } finally {
      setUploading(false);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (!open) return null;

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains)',
    fontSize: '8px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--t3)',
    marginBottom: '6px',
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--bg)',
    border: '1px solid var(--atm-glass-border)',
    borderRadius: '8px',
    color: 'var(--t1)',
    fontSize: '12.5px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'rgba(26, 20, 16, 0.62)',
          border: '1px solid var(--atm-glass-border)',
          borderRadius: '12px',
          width: '400px',
          maxWidth: 'calc(100vw - 32px)',
          padding: '24px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.02em' }}>
              Klonujte si hlas
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '9px', color: 'var(--t3)', marginTop: '2px', letterSpacing: '0.06em' }}>
              Nahrávka 5–30 sekúnd · jasná reč
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--t3)', fontSize: '18px', lineHeight: 1, padding: '2px 4px',
              borderRadius: '4px', transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--t1)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
          >
            ×
          </button>
        </div>

        <div style={{
          background: 'rgba(245, 237, 216, 0.04)',
          border: '1px solid var(--atm-glass-border)',
          borderRadius: '10px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          minHeight: '100px',
          justifyContent: 'center',
        }}>
          {mode === 'idle' && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={startRecording}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', borderRadius: '8px',
                  background: 'var(--accent)', border: 'none', color: '#fff',
                  fontSize: '11.5px', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                Nahrávať
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', borderRadius: '8px',
                  background: 'var(--bg)', border: '1px solid var(--atm-glass-border)',
                  color: 'var(--t2)', fontSize: '11.5px', cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--border-mid)';
                  e.currentTarget.style.color = 'var(--t1)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--t2)';
                }}
              >
                Nahrať súbor
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>
          )}

          {mode === 'recording' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444',
                  animation: 'status-blink 1s ease-in-out infinite', display: 'inline-block',
                }} />
                <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '13px', color: 'var(--t1)', letterSpacing: '0.06em' }}>
                  {formatTime(recordingTime)}
                </span>
              </div>
              <div style={{ width: '100%', height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  background: '#ef4444',
                  borderRadius: '2px',
                  width: `${Math.min((recordingTime / 30) * 100, 100)}%`,
                  transition: 'width 1s linear',
                }} />
              </div>
              <button
                onClick={stopRecording}
                style={{
                  padding: '7px 18px', borderRadius: '8px',
                  background: 'var(--bg)', border: '1px solid var(--atm-glass-border)',
                  color: 'var(--t2)', fontSize: '11.5px', cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-mid)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                Zastaviť
              </button>
            </>
          )}

          {mode === 'recorded' && (
            <>
              <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '9px', color: 'var(--t3)', letterSpacing: '0.08em' }}>
                {fileName ?? 'Nahrávka z mikrofónu'}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={playPreview}
                  style={{
                    padding: '7px 14px', borderRadius: '8px',
                    background: 'var(--bg)', border: '1px solid var(--atm-glass-border)',
                    color: 'var(--t2)', fontSize: '11.5px', cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--border-mid)';
                    e.currentTarget.style.color = 'var(--t1)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--t2)';
                  }}
                >
                  Prehrať
                </button>
                <button
                  onClick={reset}
                  style={{
                    padding: '7px 14px', borderRadius: '8px',
                    background: 'var(--bg)', border: '1px solid var(--atm-glass-border)',
                    color: 'var(--t3)', fontSize: '11.5px', cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--border-mid)';
                    e.currentTarget.style.color = 'var(--t2)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--t3)';
                  }}
                >
                  Znova
                </button>
              </div>
            </>
          )}
        </div>

        <div>
          <label style={labelStyle}>Meno hlasu</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="napr. Môj hlas"
            style={inputStyle}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>

        <div>
          <label style={labelStyle}>Engine</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['omnivoice'] as Engine[]).map(eng => (
              <label
                key={eng}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  cursor: 'pointer', padding: '7px 12px',
                  borderRadius: '8px',
                  background: engine === eng ? 'var(--accent-dim)' : 'var(--bg)',
                  border: engine === eng ? '1px solid rgba(var(--accent-r), 0.35)' : '1px solid var(--border)',
                  transition: 'background 0.12s, border-color 0.12s',
                  flex: 1,
                }}
              >
                <input
                  type="radio"
                  name="engine"
                  value={eng}
                  checked={engine === eng}
                  onChange={() => setEngine(eng)}
                  style={{ display: 'none' }}
                />
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: engine === eng ? 'var(--accent)' : 'var(--border-mid)',
                  flexShrink: 0, transition: 'background 0.15s',
                }} />
                <span style={{
                  fontFamily: 'var(--font-jetbrains)',
                  fontSize: '9px',
                  letterSpacing: '0.08em',
                  color: engine === eng ? 'var(--t1)' : 'var(--t3)',
                  textTransform: 'uppercase',
                  transition: 'color 0.12s',
                }}>
                  OmniVoice (SK/CZ/EN)
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            padding: '8px 12px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '8px',
            fontSize: '11.5px',
            color: '#ef4444',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={uploading || mode !== 'recorded' || !name.trim()}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            fontSize: '12px',
            fontFamily: 'inherit',
            cursor: uploading || mode !== 'recorded' || !name.trim() ? 'not-allowed' : 'pointer',
            opacity: uploading || mode !== 'recorded' || !name.trim() ? 0.45 : 1,
            transition: 'opacity 0.15s',
            letterSpacing: '-0.01em',
          }}
        >
          {uploading ? 'Ukladám…' : 'Uložiť hlas'}
        </button>
      </div>
    </div>
  );
}
