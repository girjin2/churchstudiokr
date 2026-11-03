'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

const wrap={maxWidth:1200,margin:'0 auto',padding:'36px 20px 90px'};
const card={background:'#fff',border:'1px solid #e5e7eb',borderRadius:16,padding:22,marginBottom:16,boxShadow:'0 5px 20px rgba(15,23,42,.03)'};
const field={padding:'11px 13px',fontSize:14,border:'1px solid #cbd5e1',borderRadius:9,width:'100%',boxSizing:'border-box'};
const btn={padding:'10px 16px',border:0,borderRadius:9,background:'#111827',color:'#fff',cursor:'pointer',fontWeight:700};
const secondary={...btn,background:'#e5e7eb',color:'#111827'};
const muted={color:'#64748b',fontSize:13};
const statusLabels={pending:'입금 확인 대기',approved:'승인 완료',rejected:'반려',active:'사용 중',blocked:'사용 중지'};
const formatMoney=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const formatTime=t=>t?new Date(t).toLocaleString('ko-KR'):'-';
const blankEvidence={bank_name:'농협',transaction_reference:'',bank_depositor_name:'',bank_amount_krw:'',bank_deposited_at:'',verification_note:'',bank_statement_checked:false,price_checked:false};
const tabs=[['orders','구매·입금'],['members','회원'],['licenses','라이선스'],['audit','처리 이력']];
const actionLabels={request_submitted:'구매·입금 신청',bank_verified:'은행 입금 증빙 확인',license_issued:'라이선스 발급',request_rejected:'신청 반려',license_blocked:'라이선스 차단',license_reactivated:'라이선스 재활성화'};

export default function CommerceDashboard(){
  const [user,setUser]=useState(null);
  const [ready,setReady]=useState(false);
  const [authorized,setAuthorized]=useState(false);
  const [data,setData]=useState(null);
  const [tab,setTab]=useState('orders');
  const [query,setQuery]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [adminEmail,setAdminEmail]=useState('');
  const [adminPassword,setAdminPassword]=useState('');
  const [selectedOrder,setSelectedOrder]=useState(null);
  const [selectedMember,setSelectedMember]=useState(null);
  const [proof,setProof]=useState(blankEvidence);
  const [rejectReason,setRejectReason]=useState('');
  const [selectedLicense,setSelectedLicense]=useState(null);
  const [keyPassword,setKeyPassword]=useState('');
  const [visibleKey,setVisibleKey]=useState(null);

  useEffect(()=>{
    let active=true;
    supabase.auth.getUser().then(({data})=>{
      if(active)check(data?.user||null);
    }).catch(()=>{if(active)setReady(true);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{
      if(active)check(s?.user||null);
    });
    return ()=>{active=false;subscription.unsubscribe();};
  },[]);

  async function invoke(body){
    const {data:result,error}=await supabase.functions.invoke('bank-transfer-licenses',{body});
    if(error || result?.error)throw new Error(result?.error||error?.message||'server_unavailable');
    return result;
  }

  async function check(current){
    setUser(current);
    setVisibleKey(null);
    if(!current){setReady(true);setAuthorized(false);setData(null);return;}
    const {data:profile,error}=await supabase.from('profiles').select('role').eq('user_id',current.id).maybeSingle();
    const isAdmin=!error&&profile?.role==='admin';
    setAuthorized(isAdmin);setReady(true);
    if(isAdmin)await refresh();
  }

  async function refresh(){
    try{
      const res=await invoke({action:'admin-list'});
      setData(res);
    }catch{
      setNotice('관리 내역을 불러오지 못했습니다. Supabase 연결과 계정 권한을 확인해 주세요.');
    }
  }

  async function login(e){
    e.preventDefault();setNotice('');setBusy(true);
    const {error}=await supabase.auth.signInWithPassword({email:adminEmail.trim(),password:adminPassword});
    setAdminPassword('');setBusy(false);
    if(error)setNotice('관리자 로그인을 확인해 주세요.');
  }

  async function approve(order){
    if(!proof.bank_statement_checked||!proof.price_checked)return setNotice('실제 은행 거래내역과 사전에 안내한 금액을 각각 확인해 주세요.');
    if(!confirm('은행 거래번호 '+proof.transaction_reference+'의 입금을 직접 확인했습니까? 이 거래로 영구 라이선스를 발급합니다.'))return;
    setBusy(true);setNotice('');
    try{
      const response=await invoke({
        action:'approve',id:order.id,bank_statement_checked:true,price_checked:true,
        bank_name:proof.bank_name,transaction_reference:proof.transaction_reference,
        bank_depositor_name:proof.bank_depositor_name,bank_amount_krw:Number(proof.bank_amount_krw),
        bank_deposited_at: new Date(proof.bank_deposited_at+':00+09:00').toISOString(),
        verification_note:proof.verification_note
      });
      setNotice('입금 증거를 저장하고 컴퓨터 2대용 영구 라이선스를 발급했습니다. 발급 번호: '+response.license_id);
      setSelectedOrder(null);setProof(blankEvidence);await refresh();
    }catch(error){
      const key=String(error.message||'');
      const messages={
        duplicate_transaction_or_order:'은행 거래번호가 이미 승인에 사용되었거나 중복된 주문입니다.',
        bank_amount_mismatch:'은행 입금액과 구매 신청 금액이 일치하지 않습니다. 발급하지 않았습니다.',
        bank_mismatch_reason_required:'입금자명 또는 거래 날짜가 신청서와 달라 10자 이상의 차이 사유가 필요합니다.',
        already_processed:'이미 처리된 신청이거나 회원에게 활성 라이선스가 있습니다.',
        invalid_fields:'은행 거래증거를 모두 정확히 입력해 주세요.'
      };
      setNotice(messages[key]||'발급에 실패했습니다. 은행 증빙 정보와 서비스 상태를 확인해 주세요.');
    }finally{setBusy(false);}
  }

  async function reject(order){
    if(rejectReason.trim().length<5)return setNotice('반려 사유를 5자 이상 입력해 주세요.');
    if(!confirm('주문 '+order.order_number+'을 반려하시겠습니까?'))return;
    setBusy(true);setNotice('');
    try{
      await invoke({action:'reject',id:order.id,reason:rejectReason.trim()});
      setNotice('반려 사유와 관리자 처리 이력을 저장했습니다.');
      setSelectedOrder(null);setRejectReason('');await refresh();
    }catch{setNotice('반려에 실패했습니다. 현재 주문 상태를 확인해 주세요.');}
    finally{setBusy(false);}
  }

  async function changeLicense(license){
    const next=license.status==='active'?'blocked':'active';
    const label=next==='blocked'?'차단':'재활성화';
    const reason=prompt('라이선스 '+label+' 사유를 5자 이상 입력해 주세요. 실제 은행 환불 처리는 별도로 진행해야 합니다.');
    if(reason===null)return;
    if(reason.trim().length<5)return setNotice('처리 사유는 최소 5자 이상이어야 합니다.');
    if(!confirm('라이선스 #'+license.id+'을 '+label+'하고 변경 이력을 보관하시겠습니까?'))return;
    setBusy(true);setNotice('');
    try{
      await invoke({action:'set-license-status',license_id:license.id,new_status:next,reason:reason.trim()});
      setVisibleKey(null);
      setNotice('라이선스 '+label+' 처리와 변경 이력 저장을 완료했습니다.');
      await refresh();
    }catch{setNotice('라이선스 상태를 변경하지 못했습니다.');}
    finally{setBusy(false);}
  }

  async function revealKey(license){
    if(!keyPassword)return setNotice('관리자 비밀번호를 입력해 주세요.');
    setBusy(true);setNotice('');setVisibleKey(null);
    try{
      const res=await invoke({action:'admin-license-key',license_id:license.id,password:keyPassword});
      setVisibleKey({id:license.id,key:res.license_key});
    }catch{setNotice('비밀번호 확인 또는 키 조회에 실패했습니다.');}
    finally{setKeyPassword('');setBusy(false);}
  }

  const members=data?.members||[];
  const contacts=data?.contacts||[];
  const profiles=data?.profiles||[];
  const orders=data?.requests||[];
  const licenses=data?.licenses||[];
  const devices=data?.devices||[];
  const evidence=data?.evidence||[];
  const audit=data?.audit||[];
  const memberMap=useMemo(()=>new Map(members.map(u=>[u.id,u])),[data]);
  const contactMap=useMemo(()=>new Map(contacts.map(u=>[u.user_id,u])),[data]);
  const profileMap=useMemo(()=>new Map(profiles.map(u=>[u.user_id,u])),[data]);
  const evidenceMap=useMemo(()=>new Map(evidence.map(u=>[u.request_id,u])),[data]);
  const normalize=s=>String(s||'').toLowerCase();
  const matches=(...fields)=>fields.some(f=>normalize(f).includes(normalize(query.trim())));
  const filteredOrders=orders.filter(o=>{
    const member=memberMap.get(o.user_id),contact=contactMap.get(o.user_id);
    return matches(o.order_number,o.church_name,o.depositor_name,o.product_name,o.status,member?.email,contact?.phone,contact?.contact_name);
  });
  const filteredMembers=members.filter(u=>{
    const c=contactMap.get(u.id),p=profileMap.get(u.id);
    return matches(u.email,c?.church_name,c?.contact_name,c?.phone,p?.display_name,u.id);
  });
  const filteredLicenses=licenses.filter(l=>{
    const m=memberMap.get(l.user_id),c=contactMap.get(l.user_id);
    return matches(l.id,l.masked_key,l.status,m?.email,c?.church_name);
  });
  const linkedOrder=orders.find(o=>o.id===selectedOrder);
  const linkedMember=memberMap.get(linkedOrder?.user_id);
  const linkedContact=contactMap.get(linkedOrder?.user_id);
  const selectedMemberInfo=memberMap.get(selectedMember);
  const selectedMemberContact=contactMap.get(selectedMember);
  const selectedMemberProfile=profileMap.get(selectedMember);
  const linkedEvidence=linkedOrder&&evidenceMap.get(linkedOrder.id);
  const verifiedSum=evidence.reduce((sum,e)=>sum+Number(e.bank_amount_krw||0),0);

  if(!ready)return <main style={wrap}>관리자 계정을 확인하고 있습니다...</main>;
  return <main style={wrap}>
    <a href="/admin" style={{...muted,textDecoration:'none'}}>← 기존 관리자 페이지</a>
    <h1 style={{marginBottom:4}}>회원 · 구매 · 라이선스 관리</h1>
    <p style={muted}>은행 원장 대조 → 거래 증빙 저장 → 영구 라이선스 발급, 변경 이력까지 한 곳에서 확인합니다.</p>

    {!user?(
      <section style={{...card,maxWidth:460}}>
        <h2>관리자 로그인</h2>
        <form onSubmit={login} style={{display:'grid',gap:10}}>
          <input type="email" style={field} required placeholder="관리자 이메일" autoComplete="username" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)}/>
          <input type="password" style={field} required placeholder="비밀번호" autoComplete="current-password" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)}/>
          <button style={btn} disabled={busy}>로그인</button>
        </form>
      </section>
    ):!authorized?(
      <section style={card}>접근 권한이 없습니다. 관리자 계정으로 로그인해 주세요.</section>
    ):(
      <>
        <section style={{...card,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14}}>
          {[
            ['전체 회원',members.length+'명'],
            ['입금 대기',orders.filter(x=>x.status==='pending').length+'건'],
            ['승인된 주문',orders.filter(x=>x.status==='approved').length+'건'],
            ['발급 라이선스',licenses.filter(x=>x.user_id).length+'개'],
            ['입금 확인 누계',formatMoney(verifiedSum)],
          ].map(([name,count])=><div key={name} style={{padding:16,background:'#f8fafc',borderRadius:12}}>
            <div style={muted}>{name}</div><strong style={{fontSize:23}}>{count}</strong>
          </div>)}
          <p style={{...muted,gridColumn:'1/-1',margin:0}}>입금 확인 누계는 등록된 은행 증빙 기준이며 환불·수수료를 차감한 순매출이 아닙니다. 최근 기록은 최대 500건까지 조회합니다.</p>
        </section>

        <section style={card}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
            {tabs.map(([code,name])=><button type="button" key={code}
              style={tab===code?btn:secondary}
              onClick={()=>{setTab(code);setQuery('');setVisibleKey(null);}}>{name}</button>)}
            <button type="button" disabled={busy} style={{...secondary,marginLeft:'auto'}} onClick={refresh}>새로고침</button>
          </div>
          <input style={field} value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="회원 이메일, 교회명, 주문번호, 입금자명, 연락처로 검색"/>
        </section>

        {tab==='orders'&&(
          <section style={card}>
            <h2 style={{marginTop:0}}>구매 신청 · 입금 · 증빙 ({filteredOrders.length}건)</h2>
            <p style={muted}>회원이 제출한 입금 신고는 결제 증거가 아닙니다. 은행 원장과 사전 안내한 구매 금액을 모두 대조하고 증빙을 기록한 경우에만 키가 발급됩니다.</p>
            {filteredOrders.length===0?<p style={muted}>조회할 구매 신청이 없습니다.</p>:filteredOrders.map(order=>{
              const m=memberMap.get(order.user_id),c=contactMap.get(order.user_id),ev=evidenceMap.get(order.id);
              return <article key={order.id} style={{borderTop:'1px solid #e5e7eb',padding:'16px 0'}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                  <div><b>{order.order_number}</b> · {order.church_name}<p style={{...muted,margin:'4px 0'}}>{m?.email||order.user_id} · {c?.contact_name||'-'} · {c?.phone||'연락처 미등록'}</p></div>
                  <b style={{color:order.status==='approved'?'#047857':'#334155'}}>{statusLabels[order.status]||order.status}</b>
                </div>
                <p style={{margin:'8px 0'}}>상품: {order.product_name} · 신청 금액 {formatMoney(order.amount_krw)} · 입금 신고일 {order.deposited_on}</p>
                <button style={secondary} onClick={()=>{setSelectedOrder(order.id===selectedOrder?null:order.id);setProof(blankEvidence);setRejectReason('');}}>상세 {selectedOrder===order.id?'접기':'열기'}</button>
                {ev&&<p style={{...muted,marginBottom:0}}>은행 증빙: {ev.bank_name} / 거래번호 {ev.transaction_reference} / {formatMoney(ev.bank_amount_krw)}</p>}
              </article>;
            })}
            {linkedOrder&&<div style={{...card,border:'2px solid #94a3b8',marginTop:18}}>
              <h3 style={{marginTop:0}}>주문 상세 · {linkedOrder.order_number}</h3>
              <p>회원: {linkedMember?.email||linkedOrder.user_id}</p>
              <p>교회: {linkedOrder.church_name} / 담당자: {linkedContact?.contact_name||'-'} / 전화: {linkedContact?.phone||'-'}</p>
              <p>구매 상품: {linkedOrder.product_name} / 신청금액: {formatMoney(linkedOrder.amount_krw)}</p>
              <p>입금 신고: {linkedOrder.depositor_name} / {linkedOrder.deposited_on}</p>
              <p>신청일: {formatTime(linkedOrder.created_at)} / 상태: {statusLabels[linkedOrder.status]}</p>
              {linkedOrder.review_note&&<p>관리자 메모: {linkedOrder.review_note}</p>}
              {linkedEvidence&&<div style={{background:'#f1f5f9',padding:14,borderRadius:10}}>
                <b>승인에 사용한 은행 증거</b>
                <p>은행: {linkedEvidence.bank_name} · 고유번호: {linkedEvidence.transaction_reference}</p>
                <p>입금자: {linkedEvidence.bank_depositor_name} · 금액: {formatMoney(linkedEvidence.bank_amount_krw)}</p>
                <p>실제 거래시각: {formatTime(linkedEvidence.bank_deposited_at)} · 승인: {formatTime(linkedEvidence.confirmed_at)}</p>
                {linkedEvidence.verification_note&&<p>차이 사유: {linkedEvidence.verification_note}</p>}
              </div>}
              {linkedOrder.status==='pending'&&<>
                <h3>은행 입금 증빙 기록 후 승인</h3>
                <p style={muted}>은행 앱 또는 인터넷뱅킹의 실제 입금 거래 상세화면에서 각 값을 확인해 입력하세요. 동일 거래번호 재사용은 차단됩니다.</p>
                <form onSubmit={e=>{e.preventDefault();approve(linkedOrder);}} style={{display:'grid',gap:10}}>
                  <label>입금받은 은행</label>
                  <input style={field} value={proof.bank_name} required minLength={2} maxLength={50} onChange={e=>setProof({...proof,bank_name:e.target.value})}/>
                  <label>은행 거래 고유번호 또는 거래내역 식별번호 (중복 사용 불가)</label>
                  <input style={field} value={proof.transaction_reference} required minLength={4} maxLength={120} onChange={e=>setProof({...proof,transaction_reference:e.target.value})}/>
                  <label>은행 거래내역에 표시된 실제 입금자</label>
                  <input style={field} required minLength={2} maxLength={80} value={proof.bank_depositor_name} onChange={e=>setProof({...proof,bank_depositor_name:e.target.value})}/>
                  <label>은행에서 확인한 실제 입금액 (원)</label>
                  <input style={field} type="number" required min="1" value={proof.bank_amount_krw} onChange={e=>setProof({...proof,bank_amount_krw:e.target.value})}/>
                  <label>은행에 기록된 입금 시각 (한국시간)</label>
                  <input style={field} type="datetime-local" step="60" required value={proof.bank_deposited_at} onChange={e=>setProof({...proof,bank_deposited_at:e.target.value})}/>
                  <label>입금자명·날짜 불일치 사유 (차이가 있을 때 10자 이상 필수)</label>
                  <textarea style={{...field,minHeight:75}} maxLength={1000} value={proof.verification_note} onChange={e=>setProof({...proof,verification_note:e.target.value})}/>
                  <label style={{display:'flex',alignItems:'center',gap:8}}>
                    <input type="checkbox" checked={proof.bank_statement_checked} onChange={e=>setProof({...proof,bank_statement_checked:e.target.checked})}/>
                    실제 은행 거래내역을 열어 입금자·입금액·거래번호·일시를 대조했습니다.
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:8}}>
                    <input type="checkbox" checked={proof.price_checked} onChange={e=>setProof({...proof,price_checked:e.target.checked})}/>
                    사전에 구매자에게 안내한 라이선스 금액과 입금액이 일치함을 확인했습니다.
                  </label>
                  <button style={btn} disabled={busy||!proof.bank_statement_checked||!proof.price_checked}>입금 승인 · 영구 키 발급</button>
                </form>
                <h3 style={{marginTop:28}}>또는 신청 반려</h3>
                <textarea style={{...field,minHeight:65}} minLength={5} maxLength={500} placeholder="반려 사유 (회원에게 표시됨)" value={rejectReason} onChange={e=>setRejectReason(e.target.value)}/>
                <button type="button" disabled={busy||rejectReason.trim().length<5} style={{...secondary,marginTop:8}} onClick={()=>reject(linkedOrder)}>반려 및 사유 기록</button>
              </>}
            </div>}
          </section>
        )}

        {tab==='members'&&(
          <section style={card}>
            <h2 style={{marginTop:0}}>회원 목록 ({filteredMembers.length}명)</h2>
            {filteredMembers.map(m=>{
              const c=contactMap.get(m.id),p=profileMap.get(m.id);
              const own=orders.filter(o=>o.user_id===m.id);
              return <div key={m.id} style={{borderTop:'1px solid #e5e7eb',padding:'14px 0'}}>
                <b>{c?.church_name||'(교회 미등록)'}</b> · {p?.display_name||c?.contact_name||'-'}
                <p style={{...muted,margin:'4px 0'}}>{m.email} · {c?.phone||'연락처 없음'} · 구매신청 {own.length}건 · 라이선스 {licenses.filter(x=>x.user_id===m.id).length}개</p>
                <button style={secondary} onClick={()=>setSelectedMember(selectedMember===m.id?null:m.id)}>회원 상세 {selectedMember===m.id?'접기':'열기'}</button>
              </div>;
            })}
            {selectedMemberInfo&&<div style={{...card,border:'2px solid #94a3b8',marginTop:18}}>
              <h3 style={{marginTop:0}}>회원 상세</h3>
              <p>이메일: {selectedMemberInfo.email} / 회원번호: {selectedMemberInfo.id}</p>
              <p>교회: {selectedMemberContact?.church_name||'-'} / 담당자: {selectedMemberContact?.contact_name||selectedMemberProfile?.display_name||'-'}</p>
              <p>전화번호: {selectedMemberContact?.phone||'미등록'}</p>
              <p>가입일: {formatTime(selectedMemberInfo.created_at)} / 마지막 로그인: {formatTime(selectedMemberInfo.last_sign_in_at)}</p>
              <h4>구매 내역</h4>
              {orders.filter(o=>o.user_id===selectedMember).length===0?<p style={muted}>없음</p>:orders.filter(o=>o.user_id===selectedMember).map(o=><p key={o.id}>{o.order_number} · {formatMoney(o.amount_krw)} · {statusLabels[o.status]} · {formatTime(o.created_at)}</p>)}
              <h4>라이선스 · 컴퓨터</h4>
              {licenses.filter(l=>l.user_id===selectedMember).map(l=><p key={l.id}>#{l.id} · {l.masked_key} · {statusLabels[l.status]} · {devices.filter(d=>d.license_id===l.id&&d.is_active).length}/2대</p>)}
            </div>}
          </section>
        )}

        {tab==='licenses'&&(
          <section style={card}>
            <h2 style={{marginTop:0}}>라이선스 관리 ({filteredLicenses.length}개)</h2>
            <p style={muted}>목록에서는 키가 가려집니다. 전체 키를 확인하려면 관리자 비밀번호를 다시 입력해야 합니다.</p>
            {filteredLicenses.map(l=>{
              const m=memberMap.get(l.user_id),c=contactMap.get(l.user_id);
              const ds=devices.filter(d=>d.license_id===l.id);
              return <article key={l.id} style={{borderTop:'1px solid #e5e7eb',padding:'16px 0'}}>
                <b>라이선스 #{l.id} · {statusLabels[l.status]||l.status}</b>
                <p style={{...muted,margin:'5px 0'}}>{c?.church_name||'-'} · {m?.email||'배정 전'} · {l.masked_key}</p>
                <p>발급일 {formatTime(l.issued_at)} · {ds.filter(d=>d.is_active).length}/2대 사용 · {l.expires_at?'만료일 '+formatTime(l.expires_at):'기간 무제한'}</p>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button style={secondary} onClick={()=>{setSelectedLicense(selectedLicense===l.id?null:l.id);setVisibleKey(null);}}>상세 {selectedLicense===l.id?'접기':'열기'}</button>
                  <button disabled={busy} style={secondary} onClick={()=>changeLicense(l)}>{l.status==='active'?'라이선스 차단':'재활성화'}</button>
                </div>
                {selectedLicense===l.id&&<div style={{background:'#f8fafc',padding:16,borderRadius:12,marginTop:10}}>
                  <h4>등록된 컴퓨터</h4>
                  {ds.length===0?<p style={muted}>등록 이력이 없습니다.</p>:ds.map((d,i)=><p key={i} style={muted}>{d.device_name||'장치 '+(i+1)} · {d.platform||'-'} · {d.is_active?'사용 중':'해제됨'} · 마지막 접속 {formatTime(d.last_seen_at)}</p>)}
                  <h4>관리자 비밀번호 재확인 후 전체 키 보기</h4>
                  <form onSubmit={e=>{e.preventDefault();revealKey(l);}} style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <input style={{...field,flex:'1 1 230px',width:'auto'}} type="password" autoComplete="current-password" value={keyPassword} onChange={e=>setKeyPassword(e.target.value)} placeholder="관리자 비밀번호"/>
                    <button style={btn} disabled={busy}>키 확인</button>
                  </form>
                  {visibleKey?.id===l.id&&<div style={{marginTop:12,background:'#e2e8f0',borderRadius:9,padding:12,wordBreak:'break-all',fontFamily:'monospace'}}>{visibleKey.key}<button style={{...secondary,marginLeft:10}} onClick={()=>setVisibleKey(null)}>숨기기</button></div>}
                </div>}
              </article>;
            })}
          </section>
        )}

        {tab==='audit'&&(
          <section style={card}>
            <h2 style={{marginTop:0}}>승인 · 발급 · 변경 이력</h2>
            <p style={muted}>거래 확인, 라이선스 발급·차단·재활성화 및 반려 이력이 시간순으로 저장됩니다. 비밀번호와 라이선스 원문은 이력에 기록하지 않습니다.</p>
            {audit.filter(a=>matches(a.event_type,a.user_id,a.request_id,a.license_id,a.actor_user_id)).length===0?<p style={muted}>표시할 이력이 없습니다.</p>:audit.filter(a=>matches(a.event_type,a.user_id,a.request_id,a.license_id,a.actor_user_id)).map(a=><div key={a.id} style={{padding:'12px 0',borderTop:'1px solid #e5e7eb'}}>
              <b>{actionLabels[a.event_type]||a.event_type}</b> · {formatTime(a.occurred_at)}
              <p style={{...muted,margin:'5px 0'}}>회원 {memberMap.get(a.user_id)?.email||a.user_id||'-'} · 관리자 {memberMap.get(a.actor_user_id)?.email||a.actor_user_id||'-'}</p>
              <p style={{...muted,margin:0}}>주문 {orders.find(o=>o.id===a.request_id)?.order_number||a.request_id||'-'} · 라이선스 #{a.license_id||'-'} · {a.detail?.reason||''}</p>
            </div>)}
          </section>
        )}
      </>
    )}
    {notice&&<p role="status" style={{color:'#b45309',fontWeight:700,background:'#fffbeb',padding:14,borderRadius:10}}>{notice}</p>}
  </main>;
}
