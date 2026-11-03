'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const outer={maxWidth:820,margin:'0 auto',padding:'40px 20px 80px'};
const card={background:'#11182c',border:'1px solid #263452',borderRadius:18,padding:24,marginTop:20};
const input={width:'100%',boxSizing:'border-box',padding:'12px 14px',border:'1px solid #384867',borderRadius:10,fontSize:15,background:'#0b1020',color:'#f7f9ff'};
const btn={padding:'12px 16px',border:0,borderRadius:10,fontWeight:800,background:'#8fd3ff',color:'#08101d',cursor:'pointer'};
const muted={color:'#aeb9d2'};

function statusName(s){return s==='approved'?'승인 및 발급 완료':s==='rejected'?'확인 불가': '입금 확인 대기';}

export default function BankTransferPage(){
  const [session,setSession]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [church,setChurch]=useState('');
  const [depositor,setDepositor]=useState('');
  const [amount,setAmount]=useState('');
  const [date,setDate]=useState('');
  const [requests,setRequests]=useState([]);
  const [message,setMessage]=useState('');

  useEffect(()=>{
    let alive=true;
    supabase.auth.getSession().then(({data})=>{
      if(!alive)return;
      setSession(data?.session||null);setLoading(false);
      if(data?.session)load();
    }).catch(()=>{if(alive)setLoading(false)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{
      if(!alive)return;
      setSession(s);
      setMessage('');
      if(s)load();else setRequests([]);
      setLoading(false);
    });
    return ()=>{alive=false;subscription.unsubscribe();};
  },[]);

  async function invoke(body){
    const {data,error}=await supabase.functions.invoke('bank-transfer-licenses',{body});
    if(error || data?.error)throw new Error(data?.error || error?.message || '요청 실패');
    return data;
  }

  async function load(){
    try{
      const data=await invoke({action:'my-requests'});
      setRequests(Array.isArray(data?.requests)?data.requests:[]);
    }catch{
      setMessage('입금 신청 내역을 불러오지 못했습니다. 서비스 상태를 확인해 주세요.');
    }
  }

  async function login(event){
    event.preventDefault();setBusy(true);setMessage('');
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    setPassword('');setBusy(false);
    if(error)setMessage('로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.');
  }

  async function submit(event){
    event.preventDefault();
    const amountNumber=Number(amount);
    if(!Number.isInteger(amountNumber)||amountNumber<1)return setMessage('입금 금액을 정확히 입력해 주세요.');
    setBusy(true);setMessage('');
    try{
      await invoke({action:'submit',church_name:church.trim(),depositor_name:depositor.trim(),amount_krw:amountNumber,deposited_on:date});
      setMessage('입금 확인 신청이 접수되었습니다. 실제 계좌 거래내역 확인 후 관리자 승인 시 키가 발급됩니다.');
      setAmount('');
      await load();
    }catch(err){
      const e=String(err.message||'');
      setMessage(e.includes('pending_request_exists')?'이미 확인 대기 중인 신청이 있습니다.':
        e.includes('license_already_issued')?'이미 영구 라이선스가 발급된 계정입니다. 내 라이선스에서 확인해 주세요.':
        '신청을 등록하지 못했습니다. 입력값과 서비스 상태를 확인해 주세요.');
    }finally{setBusy(false);}
  }

  if(loading)return <main style={outer}>로그인 상태 확인 중...</main>;
  return <main style={outer}>
    <a href="/" style={{...muted,textDecoration:'none'}}>← ChurchStudio 홈페이지</a>
    <h1 style={{margin:'20px 0 8px'}}>입금 확인 신청</h1>
    <p style={muted}>가입한 계정에 영구 라이선스를 배정하는 신청 화면입니다. 라이선스는 컴퓨터 2대까지 사용할 수 있습니다.</p>
    {!session?(
      <section style={card}>
        <h2 style={{marginTop:0}}>회원 로그인</h2>
        <form onSubmit={login} style={{display:'grid',gap:12}}>
          <label htmlFor="pay-email">이메일</label>
          <input id="pay-email" style={input} type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/>
          <label htmlFor="pay-pass">비밀번호</label>
          <input id="pay-pass" style={input} type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/>
          <button style={btn} disabled={busy}>{busy?'확인 중...':'로그인'}</button>
        </form>
        <p style={muted}>계정이 없나요? <a href="/feedback" style={{color:'#8fd3ff'}}>회원가입하기</a></p>
      </section>
    ):(
      <>
        <section style={card}>
          <b>신청 계정</b>
          <p style={{...muted,marginBottom:0}}>{session.user.email}</p>
          <p style={{...muted,marginBottom:0,fontSize:14}}>입금 확인 후 이 계정에만 라이선스가 발급됩니다. 회원 아이디가 올바른지 확인해 주세요.</p>
        </section>
        <section style={card}>
          <h2 style={{marginTop:0}}>입금 정보 제출</h2>
          <p style={muted}>안내받은 계좌로 이미 입금하셨다면 아래 내용을 입력해 주세요. <b>신청 제출만으로 입금이 확인되거나 라이선스가 발급되지는 않습니다.</b></p>
          <form onSubmit={submit} style={{display:'grid',gap:12}}>
            <label htmlFor="pay-church">교회명</label>
            <input id="pay-church" style={input} required minLength={2} maxLength={120} value={church} onChange={e=>setChurch(e.target.value)} placeholder="예: ○○교회"/>
            <label htmlFor="pay-name">실제 입금자명</label>
            <input id="pay-name" style={input} required minLength={2} maxLength={80} value={depositor} onChange={e=>setDepositor(e.target.value)} placeholder="은행 거래내역에 표시되는 이름"/>
            <label htmlFor="pay-amount">입금 금액 (원)</label>
            <input id="pay-amount" style={input} required inputMode="numeric" type="number" min="1" max="100000000" value={amount} onChange={e=>setAmount(e.target.value)}/>
            <label htmlFor="pay-date">입금한 날짜</label>
            <input id="pay-date" style={input} required type="date" value={date} onChange={e=>setDate(e.target.value)}/>
            <button style={btn} type="submit" disabled={busy||requests.some(r=>r.status==='pending')}>{busy?'접수 중...':requests.some(r=>r.status==='pending')?'확인 대기 중':'입금 확인 신청'}</button>
          </form>
        </section>
        <section style={card}>
          <h2 style={{marginTop:0}}>나의 신청 내역</h2>
          {requests.length===0?<p style={muted}>아직 신청한 내역이 없습니다.</p>:requests.map(r=><article key={r.id} style={{padding:'16px 0',borderTop:'1px solid #384867'}}>
            <b>{statusName(r.status)}</b>
            <p style={{...muted,margin:'8px 0 0'}}>{r.church_name} · {r.depositor_name} · {Number(r.amount_krw).toLocaleString('ko-KR')}원 · {r.deposited_on}</p>
            {r.status==='approved'&&<p><a href="/license" style={{color:'#8fd3ff'}}>비밀번호 재확인 후 라이선스 키 보기</a></p>}
          </article>)}
          <button type="button" style={{...btn,background:'#263452',color:'#f7f9ff'}} onClick={load}>신청 상태 새로고침</button>
        </section>
        <p style={muted}>문의 사항은 <a href="/feedback" style={{color:'#8fd3ff'}}>사용자 의견 게시판</a>에 남겨 주세요.</p>
      </>
    )}
    {message&&<p role="status" style={{color:'#ffd58a',marginTop:16}}>{message}</p>}
  </main>;
}
