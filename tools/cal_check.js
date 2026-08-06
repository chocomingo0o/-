const {chromium}=require('playwright-core');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const p=await b.newPage({viewport:{width:1100,height:1000},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/claude/repo/project/2027_수시_내신환산_시뮬레이터_V16_디자인개선.html');
  await p.waitForTimeout(2500);
  await p.getByText('2027 컷 예측 보기').first().click(); await p.waitForTimeout(1000);
  await p.selectOption('#pred-university',{label:'고려대학교(서울)'}); await p.waitForTimeout(800);
  await p.evaluate(()=>document.querySelector('[data-pred-id]')&&document.querySelector('[data-pred-id]').click());
  await p.waitForTimeout(1200);
  // 접힌 '예측 원리와 불확실성' 열기
  const opened=await p.evaluate(()=>{
    const det=[...document.querySelectorAll('details')].find(d=>d.textContent.includes('예측 원리와 불확실성'));
    if(det){det.open=true;return true;} return false;
  });
  await p.waitForTimeout(400);
  const cal=await p.evaluate(()=>{
    const c=document.querySelector('.cal-card');
    return c?c.textContent.replace(/\s+/g,' ').slice(0,400):null;
  });
  console.log('fold 열림:',opened);
  console.log('cal-card:',cal);
  console.log('콘솔 오류:',errs.length,errs.slice(0,2));
  const el=await p.$('.cal-card');
  if(el) await el.screenshot({path:'/tmp/claude-0/-home-claude/a7bef86f-04d8-53d9-ba3b-14c02cf01acf/scratchpad/audit/cal_card.png'});
  await b.close();
})();
