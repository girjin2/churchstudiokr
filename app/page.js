'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const READER_APK_URL='https://github.com/girjin2/churchstudiokr/releases/download/worship-reader-android/WorshipReader-Android.apk';
const PHONE_CAMERA_APK_URL='https://github.com/girjin2/churchstudiokr/releases/download/public-beta-1/ChurchStudioPhoneCamera-V3_8_7-debug.apk';
const IPHONE_CAMERA_SOURCE_URL='https://github.com/girjin2/phone-camera-ios/archive/refs/heads/main.zip';

function noticeDate(value){
  if(!value) return '';
  try{
    return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  }catch{
    return '';
  }
}

export default function Home() {
  const [latest,setLatest]=useState(null);
  const [notices,setNotices]=useState([]);

  useEffect(()=>{
    Promise.all([
      supabase
        .from('releases')
        .select('*')
        .eq('is_published',true)
        .order('is_latest',{ascending:false})
        .order('released_at',{ascending:false})
        .limit(1)
        .maybeSingle(),
      supabase
        .from('notices')
        .select('*')
        .eq('is_published',true)
        .order('is_pinned',{ascending:false})
        .order('published_at',{ascending:false})
        .limit(10)
    ]).then(([releaseResult,noticeResult])=>{
      setLatest(releaseResult.data||null);
      setNotices(noticeResult.data||[]);
    });
  },[]);

  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <div className="eyebrow">ChurchStudio 공식 배포 페이지</div>
          <h1>교회 예배와 방송을 하나로</h1>
          <p className="muted">예배 자막, PPT, 카메라, 유튜브 송출을 한 곳에서 운영하는 교회 방송 통합 프로그램</p>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:18}}>
            <a className="btn" href="#download">{latest?.download_url?'다운로드':'다운로드 준비 중'}</a>
            <a className="btn" href="#studio-guide">스튜디오 사용법</a>
            <a className="btn" href="/feedback">회원가입 / 로그인</a>
            <a className="btn" href="/feedback">사용자 의견</a>
          </div>
        </div>
      </section>

      <section className="section" id="notice">
        <div className="wrap">
          <h2>공지사항</h2>
          {notices.length===0 ? (
            <div className="card"><p className="muted" style={{margin:0}}>등록된 공지가 없습니다.</p></div>
          ) : notices.map(n=>(
            <div className="card" key={n.id} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'baseline',flexWrap:'wrap'}}>
                <b>{n.is_pinned?'[중요] ':''}{n.title}</b>
                <span className="muted" style={{fontSize:13}}>{noticeDate(n.published_at||n.created_at)}</span>
              </div>
              <p className="muted" style={{whiteSpace:'pre-wrap',marginBottom:0}}>{n.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>주요 기능</h2>
          <div className="grid">
            <div className="card"><b>PPT · 자막</b><p className="muted">예배 PPT와 자막 운영</p></div>
            <div className="card"><b>멀티 카메라</b><p className="muted">카메라 1~4 실시간 확인 및 선택</p></div>
            <div className="card"><b>YouTube 송출</b><p className="muted">유튜브 방송 송출 관리</p></div>
            <div className="card"><b>방송 상태 확인</b><p className="muted">방송 흐름을 한 화면에서 확인</p></div>
          </div>
        </div>
      </section>

      <section className="section" id="studio-guide">
        <div className="wrap">
          <h2>스튜디오 사용법</h2>
          <div className="card">
            <b>처음 실행했다면 아래 순서대로 준비하면 됩니다.</b>
            <ol style={{margin:'16px 0 0',paddingLeft:22}}>
              <li style={{marginBottom:12}}><b>카메라</b> · 카메라 1에서 사용할 카메라를 선택하고 영상이 정상적으로 보이는지 확인합니다. 휴대폰 카메라는 전용 앱과 USB 연결 후 카메라에서 선택합니다.</li>
              <li style={{marginBottom:12}}><b>오디오</b> · 방송에 사용할 마이크 또는 USB 오디오 장치를 선택하고 소리 게이지가 움직이는지 확인합니다.</li>
              <li style={{marginBottom:12}}><b>PPT · 영상 · 자막</b> · 예배에 사용할 PPT, 영상, 자막과 필요한 예배 자료를 미리 불러옵니다.</li>
              <li style={{marginBottom:12}}><b>READY · PROGRAM</b> · READY는 다음에 내보낼 준비 화면이고 PROGRAM은 실제 방송 화면입니다. 화면을 확인한 뒤 원하는 순서대로 전환합니다.</li>
              <li style={{marginBottom:12}}><b>YouTube</b> · 방송 메뉴에서 YouTube 송출 설정을 확인합니다. 처음 사용하는 경우 서버 주소와 스트림 키를 설정하고, 저장되어 있다면 그대로 사용할 수 있습니다.</li>
              <li style={{marginBottom:12}}><b>방송 · 녹화</b> · 카메라와 오디오가 정상인지 다시 확인한 뒤 방송 시작을 누릅니다. 영상 저장이 필요하면 녹화 시작을 함께 사용합니다.</li>
              <li><b>종료</b> · 예배가 끝나면 방송 종료를 먼저 누르고, 녹화 중이면 녹화 정지와 저장 완료를 확인한 뒤 ChurchStudio를 종료합니다.</li>
            </ol>
            <div className="notice" style={{marginTop:18}}>
              <b>중요</b>
              <p className="muted" style={{marginBottom:0}}>방송 중에는 오디오 장치를 바꾸지 않는 것이 안전합니다. 먼저 카메라와 소리를 확인한 뒤 방송을 시작해 주세요.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="download">
        <div className="wrap">
          <h2>다운로드</h2>
          <div className="card">
            <b>{latest?`${latest.version} · ${latest.title}`:'최신 버전 준비 중'}</b>
            <p className="muted">{latest?.summary||'배포 가능한 ChurchStudio가 확정되면 공식 다운로드가 활성화됩니다.'}</p>
            {latest?.file_name&&<p className="muted">{latest.file_name}{latest.file_size_text?` · ${latest.file_size_text}`:''}</p>}
            {latest?.download_url&&<a className="btn" href={latest.download_url}>ChurchStudio 다운로드</a>}
          </div>

          <div className="card" style={{marginTop:16}}>
            <b>ChurchStudio 휴대폰 카메라 · Android 앱</b>
            <p className="muted">Android 휴대폰 카메라를 USB로 ChurchStudio에 연결해서 예배 방송 카메라로 사용하는 전용 앱입니다.</p>
            <p className="muted">ChurchStudioPhoneCamera-V3_8_7-debug.apk · Android 테스트 설치본</p>
            <a className="btn" href={PHONE_CAMERA_APK_URL}>휴대폰 카메라 APK 다운로드</a>
          </div>

          <div className="card" style={{marginTop:16}}>
            <b>ChurchStudio 휴대폰 카메라 · iPhone 앱</b>
            <p className="muted">iPhone 카메라를 USB로 ChurchStudio에 연결해서 예배 방송 카메라로 사용하는 전용 앱의 전체 소스입니다.</p>
            <p className="muted">Mac에서 Xcode로 열어 빌드할 수 있는 전체 파일 · ZIP</p>
            <a className="btn" href={IPHONE_CAMERA_SOURCE_URL}>iPhone 앱 전체 파일 다운로드</a>
          </div>

          <div className="card" style={{marginTop:16}}>
            <b>예배 리더 · Android 설치본</b>
            <p className="muted">갤럭시탭과 Android 기기에 설치해서 사용하는 독립 예배 리더입니다. HWP, HWPX, DOCX, PPT, PPTX, PDF, TXT를 지원하며 파일은 서버에 올리지 않고 기기 안에서 처리합니다.</p>
            <p className="muted">WorshipReader-Android.apk · 약 4.6 MB · Android 테스트 설치본</p>
            <a className="btn" href={READER_APK_URL}>예배 리더 APK 다운로드</a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>후원 및 이용 안내</h2>
          <div className="card">
            <b>3~6개월 후원 방식으로 시범 운영합니다.</b>
            <p className="muted">운영 상황과 사용자 수, 개발 및 유지 비용에 따라 향후 유료 서비스로 전환될 수 있습니다.</p>
            <p className="muted">유료화가 이루어지더라도 이미 정상적으로 사용 중인 ChurchStudio는 계속 사용할 수 있도록 운영할 예정입니다.</p>
          </div>
          <div className="notice">
            <b>무단 복제·재배포 금지</b>
            <p className="muted">설치파일과 라이선스의 무단 복제, 재배포, 판매 및 제3자 제공은 허용하지 않습니다. 다른 교회에서 사용을 원하는 경우 파일을 직접 전달하지 말고 공식 ChurchStudio 배포 페이지를 안내해 주세요.</p>
          </div>
          <p style={{marginTop:32,fontSize:12,opacity:.45}}><a href="/admin">관리자</a></p>
        </div>
      </section>
    </main>
  );
}
