'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

const box = {maxWidth:980,margin:'0 auto',padding:'32px 20px 60px'};
const card = {background:'#fff',border:'1px solid #e5e7eb',borderRadius:18,padding:22,marginBottom:18,boxShadow:'0 8px 24px rgba(15,23,42,.05)'};
const input = {width:'100%',padding:'12px 14px',border:'1px solid #cbd5e1',borderRadius:10,fontSize:15,boxSizing:'border-box'};
const btn = {padding:'11px 16px',border:0,borderRadius:10,background:'#111827',color:'#fff',fontWeight:700,cursor:'pointer'};
const lightBtn = {...btn,background:'#e5e7eb',color:'#111827'};

function parseGitHubReleaseUrl(url=''){
  const m=url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/(.+)$/i);
  if(!m) return null;
  return {owner:m[1],repo:m[2],tag:decodeURIComponent(m[3]),assetName:decodeURIComponent(m[4])};
}

export default function AdminPage(){
  const [session,setSession]=useState(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [loading,setLoading]=useState(true);
  const [email,setEmail]=useState('girjin2@gmail.com');
  const [password,setPassword]=useState('');
  const [message,setMessage]=useState('');
  const [notices,setNotices]=useState([]);
  const [releases,setReleases]=useState([]);
  const [downloadCounts,setDownloadCounts]=useState({});
  const [downloadLoading,setDownloadLoading]=useState(false);
  const [notice,setNotice]=useState({title:'',body:'',is_pinned:false,is_published:true});
  const [release,setRelease]=useState({version:'',title:'',summary:'',download_url:'',file_name:'',file_size_text:'',sha256:'',is_latest:true,is_published:true});

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>check(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>check(s));
    return ()=>subscription.unsubscribe();
  },[]);

  async function check(s){
    setSession(s||null);
    setIsAdmin(false);
    if(!s){ setLoading(false); return; }
    const {data}=await supabase.from('profiles').select('role').eq('user_id',s.user.id).maybeSingle();
    const ok=data?.role==='admin';
    setIsAdmin(ok);
    setLoading(false);
    if(ok) await loadAll();
  }

  async function loadDownloadCounts(rows){
    setDownloadLoading(true);
    const counts={};
    const cache=new Map();
    try{
      await Promise.all((rows||[]).map(async r=>{
        const parsed=parseGitHubReleaseUrl(r.download_url||'');
        if(!parsed){ counts[r.id]=null; return; }
        const key=`${parsed.owner}/${parsed.repo}/${parsed.tag}`;
        let data=cache.get(key);
        if(!data){
          const res=await fetch(`https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/releases/tags/${encodeURIComponent(parsed.tag)}`,{headers:{Accept:'application/vnd.github+json'}});
          if(!res.ok){ counts[r.id]=null; return; }
          data=await res.json();
          cache.set(key,data);
        }
        const asset=(data.assets||[]).find(a=>a.name===parsed.assetName) || (data.assets||[]).find(a=>a.browser_download_url===r.download_url);
        counts[r.id]=asset?asset.download_count:null;
      }));
      setDownloadCounts(counts);
    }catch{
      setDownloadCounts({});
    }finally{
      setDownloadLoading(false);
    }
  }

  async function loadAll(){
    const [{data:n},{data:r}]=await Promise.all([
      supabase.from('notices').select('*').order('is_pinned',{ascending:false}).order('published_at',{ascending:false}),
      supabase.from('releases').select('*').order('released_at',{ascending:false})
    ]);
    setNotices(n||[]);
    setReleases(r||[]);
    await loadDownloadCounts(r||[]);
  }

  const currentTotal=useMemo(()=>Object.values(downloadCounts).reduce((sum,n)=>sum+(typeof n==='number'?n:0),0),[downloadCounts]);
  const latestRelease=releases.find(r=>r.is_latest)||releases[0]||null;
  const latestCount=latestRelease && typeof downloadCounts[latestRelease.id]==='number' ? downloadCounts[latestRelease.id] : null;

  async function login(e){
    e.preventDefault(); setMessage(''); setLoading(true);
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error){ setMessage('로그인에 실패했습니다. 관리자 계정이 아직 없다면 아래 계정 만들기를 눌러주세요.'); setLoading(false); }
  }

  async function signup(){
    setMessage('');
    if(email.toLowerCase()!=='girjin2@gmail.com'){ setMessage('관리자 이메일은 girjin2@gmail.com만 사용할 수 있습니다.'); return; }
    if(password.length<6){ setMessage('비밀번호는 6자 이상 입력해 주세요.'); return; }
    setLoading(true);
    const {error}=await supabase.auth.signUp({email,password,options:{data:{display_name:'ChurchStudio 관리자'}}});
    if(error) setMessage(error.message);
    else setMessage('관리자 계정을 만들었습니다. 이메일 확인 요청이 오면 확인한 뒤 로그인해 주세요.');
    setLoading(false);
  }

  async function addNotice(e){
    e.preventDefault(); setMessage('');
    if(!notice.title.trim()||!notice.body.trim()) return;
    const {error}=await supabase.from('notices').insert(notice);
    if(error) setMessage(error.message); else { setNotice({title:'',body:'',is_pinned:false,is_published:true}); await loadAll(); }
  }

  async function deleteNotice(id){
    if(!confirm('이 공지를 삭제할까요?')) return;
    await supabase.from('notices').delete().eq('id',id); await loadAll();
  }

  async function addRelease(e){
    e.preventDefault(); setMessage('');
    if(!release.version.trim()||!release.title.trim()){ setMessage('버전과 배포 제목을 입력해 주세요.'); return; }
    if(!release.download_url.trim()){ setMessage('GitHub Release의 다운로드 링크를 입력해 주세요.'); return; }
    if(release.is_latest) await supabase.from('releases').update({is_latest:false}).eq('is_latest',true);
    const payload={...release,download_url:release.download_url.trim(),file_name:release.file_name||null,file_size_text:release.file_size_text||null,sha256:release.sha256||null};
    const {error}=await supabase.from('releases').insert(payload);
    if(error) setMessage(error.message); else { setRelease({version:'',title:'',summary:'',download_url:'',file_name:'',file_size_text:'',sha256:'',is_latest:true,is_published:true}); await loadAll(); setMessage('배포 등록이 완료되었습니다. 홈페이지 다운로드 버튼에 연결되었습니다.'); }
  }

  async function deleteRelease(id){
    if(!confirm('이 배포 정보를 삭제할까요?')) return;
    await supabase.from('releases').delete().eq('id',id); await loadAll();
  }

  if(loading) return <main style={box}><p>확인 중...</p></main>;

  if(!session) return <main style={box}>
    <a href="/" style={{textDecoration:'none',color:'#475569'}}>← 홈페이지</a>
    <div style={{...card,maxWidth:460,margin:'60px auto'}}>
      <h1 style={{marginTop:0}}>ChurchStudio 관리자</h1>
      <p style={{color:'#64748b'}}>관리자 계정으로 로그인하세요.</p>
      <form onSubmit={login} style={{display:'grid',gap:12}}>
        <input style={input} type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" placeholder="이메일" />
        <input style={input} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="비밀번호" />
        <button style={btn}>로그인</button>
        <button type="button" style={lightBtn} onClick={signup}>첫 관리자 계정 만들기</button>
      </form>
      {message&&<p style={{marginTop:14,color:'#b91c1c'}}>{message}</p>}
    </div>
  </main>;

  if(!isAdmin) return <main style={box}><h1>접근 권한이 없습니다.</h1><button style={btn} onClick={()=>supabase.auth.signOut()}>로그아웃</button></main>;

  return <main style={box}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:24}}>
      <div><a href="/" style={{textDecoration:'none',color:'#475569'}}>← 홈페이지</a><h1 style={{margin:'8px 0 0'}}>관리자</h1></div>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <a href="/admin/payments" style={{...btn,textDecoration:'none'}}>입금 확인 · 라이선스 발급</a>
        <button style={lightBtn} onClick={()=>supabase.auth.signOut()}>로그아웃</button>
      </div>
    </div>
    {message&&<p style={{color:message.includes('완료')?'#047857':'#b91c1c',fontWeight:700}}>{message}</p>}

    <section style={card}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div>
          <h2 style={{margin:'0 0 8px'}}>다운로드 현황</h2>
          <p style={{margin:0,color:'#64748b'}}>GitHub Releases의 현재 asset 다운로드 수를 자동으로 읽습니다.</p>
        </div>
        <button type="button" style={lightBtn} onClick={()=>loadDownloadCounts(releases)} disabled={downloadLoading}>{downloadLoading?'확인 중...':'새로고침'}</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginTop:18}}>
        <div style={{padding:18,border:'1px solid #e5e7eb',borderRadius:14}}><div style={{fontSize:13,color:'#64748b'}}>최신 배포 파일</div><strong style={{fontSize:28}}>{downloadLoading?'…':latestCount===null?'확인 불가':`${latestCount.toLocaleString()}회`}</strong></div>
        <div style={{padding:18,border:'1px solid #e5e7eb',borderRadius:14}}><div style={{fontSize:13,color:'#64748b'}}>현재 등록 asset 합계</div><strong style={{fontSize:28}}>{downloadLoading?'…':`${currentTotal.toLocaleString()}회`}</strong></div>
      </div>
      <p style={{margin:'14px 0 0',fontSize:13,color:'#92400e'}}>※ GitHub에서 기존 asset을 삭제하고 새 파일로 교체하면 그 파일의 다운로드 수는 0부터 다시 시작합니다. 삭제된 이전 asset의 횟수는 GitHub에서 자동 합산되지 않습니다.</p>
    </section>

    <section style={card}>
      <h2>공지 등록</h2>
      <form onSubmit={addNotice} style={{display:'grid',gap:10}}>
        <input style={input} placeholder="제목" value={notice.title} onChange={e=>setNotice({...notice,title:e.target.value})}/>
        <textarea style={{...input,minHeight:120}} placeholder="내용" value={notice.body} onChange={e=>setNotice({...notice,body:e.target.value})}/>
        <div style={{display:'flex',gap:18,flexWrap:'wrap'}}>
          <label><input type="checkbox" checked={notice.is_pinned} onChange={e=>setNotice({...notice,is_pinned:e.target.checked})}/> 상단 고정</label>
          <label><input type="checkbox" checked={notice.is_published} onChange={e=>setNotice({...notice,is_published:e.target.checked})}/> 공개</label>
        </div>
        <button style={btn}>공지 등록</button>
      </form>
      <div style={{marginTop:20}}>{notices.map(n=><div key={n.id} style={{borderTop:'1px solid #e5e7eb',padding:'12px 0',display:'flex',justifyContent:'space-between',gap:12}}><div><strong>{n.is_pinned?'[고정] ':''}{n.title}</strong><div style={{color:'#64748b',fontSize:14}}>{n.is_published?'공개':'비공개'}</div></div><button style={lightBtn} onClick={()=>deleteNotice(n.id)}>삭제</button></div>)}</div>
    </section>

    <section style={card}>
      <h2>배포 등록</h2>
      <p style={{color:'#64748b',marginTop:0}}>배포 파일은 GitHub Releases에 올리고, 그 파일의 다운로드 링크만 여기에 입력합니다. 실제 파일 저장과 다운로드 트래픽은 Vercel을 사용하지 않습니다.</p>
      <form onSubmit={addRelease} style={{display:'grid',gap:10}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10}}>
          <input style={input} placeholder="버전 예: 공개베타1" value={release.version} onChange={e=>setRelease({...release,version:e.target.value})}/>
          <input style={input} placeholder="배포 제목 예: ChurchStudio 공개 베타" value={release.title} onChange={e=>setRelease({...release,title:e.target.value})}/>
        </div>
        <textarea style={{...input,minHeight:90}} placeholder="설명" value={release.summary} onChange={e=>setRelease({...release,summary:e.target.value})}/>
        <input style={input} placeholder="GitHub Release 파일 다운로드 링크" value={release.download_url} onChange={e=>setRelease({...release,download_url:e.target.value})}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <input style={input} placeholder="파일명 예: 스튜디오_공개베타_단일카메라_EXE.zip" value={release.file_name} onChange={e=>setRelease({...release,file_name:e.target.value})}/>
          <input style={input} placeholder="파일 크기 예: 650 MB" value={release.file_size_text} onChange={e=>setRelease({...release,file_size_text:e.target.value})}/>
        </div>
        <input style={input} placeholder="SHA-256 (선택)" value={release.sha256} onChange={e=>setRelease({...release,sha256:e.target.value})}/>
        <div style={{display:'flex',gap:18,flexWrap:'wrap'}}>
          <label><input type="checkbox" checked={release.is_latest} onChange={e=>setRelease({...release,is_latest:e.target.checked})}/> 최신 버전</label>
          <label><input type="checkbox" checked={release.is_published} onChange={e=>setRelease({...release,is_published:e.target.checked})}/> 공개</label>
        </div>
        <button style={btn}>배포 등록</button>
      </form>
      <div style={{marginTop:20}}>{releases.map(r=>{
        const count=downloadCounts[r.id];
        return <div key={r.id} style={{borderTop:'1px solid #e5e7eb',padding:'12px 0',display:'flex',justifyContent:'space-between',gap:12}}><div><strong>{r.is_latest?'[최신] ':''}{r.version} · {r.title}</strong><div style={{color:'#64748b',fontSize:14}}>{r.is_published?'공개':'비공개'}{r.file_name?` · ${r.file_name}`:''} · 다운로드 {downloadLoading?'확인 중':typeof count==='number'?`${count.toLocaleString()}회`:'확인 불가'}</div></div><button style={lightBtn} onClick={()=>deleteRelease(r.id)}>삭제</button></div>;
      })}</div>
    </section>
  </main>;
}
