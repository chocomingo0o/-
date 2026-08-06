import json,re,collections,statistics
HP='/home/claude/repo/project/2027_수시_내신환산_시뮬레이터_V16_디자인개선.html'
html=open(HP,encoding='utf-8').read()
m=re.search(r'(<script[^>]*id="prediction-data"[^>]*>)(.*?)(</script>)', html, re.S)
PD=json.loads(m.group(2).strip())
F=PD['fields']; ix={f:i for i,f in enumerate(F)}
num=lambda v: isinstance(v,(int,float))
def g(row,n):
    i=ix.get(n); return row[i] if (i is not None and i<len(row)) else None

SL=json.load(open('audit/slope2027.json'))
slopes=SL['slopes']; FB=SL['fallback_ratio']
SIG=json.load(open('audit/sigma_band.json'))
def band(gr):
    return '1)≤1.5' if gr<=1.5 else '2)1.5-2.5' if gr<=2.5 else '3)2.5-4' if gr<=4 else '4)4-6' if gr<=6 else '5)>6'
Z=1.2816  # P10/P90

# keep composition-only interval for transparency
for f in ['c50_comp_p10','c50_comp_p90','c70_comp_p10','c70_comp_p90','drift_sigma_grade']:
    if f not in ix: F.append(f); ix[f]=len(F)-1

widened=0; skipped=0; widths=[]
for row in PD['rows']:
    while len(row)<len(F): row.append(None)
    key=f"{g(row,'university_2027')}|{g(row,'recompute_track') or ''}"
    sl=slopes.get(key)
    tot=g(row,'recompute_total')
    slope=abs(sl['slope']) if sl else (abs(tot)*FB if num(tot) and tot>0 else None)
    sg_used=None
    for cut in ('c50','c70'):
        p10,med,p90=g(row,f'{cut}_score_2027_p10'),g(row,f'{cut}_score_2027_median'),g(row,f'{cut}_score_2027_p90')
        gr=g(row,f'{cut}_grade_2026')
        if not(num(p10) and num(med) and num(p90)): continue
        # preserve composition-only
        row[ix[f'{cut}_comp_p10']]=p10; row[ix[f'{cut}_comp_p90']]=p90
        if slope is None or not num(gr):
            skipped+=1; continue
        sg=SIG.get(band(gr), 0.571); sg_used=sg
        comp_sd=max(0.0,(p90-p10)/(2*Z))          # composition sd implied by current interval
        drift_sd=slope*sg                          # score-space sd from year-over-year cut movement
        tot_sd=(comp_sd**2+drift_sd**2)**0.5
        lo=med-Z*tot_sd; hi=med+Z*tot_sd
        if num(tot) and tot>0:
            lo=max(0.0,lo); hi=min(float(tot),hi)
        row[ix[f'{cut}_score_2027_p10']]=round(lo,3)
        row[ix[f'{cut}_score_2027_p90']]=round(hi,3)
        widened+=1
        if num(tot) and tot>0: widths.append((hi-lo)/tot*100)
    if sg_used is not None: row[ix['drift_sigma_grade']]=sg_used

PD['driftModel']={
 'source':'2023~2026 공개 입결 52,184건에서 측정한 학과별 컷 등급의 연도간 변화',
 'sigma_by_band':SIG,
 'mean_drift_overall':-0.030,
 'note':'예측 구간 = √(성적표 구성 변동² + 컷등급 연도변동²). 컷 등급 중앙값은 연도간 평균 변화가 -0.03등급(≈0)이라 이동시키지 않았습니다.',
 'icc_university':0.175,
 'coverage_rows':widened,
}
PD['recompute']['interval_calibrated']=True
print(f'구간 재계산: {widened}칸 (기울기 없어 유지 {skipped})')
if widths: print(f'새 예측구간 폭(만점 대비): 중앙 {statistics.median(widths):.2f}%')
open(HP,'w',encoding='utf-8').write(html[:m.start()]+m.group(1)+json.dumps(PD,ensure_ascii=False,separators=(',',':'))+m.group(3)+html[m.end():])
print('저장 완료')
