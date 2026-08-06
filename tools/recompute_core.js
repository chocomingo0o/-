// Injected into page. Returns recompute function.
window.__RECOMP__ = function(opts){
  const N = opts.N || 200, SIGMA = opts.sigma || 0.8;
  const PD = JSON.parse(document.getElementById('prediction-data').textContent);
  const F = PD.fields, ix = {}; F.forEach((f,i)=>ix[f]=i);
  const nz = x=>String(x||"").replace(/\s/g,"").replace(/에리카/g,"ERICA").replace(/여자/g,"여").replace(/국립/g,"").replace(/\(.*?\)/g,"");
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function gauss(rnd){let u=0,v=0;while(u===0)u=rnd();while(v===0)v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
  const uniCache=new Map();
  // campus-aware normalizer: keeps the parenthetical campus tag so 고려대(서울) != 고려대(세종)
  const nzc=x=>String(x||"").replace(/\s/g,"").replace(/에리카/g,"ERICA").replace(/여자/g,"여").replace(/국립/g,"");
  function findUni(n){ if(uniCache.has(n))return uniCache.get(n);
    let i=UNI_RULES.findIndex(u=>nzc(u.university)===nzc(n));            // 1) exact incl. campus
    if(i<0){                                                             // 2) paren-stripped, only if unambiguous
      const hits=[]; for(let k=0;k<UNI_RULES.length;k++) if(nz(UNI_RULES[k].university)===nz(n)) hits.push(k);
      if(hits.length===1) i=hits[0];
      else if(hits.length>1){
        // ambiguous (multi-campus): require the campus tag to agree
        const tag=(String(n).match(/\(([^)]*)\)/)||[])[1]||'';
        if(tag){ const t=hits.find(k=>String(UNI_RULES[k].university).includes(tag)); if(t!==undefined)i=t; }
      }
    }
    if(i<0){                                                             // 3) substring, campus-tag aware
      const tag=(String(n).match(/\(([^)]*)\)/)||[])[1]||'';
      const cands=[];
      for(let k=0;k<UNI_RULES.length;k++){
        const a=nz(UNI_RULES[k].university), c=nz(n);
        if(a&&c&&(a.includes(c)||c.includes(a)))cands.push(k);
      }
      if(cands.length===1)i=cands[0];
      else if(cands.length>1){
        if(tag){const t=cands.find(k=>String(UNI_RULES[k].university).includes(tag)); i=(t!==undefined)?t:-1;}
        // no tag and ambiguous -> leave unmatched rather than guess a wrong campus
      }
    }
    uniCache.set(n,i); return i; }
  // ===== 합성 성적표 틀: 일반계고 표준 편성(2015 개정, 2024년 입학생 = 2027학년도 지원 세대) =====
  // 규정 근거: 공통과목 8단위(학기당 4) — 국어·수학·영어·통합사회·통합과학, 한국사 6단위(1학년 3+3),
  //   선택과목 기본 5단위·3단위 내 증감(학기 편성 관행 3~4단위), 진로선택 3과목 이상 이수(석차등급 없음, 성취도 A/B/C).
  // 계열 중립 근사: 2~3학년 사회·과학 각 학기 1과목(3단위), 3-1 진로선택 3과목(국어·사회·과학 각 3단위).
  // 과학탐구실험(3단계 성취도, 대부분 대학 미반영)은 제외.
  // [year, term, subject, courseName, credits, isCareer]
  // 실측 보정(2026-08-05): 전국 45개교 편제표 표본조사 중앙값 반영(15개 시도) —
  // 통합사회·통합과학 학기당 3단위(감축 운영이 대세), 2학년 탐구 학기당 3과목(사·과 연간 균형),
  // 3학년 국영수 3단위. 표본: 동탄·개포·분당·충남·천안쌍용·전주·센텀·경북·창원중앙·원주고.
  const TEMPLATE=[
    [1,1,"국어","국어",4,0],[1,1,"수학","수학",4,0],[1,1,"영어","영어",4,0],[1,1,"한국사","한국사",3,0],[1,1,"사회","통합사회",3,0],[1,1,"과학","통합과학",3,0],
    [1,2,"국어","국어",4,0],[1,2,"수학","수학",4,0],[1,2,"영어","영어",4,0],[1,2,"한국사","한국사",3,0],[1,2,"사회","통합사회",3,0],[1,2,"과학","통합과학",3,0],
    [2,1,"국어","문학",4,0],[2,1,"수학","수학Ⅰ",4,0],[2,1,"영어","영어Ⅰ",4,0],[2,1,"사회","생활과 윤리",3,0],[2,1,"사회","한국지리",3,0],[2,1,"과학","생명과학Ⅰ",3,0],[2,1,"기타","기술·가정",3,0],
    [2,2,"국어","독서",4,0],[2,2,"수학","수학Ⅱ",4,0],[2,2,"영어","영어Ⅱ",4,0],[2,2,"사회","사회·문화",3,0],[2,2,"과학","지구과학Ⅰ",3,0],[2,2,"과학","화학Ⅰ",3,0],[2,2,"기타","기술·가정",3,0],
    [3,1,"국어","화법과 작문",4,0],[3,1,"수학","확률과 통계",3,0],[3,1,"영어","영어 독해와 작문",3,0],[3,1,"사회","세계지리",3,0],[3,1,"기타","제2외국어",3,0],
    [3,1,"국어","심화 국어",3,1],[3,1,"사회","사회문제 탐구",3,1],[3,1,"과학","생활과 과학",3,1],
  ];
  const CAREER_RATIOS={A:45,B:40,C:15};   // 진로선택 성취도별 학생비율(일반계고 전형적 분포 근사)
  function achOf(g){ return g<=4?"A":(g<=7?"B":"C"); }   // 석차등급→성취도 근사(누적 40%/89% 경계)
  // 기타 교과(기술·가정/제2외국어/한문/교양)를 반영하는 전형이 있어, 합성 성적표에도 포함해야
  // picks/top 그룹의 '기타' 슬롯이 비지 않는다. collectSubjects는 6개 핵심교과만 돌려주므로 보강한다.
  const CORE6=["국어","수학","영어","사회","과학","한국사"];
  function needsEtc(v){
    try{ return JSON.stringify([v.subjects,v.selection,v.subject_weights]).includes("기타"); }catch(e){ return false; }
  }
  function subsOf(v){
    let base;
    try{ base=collectSubjects(v)||CORE6.slice(); }catch(e){ base=CORE6.slice(); }
    if(needsEtc(v)&&!base.includes("기타")) base=base.concat(["기타"]);
    return base;
  }
  function periodOf(v){ const per=v.period; let ly=3,lt=1; if(per&&typeof per==='object'){ly=per.lastYear||3;lt=per.lastTerm||1;} return [ly,lt]; }
  // 컷 재계산(공개값 앵커) 파이프라인은 검증된 최소 틀(legacy)을 기본으로 쓴다.
  // 실측 A/B: 상담용 1% 이내 재현율 legacy 99.2% > 단위현실화 96.5% > 진로선택 포함 93.3%.
  // 공개 (등급,환산점) 쌍은 대학이 진로선택·이수단위까지 반영해 산출한 값이라, 등급을 앵커로
  // 쓰는 재계산에 이를 다시 넣으면 이중반영이 된다. 현실 편성 틀(realistic)은 앵커가 없는
  // 임의 성적 시나리오 전용.
  const LEGACY_TEMPLATE=(function(){
    const rows=[]; const SUBS=["국어","수학","영어","사회","과학","한국사","기타"];
    for(let y=1;y<=3;y++)for(let t=1;t<=2;t++){
      for(const s of SUBS) rows.push([y,t,s,s,s==="한국사"?2:(s==="사회"||s==="과학"?3:4),0]);
    }
    return rows;
  })();
  const TPL = opts.template==='realistic'
    ? (opts.noCareer ? TEMPLATE.filter(r=>!r[5]) : TEMPLATE)
    : LEGACY_TEMPLATE;
  function rowsFor(subjects,ly,lt){
    return TPL.filter(r=>!(r[0]>ly||(r[0]===ly&&r[1]>lt))&&subjects.includes(r[2]));
  }
  function mkCourses(subjects,grades,careerAch,ly,lt){
    const c=[]; let k=0,j=0;
    for(const row of rowsFor(subjects,ly,lt)){
      const y=row[0],t=row[1],subj=row[2],course=row[3],cr=row[4],car=row[5];
      if(car){
        c.push({sheet:"예",row:1,year:y,term:t,subject:subj,course:course,credits:cr,
          grade:null,originalScore:null,subjectMean:null,subjectStdev:null,
          achievement:(careerAch&&careerAch[j++])||"B",achievementRatios:{A:CAREER_RATIOS.A,B:CAREER_RATIOS.B,C:CAREER_RATIOS.C},career:true});
      }else{
        c.push({sheet:"예",row:1,year:y,term:t,subject:subj,course:course,credits:cr,
          grade:grades[k++],originalScore:null,subjectMean:null,subjectStdev:null,
          achievement:null,achievementRatios:null,career:false});
      }
    }
    return c; }
  function slotCount(subjects,ly,lt){
    let ng=0,nc=0;
    for(const r of rowsFor(subjects,ly,lt)){ if(r[5])nc++; else ng++; }
    return {ng:ng,nc:nc}; }
  // deterministic: seed derived from cut grade + variant + uni index
  // grade-dependent sigma: scale by feasible SD bound sqrt((G-1)(9-G)) (Bhatia-Davis),
  // normalized so a mid-range anchor (~4.7, the measured student mean) keeps the measured SIGMA.
  const KSIG=SIGMA/Math.sqrt((4.7-1)*(9-4.7));
  function sigmaFor(G){const feas=Math.sqrt(Math.max(0,(G-1)*(9-G)));return Math.min(SIGMA,KSIG*feas);}
  // generate one integer-grade transcript centered at `centerG`, with exact batch mean = round(centerG*n)
  function genGrades(centerG,n,sig,rnd){
    const raw=[]; let sum=0;
    for(let i=0;i<n;i++){const g=gauss(rnd)*sig; raw.push(g); sum+=g;}
    const mean=sum/n;
    const grades=raw.map(x=>{let vv=centerG+(x-mean); if(vv<1)vv=1; if(vv>9)vv=9; const f=Math.floor(vv); return (rnd()<(vv-f))?Math.min(9,f+1):Math.max(1,f);});
    const target=Math.round(centerG*n); let cur=grades.reduce((a,b)=>a+b,0), guard=0;
    while(cur!==target && guard++<n*3){ const i=(rnd()*n)|0; if(cur<target&&grades[i]<9){grades[i]++;cur++;} else if(cur>target&&grades[i]>1){grades[i]--;cur--;} }
    return grades;
  }
  // 진로선택 성취도: 같은 중심등급에서 과목별 등급을 뽑아 성취도로 변환
  function genCareerAch(centerG,n,sig,rnd){
    const out=[];
    for(let i=0;i<n;i++){
      let g=Math.round(centerG+gauss(rnd)*sig); if(g<1)g=1; if(g>9)g=9;
      out.push(achOf(g));
    }
    return out;
  }
  function distFor(ui,vi,G,seedKey){
    const u=UNI_RULES[ui], v=variantsOf(u)[vi];
    const subs=subsOf(v), plt=periodOf(v), ly=plt[0], lt=plt[1];
    const sl=slotCount(subs,ly,lt), ng=sl.ng, nc=sl.nc;
    const sig=sigmaFor(G);
    // The published cut GRADE is the REFLECTED (post-selection) average the university publishes.
    // If the 2027 formula selects a subset (top-N), feeding G as the raw pool mean and then selecting
    // double-counts the selection benefit (predicted cut inflated). Calibrate the pool center `poolG`
    // so the post-selection reflected mean (rr.avgGrade) equals the anchor G. No-op for 'all'-mode formulas.
    let poolG=G;
    { const crnd=mulberry32((seedKey^0x9e3779b9)>>>0);
      for(let iter=0; iter<4; iter++){
        let sr=0,sc=0;
        for(let s=0;s<28;s++){
          let rr; try{ rr=scoreRule(mkCourses(subs,genGrades(poolG,ng,sig,crnd),genCareerAch(poolG,nc,sig,crnd),ly,lt),u,vi); }catch(e){ continue; }
          const rm=rr&&Number.isFinite(Number(rr.avgGrade))?Number(rr.avgGrade):null;
          if(rm!=null){ sr+=rm; sc++; }
        }
        if(!sc){ break; }
        const refl=sr/sc;
        if(Math.abs(refl-G)<0.03) break;         // reflected≈anchor (or 'all'-mode: converges immediately)
        let np=poolG+(G-refl); if(np<1)np=1; if(np>9)np=9;
        if(Math.abs(np-poolG)<0.005){ poolG=np; break; }
        poolG=np;
      }
    }
    const rnd=mulberry32(seedKey);
    const scores=[];
    for(let s=0;s<N;s++){
      let rr; try{ rr=scoreRule(mkCourses(subs,genGrades(poolG,ng,sig,rnd),genCareerAch(poolG,nc,sig,rnd),ly,lt),u,vi); }catch(e){ continue; }
      if(rr&&rr.score!=null&&Number.isFinite(Number(rr.score))) scores.push(Number(rr.score));
    }
    if(!scores.length) return null;
    scores.sort((a,b)=>a-b);
    // nearest-rank quantile: never interpolate between achievable scores.
    // (band_table/step formulas can only produce discrete values; an interpolated
    //  median like 35 when only 30/40 exist is not a score any student can get.)
    const q=p=>{ const i=Math.min(scores.length-1, Math.max(0, Math.round((scores.length-1)*p)));
      return scores[i]; };
    return {p10:q(0.10), median:q(0.50), p90:q(0.90), n:scores.length};
  }
  function detScore(ui,vi,G){
    const u=UNI_RULES[ui], v=variantsOf(u)[vi];
    const subs=subsOf(v), plt=periodOf(v), ly=plt[0], lt=plt[1];
    const gl=Math.max(1,Math.floor(G)), gh=Math.min(9,Math.ceil(G)); let flip=0;
    const sl=slotCount(subs,ly,lt), ng=sl.ng, nc=sl.nc;
    const grades=[];
    for(let i=0;i<ng;i++) grades.push(gl===gh?gl:(flip++%2===0?gl:gh));
    const ach=[]; for(let i=0;i<nc;i++) ach.push(achOf(Math.round(G)));
    try{ const rr=scoreRule(mkCourses(subs,grades,ach,ly,lt),u,vi); return rr&&Number.isFinite(Number(rr.score))?Number(rr.score):NaN; }catch(e){ return NaN; }
  }
  return {PD,F,ix,findUni,distFor,detScore,variantsOf,UNI_RULES,mulberry32,TEMPLATE};
};
