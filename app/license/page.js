'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const outer = { maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px' };
const card = { background: '#11182c', border: '1px solid #263452', borderRadius: 18, padding: 24, marginTop: 20 };
const field = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid #384867', borderRadius: 10, fontSize: 16, background: '#0b1020', color: '#f7f9ff' };
const primary = { padding: '12px 18px', border: 0, borderRadius: 10, fontSize: 15, background: '#8fd3ff', color: '#08101d', fontWeight: 800, cursor: 'pointer' };
const secondary = { ...primary, background: '#263452', color: '#f7f9ff' };
const muted = { color: '#aeb9d2' };

export default function MyLicensePage() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [email, setEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [licenses, setLicenses] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data?.user || null);
      setInitializing(false);
    }).catch(() => { if (active) setInitializing(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user || null);
      setLicenses(null);
      setConfirmPassword('');
      setMessage('');
      setInitializing(false);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true); setMessage(''); setLicenses(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: loginPassword });
    setLoginPassword('');
    setBusy(false);
    if (error) setMessage('로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.');
  }

  async function reveal(event) {
    event.preventDefault();
    if (!confirmPassword) return;
    setBusy(true); setMessage(''); setLicenses(null);
    const password = confirmPassword;
    setConfirmPassword('');
    try {
      const { data, error } = await supabase.functions.invoke('reveal-license-key', {
        body: { password },
      });
      if (error || !Array.isArray(data?.licenses)) {
        setMessage('라이선스 확인에 실패했습니다. 비밀번호를 확인하거나 잠시 후 다시 시도해 주세요.');
      } else {
        setLicenses(data.licenses);
        if (data.licenses.length === 0) {
          setMessage('현재 이 계정에 배정된 라이선스 키가 없습니다. 관리자에게 발급을 요청해 주세요.');
        }
      }
    } catch {
      setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setLicenses(null); setConfirmPassword(''); setMessage('');
    await supabase.auth.signOut();
  }

  async function copyKey(key) {
    try {
      await navigator.clipboard.writeText(key);
      setMessage('라이선스 키를 복사했습니다.');
    } catch {
      setMessage('자동 복사가 지원되지 않습니다. 화면의 키를 직접 복사해 주세요.');
    }
  }

  return (
    <main style={outer}>
      <a href="/" style={{ ...muted, textDecoration: 'none' }}>← ChurchStudio 홈페이지</a>
      <h1 style={{ margin: '18px 0 6px' }}>내 라이선스</h1>
      <p style={muted}>본인에게 배정된 ChurchStudio 키만 확인할 수 있습니다. 보안을 위해 비밀번호를 다시 입력해야 합니다.</p>

      {initializing ? <div style={card}>로그인 상태 확인 중...</div> : !user ? (
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>회원 로그인</h2>
          <form onSubmit={login} style={{ display: 'grid', gap: 12 }}>
            <label htmlFor="license-login-email">이메일</label>
            <input id="license-login-email" style={field} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
            <label htmlFor="license-login-password">비밀번호</label>
            <input id="license-login-password" style={field} type="password" autoComplete="current-password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            <button type="submit" style={primary} disabled={busy}>{busy ? '로그인 중...' : '로그인'}</button>
          </form>
          <p style={muted}>아직 회원이 아니신가요? <a href="/feedback" style={{ color: '#8fd3ff' }}>회원가입하기</a></p>
        </section>
      ) : (
        <>
          <section style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <div><b>로그인 계정</b><p style={{ ...muted, marginBottom: 0 }}>{user.email}</p></div>
              <button style={secondary} type="button" onClick={logout}>로그아웃</button>
            </div>
          </section>

          <section style={card}>
            <h2 style={{ marginTop: 0 }}>비밀번호 재확인</h2>
            <p style={muted}>로그인 비밀번호를 다시 입력하면 회원 본인에게 발급된 키를 확인할 수 있습니다.</p>
            <form onSubmit={reveal} style={{ display: 'grid', gap: 12 }}>
              <label htmlFor="license-confirm-password">현재 비밀번호</label>
              <input id="license-confirm-password" style={field} type="password" autoComplete="current-password" required maxLength={200}
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              <button style={primary} type="submit" disabled={busy}>{busy ? '확인 중...' : '비밀번호 확인 후 키 보기'}</button>
            </form>
          </section>

          {Array.isArray(licenses) && licenses.length > 0 && (
            <section style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <h2 style={{ margin: 0 }}>발급된 라이선스</h2>
                <button style={secondary} type="button" onClick={() => { setLicenses(null); setMessage(''); }}>키 숨기기</button>
              </div>
              {licenses.map((license, index) => (
                <div key={license.license_key + index} style={{ borderTop: '1px solid #384867', paddingTop: 18, marginTop: 18 }}>
                  <p style={{ margin: '0 0 8px' }}><b>{license.status === 'active' ? '사용 가능' : '사용 중지'}</b> · 최대 {license.max_devices}대</p>
                  <div style={{ background: '#0b1020', border: '1px solid #384867', borderRadius: 10, padding: 14, overflowWrap: 'anywhere', fontFamily: 'monospace', fontSize: 17, letterSpacing: '.02em' }}>
                    {license.license_key}
                  </div>
                  {license.expires_at && <p style={muted}>만료일: {new Date(license.expires_at).toLocaleDateString('ko-KR')}</p>}
                  <button style={secondary} type="button" onClick={() => copyKey(license.license_key)}>키 복사</button>
                </div>
              ))}
              <p style={{ ...muted, marginBottom: 0, marginTop: 18, fontSize: 13 }}>화면을 떠나거나 로그아웃하면 키는 다시 숨겨집니다. 다른 사람과 공유하지 마세요.</p>
            </section>
          )}
        </>
      )}
      {message && <p role="status" style={{ marginTop: 18, color: '#ffd58a' }}>{message}</p>}
    </main>
  );
}
