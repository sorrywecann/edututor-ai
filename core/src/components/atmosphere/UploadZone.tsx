'use client';

// UploadZone — drag-and-drop file zone with atmospheric drag-active state.
// Falls back to native file picker via the hidden input + label click.
//
// Doesn't manage uploaded files itself — caller hooks onFiles to whatever
// upload pipeline they want. Keeps the primitive composable.

import { useRef, useState, useId, ReactNode, DragEvent, ChangeEvent } from 'react';

interface UploadZoneProps {
  /** Comma-separated accept attribute (e.g. ".pdf,.txt") */
  accept?: string;
  /** Allow multiple files in one drop / pick */
  multiple?: boolean;
  /** Called with the FileList when files are dropped or picked */
  onFiles: (files: File[]) => void;
  /** Headline shown inside the zone */
  label: ReactNode;
  /** Helper line below — e.g. "PDF, Word, TXT — max 10MB" */
  description?: ReactNode;
  /** Disable the zone (e.g. while uploading) */
  disabled?: boolean;
}

export function UploadZone({
  accept,
  multiple = false,
  onFiles,
  label,
  description,
  disabled = false,
}: UploadZoneProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    dragDepthRef.current = 0;
    if (disabled) return;
    const list = Array.from(e.dataTransfer.files);
    if (list.length > 0) onFiles(multiple ? list : list.slice(0, 1));
  };

  const handleDragEnter = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    if (!disabled) setDragOver(true);
  };

  const handleDragLeave = () => {
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setDragOver(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files);
    // Reset so picking the same file twice re-fires onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const accent = dragOver ? 'var(--accent)' : 'var(--atm-glass-border)';
  const bg = dragOver ? 'rgba(var(--accent-r),0.08)' : 'transparent';

  return (
    <label
      htmlFor={inputId}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '32px 24px',
        background: bg,
        border: `1.5px dashed ${accent}`,
        borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 150ms ease, background 150ms ease',
        textAlign: 'center',
        userSelect: 'none',
      }}
    >
      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileInput}
        disabled={disabled}
        style={{ display: 'none' }}
      />
      <div
        style={{
          fontFamily: 'var(--font-inter)',
          fontSize: 14,
          fontWeight: 500,
          color: dragOver ? 'var(--accent)' : 'var(--t1)',
          letterSpacing: '-0.005em',
        }}
      >
        {dragOver ? 'Pustite súbory tu' : label}
      </div>
      {description && (
        <div className="atm-micro" style={{ color: 'var(--t3)' }}>
          {description}
        </div>
      )}
    </label>
  );
}
