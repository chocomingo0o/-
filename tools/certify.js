const {chromium}=require('playwright-core');
const FILE='file:///home/claude/repo/project/2027_수시_내신환산_시뮬레이터_최종완성본_20260804.html';
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const p=await b.newPage({viewport:{width:1280,height:1000}});
  const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/ERR_CERT/.test(m.text()))errs.push(m.text());});
  await p.goto(FILE); await p.waitForTimeout(2600);
  const chk=await p.evaluate(()=>({
    unis:(typeof UNI_RULES!=='undefined')?UNI_RULES.length:0,
    libsusi:(typeof LIBSUSI_METHODS!=='undefined')?Object.keys(LIBSUSI_METHODS).length:0,
    scoreRule:typeof scoreRule==='function',
    predict:!!document.querySelector('#prediction-panel'),
  }));
  console.log('전역:',JSON.stringify(chk));
  // open prediction, banner, a counseling detail
  await p.getByText('2027 컷 예측 보기').first().click(); await p.waitForTimeout(1000);
  const banner=await p.evaluate(()=>{const s=document.querySelector('.trust-overview');return s?s.textContent.replace(/\s+/g,' ').match(/[\d,]+건 [\d.]+%/g):null;});
  console.log('배너:',banner);
  await p.selectOption('#pred-university',{label:'고려대학교(서울)'}); await p.waitForTimeout(800);
  await p.selectOption('#pred-status','').catch(()=>{}); await p.waitForTimeout(1000);
  await p.evaluate(()=>document.querySelector('[data-pred-id]')&&document.querySelector('[data-pred-id]').click());
  await p.waitForTimeout(1100);
  const detail=await p.evaluate(()=>({deriv:!!document.querySelector('.deriv-card'),assume:!!document.querySelector('.assume-card'),foot:!!document.querySelector('.cb-foot')}));
  console.log('상세 카드:',JSON.stringify(detail));
  // mobile overflow
  await p.setViewportSize({width:390,height:800}); await p.waitForTimeout(500);
  const ov=await p.evaluate(()=>({doc:document.documentElement.scrollWidth,win:window.innerWidth}));
  console.log('모바일 오버플로:',ov.doc<=ov.win?'없음':'있음',JSON.stringify(ov));
  console.log('콘솔 오류:',errs.length, errs.slice(0,3));
  await b.close();
})();
