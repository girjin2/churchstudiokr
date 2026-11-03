'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const box={maxWidth:920,margin:'0 auto',padding:'40px 20px 80px'};
const card={background:'#11182c',border:'1px solid #263452',borderRadius:18,padding:22,marginBottom:16};
const input={width:'100%',padding:'12px 14px',border:'1px solid #384867',borderRadius:10,fontSize:15,boxSizing:'border-box',background:'#0b1020',color:'#f7f9ff'};
const btn={padding:'11px 16px',border:0,borderRadius:10,background:'#8fd3ff',color:'#08101d',fontWeight:800,cursor:'pointer'};
const ghost={...btn,background:'#263452',color:'#f7f9ff'};

export default function FeedbackPage(){
  const [session,setSession]=useState(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [loading,setLoading]=useState(true);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [displayName,setDisplayName]=useState('');
  const [message,setMessage]=useState('');
  const [posts,setPosts]=useState([]);
  const [title,setTitle]=useState('');
  const [body,setBody]=useState('');
  const [replyDrafts,setReplyDrafts]=useState({});

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>check(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>check(s));
    return ()=>subscription.unsubscribe();
  },[]);

  async function check(s){
    setSession(s||null);
    setIsAdmin(false);
    if(!s){setLoading(false);return;}
    const {data:p}=await supabase.from('profiles').select('role').eq('user_id',s.user.id).maybeSingle();
    setIsAdmin(p?.role==='admin');
    setLoading(false);
    await loadPosts();
  }

  async function loadPosts(){
    const {data,error}=await supabase.from('feedback_posts').select('*').order('created_at',{ascending:false});
    if(error){setMessage(error.message);return;}
    setPosts(data||[]);
  }

  async function login(e){
    e.preventDefault();setMessage('');setLoading(true);
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error){setMessage('로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.');setLoading(false);}
  }

  async function signup(){
    setMessage('');
    if(!email.trim()||password.length<6){setMessage('이메일과 6자 이상의 비밀번호를 입력해 주세요.');return;}
    setLoading(true);
    const {error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName.trim()||email.split('@')[0]}}});
    if(error)setMessage(error.message);
    else setMessage('가입 신청이 완료되었습니다. 이메일 확인이 요구되면 확인 후 로그인해 주세요.');
    setLoading(false);
  }

  async function addPost(e){
    e.preventDefault();setMessage('');
    if(!title.trim()||!body.trim())return;
    const {error}=await supabase.from('feedback_posts').insert({user_id:session.user.id,title:title.trim(),body:body.trim()});
    if(error){setMessage(error.message);return;}
    setTitle('');setBody('');setMessage('의견이 등록되었습니다. 이 글은 작성자와 관리자만 볼 수 있습니다.');await loadPosts();
  }

  async function saveReply(id){
    const text=(replyDrafts[id]||'').trim();
    const {error}=await supabase.from('feedback_posts').update({admin_reply:text||null,status:text?'answered':'open',replied_at:text?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',id);
    if(error){setMessage(error.message);return;}
    setMessage('답변이 저장되었습니다.');await loadPosts();
  }

  async function removePost(id){
    if(!confirm('이 의견을 삭제할까요?'))return;
    const {error}=await supabase.from('feedback_posts').delete().eq('id',id);
    if(error){setMessage(error.message);return;}
    await loadPosts();
  }

  if(loading)return <main style={box}><p>확인 중...</p></main>;

  if(!session)return <main style={box}>
    <a href="/" style={{color:'#aeb9d2',textDecoration:'none'}}>← ChurchStudio 홈페이지</a>
    <div style={{...card,maxWidth:520,margin:'50px auto'}}>
      <h1 style={{marginTop:0}}>사용자 의견 게시판</h1>
      <p style={{color:'#aeb9d2'}}>가입한 사용자만 글을 쓸 수 있으며, 작성한 글은 본인과 관리자만 볼 수 있습니다.</p>
      <form onSubmit={login} style={{display:'grid',gap:10}}>
        <input style={input} placeholder="이름 또는 표시명" value={displayName} onChange={e=>setDisplayName(e.target.value)}/>
        <input style={input} type="email" placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/>
        <input style={input} type="password" placeholder="비밀번호" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/>
        <button style={btn}>로그인</button>
        <button type="button" style={ghost} onClick={signup}>회원가입</button>
      </form>
      {message&&<p style={{color:'#ffd58a'}}>{message}</p>}
    </div>
  </main>;

  return <main style={box}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:24}}>
      <div><a href="/" style={{color:'#aeb9d2',textDecoration:'none'}}>← ChurchStudio 홈페이지</a><h1 style={{margin:'8px 0 0'}}>사용자 의견 게시판</h1></div>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <a href="/license" style={{...ghost,textDecoration:'none'}}>내 라이선스 키 확인</a>
        <button style={ghost} onClick={()=>supabase.auth.signOut()}>로그아웃</button>
      </div>
    </div>
    <div style={{...card,borderColor:'#5b5135'}}>
      <b>비밀 게시판</b>
      <p style={{marginBottom:0,color:'#aeb9d2'}}>일반 사용자는 자신이 작성한 글만 볼 수 있습니다. 관리자는 전체 글을 확인하고 답변할 수 있습니다.</p>
    </div>
    {message&&<p style={{color:'#ffd58a',fontWeight:700}}>{message}</p>}

    <section style={card}>
      <h2>의견 남기기</h2>
      <form onSubmit={addPost} style={{display:'grid',gap:10}}>
        <input style={input} maxLength={120} placeholder="제목" value={title} onChange={e=>setTitle(e.target.value)}/>
        <textarea style={{...input,minHeight:150}} maxLength={5000} placeholder="불편한 점, 개선 의견, 오류 상황 등을 자유롭게 적어 주세요." value={body} onChange={e=>setBody(e.target.value)}/>
        <button style={btn}>비밀글 등록</button>
      </form>
    </section>

    <section>
      <h2>{isAdmin?'전체 의견':'내가 작성한 의견'}</h2>
      {posts.length===0&&<div style={card}><p style={{margin:0,color:'#aeb9d2'}}>등록된 의견이 없습니다.</p></div>}
      {posts.map(p=><article key={p.id} style={card}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
          <div><strong style={{fontSize:18}}>{p.title}</strong><div style={{fontSize:13,color:'#8391ad',marginTop:4}}>{new Date(p.created_at).toLocaleString('ko-KR')} · {p.status==='answered'?'답변 완료':'확인 중'}</div></div>
          <button style={ghost} onClick={()=>removePost(p.id)}>삭제</button>
        </div>
        <p style={{whiteSpace:'pre-wrap'}}>{p.body}</p>
        {p.admin_reply&&<div style={{marginTop:16,padding:16,borderRadius:12,background:'#0b1020',border:'1px solid #384867'}}><b>관리자 답변</b><p style={{whiteSpace:'pre-wrap',marginBottom:0}}>{p.admin_reply}</p></div>}
        {isAdmin&&<div style={{marginTop:16,display:'grid',gap:8}}>
          <textarea style={{...input,minHeight:100}} placeholder="관리자 답변" value={replyDrafts[p.id]??p.admin_reply??''} onChange={e=>setReplyDrafts({...replyDrafts,[p.id]:e.target.value})}/>
          <button style={btn} onClick={()=>saveReply(p.id)}>답변 저장</button>
        </div>}
      </article>)}
    </section>
  </main>;
}
