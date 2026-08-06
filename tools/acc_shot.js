const {chromium}=require('playwright-core');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const p=await b.newPage({viewport:{width:1100,height:900},deviceScaleFactor:2});
  await p.goto('file:///home/claude/repo/project/2027_수시_내신환산_시뮬레이터_V16_디자인개선.html');
  await p.waitForTimeout(2500);
  await p.getByText('2027 컷 예측 보기').first().click(); await p.waitForTimeout(1200);
  const t=await p.$eval('.trust-overview',e=>e.textContent.replace(/\s+/g,' ').trim());
  console.log(t);
  await p.$eval('.trust-overview',e=>e.scrollIntoView());
  await p.waitForTimeout(400);
  await (await p.$('.trust-overview')).screenshot({path:'/tmp/claude-0/-home-claude/a7bef86f-04d8-53d9-ba3b-14c02cf01acf/scratchpad/audit/trust_banner.png'});
  await b.close();
})();
