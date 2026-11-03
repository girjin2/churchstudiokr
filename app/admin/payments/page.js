'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

const box={maxWidth:1120,margin:'0 auto',padding:'36px 20px 80px'};
const card={background:'#fff',border:'1px solid #e5e7eb',borderRadius:16,padding:24,marginBottom:16};
const btn={padding:'10px 16px',borderRadius:9,background:'#111827',color:'#fff',fontWeight:700,border:0,cursor:'pointer'};
const muted={color:'#64748b'};

const labels={pending:'입금 확인 대기',approved:'승인 및 영구 키 발급',rejected:'반려'};

export default function AdminPaymentPage(){
  const [user,setUser]=useState(null);
  const [ready,setReady]=useState(false);
  const [authorized,setAuthorized]=useState(false);
  const [rows,setRows]=useState([]);
  const [busy,setBusy]=useState('');
  const [msg,setMsg]=useState('');
  const [adminEmail,setAdminEmail]=useState('girjin2@gmail.com');
  const [adminPassword,setAdminPassword]=useState('');

  useEffect(()=>{
    let live=true;
    supabase.auth.getUser().then(({data})=>{
      if(!live)return;
      refreshAuth(data?.user||null);
    }).catch(()=>{if(live)setReady(true)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{
      if(!live)return;
      refreshAuth(s?.user||null);
    });
    return ()=>{live=false;subscription.unsubscribe();};
  },[]);

  async function refreshAuth(u){
    setUser(u);
    if(!u){setAuthorized(false);setRows([]);setReady(true);return;}
    const {data,error}=await supabase.from('profiles').select('role').eq('user_id',u.id).maybeSingle();
    if(error||data?.role!=='admin'){setAuthorized(false);setReady(true);return;}
    setAuthorized(true);setReady(true);
    await load();
  }

  async function invoke(body){
    const {data,error}=await supabase.functions.invoke('bank-transfer-licenses',{body});
    if(error||data?.error)throw new Error(data?.error || error?.message || 'Server Error');
    return data;
  }

  async function load(){
    try{
      const result=await invoke({action:'admin-list'});
      setRows((result.requests||[]).sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)));
    }catch{setMsg('내역을 조회하지 못했습니다. Supabase 서비스 상태를 확인해 주세요.');}
  }

  async function login(e){
    e.preventDefault();setMsg('');setBusy('login');
    const {error}=await supabase.auth.signInWithPassword({email:adminEmail.trim(),password:adminPassword});
    setAdminPassword('');setBusy('');
    if(error)setMsg('관리자 로그인을 확인해 주세요.');
  }

  async function approve(row){
    const ok=confirm(
      '실제 은행 입금 내역을 확인했습니까?\n\n'+
      '회원: '+(row.email||row.user_id)+'\n'+
      '교회: '+row.church_name+'\n'+
      '입금자: '+row.depositor_name+'\n'+
      '금액: '+Number(row.amount_krw).toLocaleString('ko-KR')+'원\n'+
      '입금일: '+row.deposited_on+'\n\n'+
      '은행 거래내역과 금액·입금자를 직접 대조한 경우에만 확인을 눌러 주세요.\n'+
      '확인하면 영구 라이선스 키가 즉시 발급됩니다.'
    );
    if(!ok)return;
    setMsg('');setBusy(row.id);
    try{
      await invoke({action:'approve',id:row.id,bank_statement_checked:true});
      setMsg('입금 승인 및 2대용 영구 라이선스 발급이 완료되었습니다.');
      await load();
    }catch(e){
      setMsg(e.message==='already_processed'?'이미 처리되었거나 회원에게 사용 중인 라이선스가 있습니다.':'발급에 실패했습니다. 승인 여부를 다시 확인해 주세요.');
      await load();
    }finally{setBusy('');}
  }

  async function reject(row){
    if(!confirm('이 신청을 반려할까요? 계좌 내역과 일치하지 않는 경우에만 진행하세요.'))return;
    setMsg('');setBusy(row.id);
    try{
      await invoke({action:'reject',id:row.id});
      setMsg('신청을 반려했습니다. 회원은 다시 신청할 수 있습니다.');
      await load();
    }catch{setMsg('반려에 실패했습니다. 상태를 다시 확인해 주세요.');}
    finally{setBusy('');}
  }

  if(!ready)return <main style={box}>관리자 인증 확인 중...</main>;
  return <main style={box}>
    <a href="/admin" style={{...muted,textDecoration:'none'}}>← 관리자 페이지</a>
    <h1>입금 확인 및 라이선스 발급</h1>
    {!user?(
      <section style={{...card,maxWidth:460}}>
        <h2>관리자 로그인</h2>
        <form onSubmit={login} style={{display:'grid',gap:12}}>
          <input style={{padding:12}} type="email" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)} required autoComplete="username"/>
          <input style={{padding:12}} type="password" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} required autoComplete="current-password"/>
          <button style={btn} disabled={!!busy}>관리자 로그인</button>
        </form>
      </section>
    ):!authorized?(
      <p>접근 권한이 없습니다. 관리자 계정으로 로그인해 주세요.</p>
    ):(
      <>
        <section style={card}>
          <h2 style={{marginTop:0}}>승인 규칙</h2>
          <p style={muted}>이 페이지는 은행 입금 내역을 자동 조회하지 않습니다. 반드시 은행 거래내역을 직접 확인하여 입금자·입금일·금액이 일치할 때만 승인하세요. 승인 시 회원 계정에 컴퓨터 2대용 영구 라이선스를 발급합니다.</p>
          <button style={btn} onClick={load} disabled={!!busy}>새로고침</button>
        </section>
        <section style={card}>
          <h2 style={{marginTop:0}}>입금 확인 신청 ({rows.filter(r=>r.status==='pending').length}건 대기)</h2>
          {rows.length===0?<p style={muted}>접수된 신청이 없습니다.</p>:rows.map(row=>(
            <article key={row.id} style={{borderTop:'1px solid #e5e7eb',padding:'18px 0'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'baseline'}}>
                <b>{labels[row.status]||row.status}</b>
                <span style={{...muted,fontSize:13}}>신청: {new Date(row.created_at).toLocaleString('ko-KR')}</span>
              </div>
              <p><b>{row.church_name}</b> · {row.email||row.user_id}</p>
              <p style={muted}>입금자: {row.depositor_name} | 입금액: {Number(row.amount_krw).toLocaleString('ko-KR')}원 | 입금일: {row.deposited_on}</p>
              {row.status==='pending'&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button style={btn} disabled={!!busy} onClick={()=>approve(row)}>{busy===row.id?'처리 중...':'입금 확인 · 영구 키 발급'}</button>
                <button style={{...btn,background:'#e5e7eb',color:'#111827'}} disabled={!!busy} onClick={()=>reject(row)}>반려</button>
              </div>}
              {row.status==='approved'&&<p style={{color:'#047857'}}>회원 계정에 키가 발급되었습니다. 회원은 내 라이선스에서 비밀번호를 재확인해 조회할 수 있습니다.</p>}
            </article>
          ))}
        </section>
      </>
    )}
    {msg&&<p role="status" style={{color:'#b45309'}}>{msg}</p>}
  </main>;
}
