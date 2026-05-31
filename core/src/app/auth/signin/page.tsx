'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const [email, setEmail] = useState('demo@edututor.sk');
  const [password, setPassword] = useState('edututor2026');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.error) {
      setError('Invalid credentials. Try: demo@edututor.sk / edututor2026');
    } else {
      router.push('/');
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '360px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '36px' }}>
        <div style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--t1)', marginBottom: '4px' }}>EduTutor</div>
        <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '9px', letterSpacing: '0.12em', color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '28px' }}>
          AI Language Platform · SK
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
            style={{ background: 'var(--raised)', border: '1px solid var(--border-mid)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: 'var(--t1)', fontFamily: 'var(--font-inter)', outline: 'none' }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
            style={{ background: 'var(--raised)', border: '1px solid var(--border-mid)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: 'var(--t1)', fontFamily: 'var(--font-inter)', outline: 'none' }} />
          {error && <div style={{ fontSize: '11px', color: '#ef4444', fontFamily: 'var(--font-jetbrains)' }}>{error}</div>}
          <button type="submit" style={{ padding: '11px', background: 'var(--accent)', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-inter)', marginTop: '4px' }}>
            Sign in
          </button>
        </form>
        <div style={{ marginTop: '16px', fontFamily: 'var(--font-jetbrains)', fontSize: '10px', color: 'var(--t2)', letterSpacing: '0.06em', lineHeight: 1.8, background: 'var(--raised)', borderRadius: '8px', padding: '8px 12px' }}>
          <span style={{ color: 'var(--t3)' }}>DEMO LOGIN</span><br />
          demo@edututor.sk<br />
          edututor2026
        </div>
      </div>
    </div>
  );
}
