'use client';

import { useState, useEffect } from 'react';
import { HardwareSetup } from './HardwareSetup';

import { API_BASE } from '@/lib/config';
import { detectClientOS, clientOSToQueryString } from '@/lib/detectClientOS';
const STORAGE_KEY = 'hw-onboarded';

export function HardwareBanner() {
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const alreadyOnboarded = localStorage.getItem(STORAGE_KEY);
    if (alreadyOnboarded) return;

    const qs = clientOSToQueryString(detectClientOS());
    fetch(`${API_BASE}/api/v1/system/hardware${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setModalOpen(true); })
      .catch(() => {});
  }, []);

  function handleModalDismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setModalOpen(false);
  }

  if (!modalOpen) return null;
  return <HardwareSetup onDismiss={handleModalDismiss} isFirstRun />;
}
