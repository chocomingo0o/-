const {chromium}=require('playwright-core');const fs=require('fs');
const FILE='file:///home/claude/repo/project/2027_수시_내신환산_시뮬레이터_V16_디자인개선.html';
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const p=await b.newPage(); p.setDefaultTimeout(0);
  await p.goto(FILE); await p.waitForTimeout(2500);
  await p.addScriptTag({content:fs.readFileSync('/tmp/claude-0/-home-claude/a7bef86f-04d8-53d9-ba3b-14c02cf01acf/scratchpad/recompute_core.js','utf8')});
  const out=await p.evaluate(()=>{
    const R=window.__RECOMP__({N:150,sigma:0.9786});
    const {PD,ix,findUni,distFor,variantsOf,UNI_RULES}=R;
    const g=(r,n)=>{const i=ix[n];return i==null?null:r[i];};
    const num=v=>typeof v==='number';
    const byStatus={}; const all=[];
    for(const row of PD.rows){
      if(g(row,'recompute_status')!=='2027 산식 재계산') continue;
      if(g(row,'recompute_scale_match')===false) continue;
      const uni=g(row,'university_2027'); const ui=findUni(uni); if(ui<0) continue;
      const tr=g(row,'recompute_track'); const vs=variantsOf(UNI_RULES[ui]);
      const vi=vs.findIndex(v=>v.name===tr); if(vi<0) continue;
      const T=g(row,'recompute_total'); const st=g(row,'usage_status');
      for(const c of ['c50','c70']){
        const pub=g(row,c+'_score_2026'), gr=g(row,c+'_grade_2026');
        if(!num(pub)||!num(gr)||!num(T)||!T) continue;
        const d=distFor(ui,vi,gr,(ui*131+vi*17+Math.round(gr*100))>>>0);
        if(!d||!Number.isFinite(d.median)) continue;
        const dev=Math.abs(d.median-pub)/T*100;
        all.push(dev); (byStatus[st]=byStatus[st]||[]).push(dev);
      }
    }
    const stat=a=>{a=a.slice().sort((x,y)=>x-y);return {n:a.length,med:+a[Math.floor(a.length/2)].toFixed(4),
      mean:+(a.reduce((s,v)=>s+v,0)/a.length).toFixed(4),p95:+a[Math.floor(a.length*0.95)].toFixed(3),
      within1:+(a.filter(x=>x<=1).length/a.length*100).toFixed(1)};};
    const res={ALL:stat(all)};
    for(const k in byStatus) res[k]=stat(byStatus[k]);
    return res;
  });
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();
