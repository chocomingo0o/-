import json,re,collections
HP='/home/claude/repo/project/2027_수시_내신환산_시뮬레이터_V16_디자인개선.html'
html=open(HP,encoding='utf-8').read()
m=re.search(r'(<script[^>]*id="prediction-data"[^>]*>)(.*?)(</script>)', html, re.S)
PD=json.loads(m.group(2).strip())
F=PD['fields']; ix={f:i for i,f in enumerate(F)}
if 'verification' not in ix: F.append('verification'); ix['verification']=len(F)-1
num=lambda v: isinstance(v,(int,float))
def g(row,name):
    i=ix.get(name); return row[i] if (i is not None and i<len(row)) else None

# 1) clear unfounded 2027 cells (no 2026 anchor at all in that cut)
cleared=0
for row in PD['rows']:
    while len(row)<len(F): row.append(None)
    for cut in ('c50','c70'):
        if num(g(row,f'{cut}_grade_2026')) or num(g(row,f'{cut}_score_2026')): continue
        for f in (f'{cut}_score_2027_p10',f'{cut}_score_2027_median',f'{cut}_score_2027_p90'):
            if num(g(row,f)): row[ix[f]]=None; cleared+=1

# 2) refit scale maps (uni|track where 2027 scale != 2026 scale) from recomputed rows
groups=collections.defaultdict(list); need=set()
for row in PD['rows']:
    if g(row,'recompute_status')!='2027 산식 재계산': continue
    key=(g(row,'university_2027') or '', g(row,'recompute_track') or '')
    if g(row,'recompute_scale_match') is False: need.add(key)
    for cut in ('c50','c70'):
        s=g(row,f'{cut}_score_2026'); mm=g(row,f'{cut}_score_2027_median'); gr=g(row,f'{cut}_grade_2026')
        if num(s) and num(mm) and num(gr): groups[key].append((mm,s))
def fit(pts):
    n=len(pts)
    if n<3: return None
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    mx=sum(xs)/n; my=sum(ys)/n
    sxx=sum((a-mx)**2 for a in xs); syy=sum((b-my)**2 for b in ys)
    if sxx==0 or syy==0: return None
    sxy=sum((a-mx)*(b-my) for a,b in zip(xs,ys))
    a=sxy/sxx; b=my-a*mx; r2=sxy*sxy/(sxx*syy)
    return dict(a=round(a,6),b=round(b,6),r2=round(r2,6),n=n,maxErr=round(max(abs(y-(a*x+b)) for x,y in zip(xs,ys)),3))
maps={}
for key in sorted(need,key=str):
    f=fit(groups.get(key,[])); u,t=key
    if f and f['r2']>=0.97 and f['maxErr']<=2.0:
        f['src']='fit'; maps[f'{u}|{t}']=f
    else:
        donor=None
        for k2 in need:
            if k2[1]==t and k2[0]!=u:
                d=fit(groups.get(k2,[]))
                if d and d['r2']>=0.97: donor=d; break
        pts=groups.get(key,[])
        if donor and pts and max(abs(donor['a']*x+donor['b']-y) for x,y in pts)<=1.0:
            donor=dict(donor); donor['src']='borrow'; maps[f'{u}|{t}']=donor
PD['scaleMaps']=maps

# 2b) detect composite-formula tracks whose encoded grade_formula omits additive components
#     (진로선택·출결·서류·성취비율): 1등급 최고점이 만점에 크게 못 미쳐 예측이 실제보다 낮게 나옴
composite=set()
try:
    SP=json.load(open('audit/official-specs.json'))
    for uni,spec in SP.items():
        for t in spec.get('tracks',[]):
            sc=t.get('scoring') or {}
            if sc.get('mode')!='grade_formula': continue
            a,b=sc.get('a'),sc.get('b'); tot=t.get('total') or sc.get('total')
            if all(isinstance(x,(int,float)) for x in (a,b,tot)) and (a+b*1) < tot*0.97:
                composite.add(f"{uni}|{t.get('name')}")
except Exception as e:
    print('composite scan skipped:',e)
print('합산성분 누락 의심 트랙:',len(composite))

# 공식 계산기(DLL)는 2026·2027 산식이 같다는데 우리 계산만 크게 다른 전형 = 우리 스펙 오류 의심
try:
    _ss=json.load(open('audit/spec_suspect.json'))
    SPEC_SUSPECT={f"{x['u']}|{x['t']}" for x in _ss}
except Exception:
    SPEC_SUSPECT=set()
print('스펙 오류 의심 전형:',len(SPEC_SUSPECT))

# 공식 계산기 기준 2026→2027 산식이 바뀐 대학: 2026 공개값과 대조할 수 없어 검증 수단이 없음
try:
    CHANGED_UNIS=set(json.load(open('audit/changed_unis.json')))
except Exception:
    CHANGED_UNIS=set()
def _nzu(x): return str(x or '').replace(' ','').replace('여자','여').replace('국립','')
CHANGED_NZ={_nzu(u) for u in CHANGED_UNIS}
print('산식 변경 대학(검증 불가):',len(CHANGED_NZ))

CAREER_MISS={'공주대학교'}   # DLL은 진로선택 가산을 명시하나 2027 스펙 미반영

# 반영교과 규칙이 2026→2027에 바뀐 전형(모집요강 근거·사용자 확인). 공식 계산기 단계 텍스트에는
# 반영교과 조합이 드러나지 않아 DLL 비교로는 못 잡는 사각지대 — 작년 컷과의 직접 비교가 약함.
RULE_CHANGE_2027={
 '동덕여자대학교|인문·자연 일반(4개 교과 반영)',
 '동덕여자대학교|예체능(3개 교과 반영)',
}
RULE_CHANGE_VER=('참고용 · 2027부터 반영교과가 계열 고정(인문 국영수사/자연 국영수과)에서 '
 '「국영수+사회/과학 중 유리한 교과」로 바뀜 — 작년 컷은 옛 기준의 값이라 직접 비교가 약하고, '
 '특히 자연계열은 과학이 약한 지원자가 새로 지원할 수 있어 실제 컷이 예측보다 높아질 수 있음(모집요강 확인)')

# 3) deterministic verification + usage_status
def qualitative(row):
    # no 2026 score anywhere but has a grade -> 정성/정량없음
    return (not num(g(row,'c50_score_2026')) and not num(g(row,'c70_score_2026')))
cnt=collections.Counter()
for row in PD['rows']:
    uni=g(row,'university_2027')
    has_med=num(g(row,'c50_score_2027_median')) or num(g(row,'c70_score_2027_median'))
    anchor=num(g(row,'c50_grade_2026')) or num(g(row,'c70_grade_2026')) or num(g(row,'c50_score_2026')) or num(g(row,'c70_score_2026'))
    rc=g(row,'recompute_status'); how=g(row,'recompute_how') or ''
    sm=g(row,'recompute_scale_match')
    tconf=g(row,'track_match_confidence') or ''
    cconf=g(row,'curve_confidence') or ''
    # counseling gate: exclude only genuinely low-confidence rows (medium is empirically as accurate as high)
    conf_ok=(tconf in ('high','medium') and cconf in ('high','medium'))
    both_high=(tconf=='high' and cconf=='high')
    key=f"{uni or ''}|{g(row,'recompute_track') or ''}"
    has_map=key in maps
    if not uni:
        st='unavailable'; ver='대학 정보 없음'
    elif not has_med:
        if not anchor: st='unavailable'; ver='2026 입결 정보 없음'
        elif qualitative(row): st='unavailable'; ver='정성평가 대학 · 정량 환산점 없음'
        else: st='review_required'; ver='미검증 · 2027 산식으로 점수 재현 불가(서류·정성평가 포함 전형)'
    elif rc!='2027 산식 재계산':
        st='review_required'; ver='미검증 · 이전 자료의 값(2027 산식 재현 불가)'
    elif (g(row,'matched_formula_track') and g(row,'recompute_track') and g(row,'matched_formula_track')!=g(row,'recompute_track')):
        # matcher and recompute engine disagree on which track — don't trust the track connection
        st='review_required'; ver='수동 검토 · 전형 연결이 엇갈려(자동 매칭≠계산 산식) 다른 학과 산식으로 계산됐을 수 있음(모집요강 확인)'
    elif _nzu(uni) in CHANGED_NZ:
        st='use_with_caveats'; ver='참고용 · 2027에 산식이 바뀐 대학이라 작년 공개값과 대조 검증이 불가능합니다(모집요강 확인 권장)'
    elif key in RULE_CHANGE_2027:
        st='use_with_caveats'; ver=RULE_CHANGE_VER
    elif key in SPEC_SUSPECT:
        st='review_required'; ver='수동 검토 · 공식 계산기는 2026·2027 산식이 같다는데 저희 계산값만 크게 달라, 저희 산식 해석 오류 가능성이 높습니다(모집요강 확인 필요)'
    elif uni in CAREER_MISS:
        st='use_with_caveats'; ver='재계산 · 공식 계산기 기준 진로선택 가산점이 있으나 2027 스펙에 미반영 — 실제보다 낮을 수 있음(모집요강 확인)'
    elif key in composite:
        st='use_with_caveats'; ver='재계산 · 2027 값은 교과 성적 부분만 계산 — 진로선택·출결·서류 등 가산 성분이 빠져 실제보다 낮을 수 있음(모집요강 확인)'
    else:
        # recomputed with a real 2027 score
        if 'scale-fix' in how:
            st='use_with_caveats'; ver='재계산 · 정확한 전형 산식을 못 찾아 대체 산식 사용(검토 권장)'
        elif how.startswith('track-exact') and (sm is not False or has_map):
            if conf_ok:
                st='counseling_ready_deep'
                connect='전형 정확 연결' if both_high else '전형 연결 양호(자동 매칭 기준)'
                ver=f'2027 산식 재계산 검증({connect})' if sm is not False else '2027 산식 재계산 검증(만점 기준 다름 → 작년 기준 환산 제공)'
            else:
                st='use_with_caveats'
                low='전형 연결' if tconf=='low' else '작년 컷 복원'
                ver=f'재계산 · {low} 신뢰도가 낮아(low) 참고용'
        elif how.startswith('track-exact'):
            st='use_with_caveats'; ver='재계산 · 만점 기준이 작년과 달라 직접 비교 주의'
        elif how in ('dept-match','track-fuzzy'):
            st='use_with_caveats'; ver='재계산 · 전형명 일부만 일치해 참고용'
        elif how in ('scale-anchor','default',''):
            st='review_required'; ver='수동 검토 · 전형명이 연결되지 않아 만점 척도로만 산식을 추정(모집요강 확인 필요)'
        else:
            st='use_with_caveats'; ver='재계산 · 참고용'
    row[ix['usage_status']]=st; row[ix['verification']]=ver; cnt[st]+=1

PD['statusCounts']=dict(cnt)
PD['recompute']['cleared_unfounded_cells']=cleared
PD['recompute']['scale_maps']=len(maps)
PD['recompute']['engine_fix']='전교과(전 과목 반영) 전형이 0점으로 계산되던 버그 수정 — 대상 전형 정상 재계산'
open(HP,'w',encoding='utf-8').write(html[:m.start()]+m.group(1)+json.dumps(PD,ensure_ascii=False,separators=(',',':'))+m.group(3)+html[m.end():])
print('cleared',cleared,'scaleMaps',len(maps))
print('statusCounts',dict(cnt))
print('formula2026 present:', 'formula2026' in PD, len(PD.get('formula2026',{})))
