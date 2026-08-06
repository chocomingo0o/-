import json,re,statistics
HP='/home/claude/repo/project/2027_수시_내신환산_시뮬레이터_V16_디자인개선.html'
html=open(HP,encoding='utf-8').read()
m=re.search(r'(<script[^>]*id="prediction-data"[^>]*>)(.*?)(</script>)', html, re.S)
PD=json.loads(m.group(2).strip())
F=PD['fields']; ix={f:i for i,f in enumerate(F)}
num=lambda v: isinstance(v,(int,float))
def g(row,n):
    i=ix.get(n); return row[i] if (i is not None and i<len(row)) else None

Q=json.load(open('audit/drift_quantiles.json'))
cells=Q['cells']; nat=Q['national']
SL=json.load(open('audit/slope2027.json')); slopes=SL['slopes']; FB=SL['fallback_ratio']
def band(gr): return 'A' if gr<=1.5 else 'B' if gr<=2.5 else 'C' if gr<=4 else 'D' if gr<=6 else 'E'

n=0; widths=[]; asym=0
for row in PD['rows']:
    key=f"{g(row,'university_2027')}|{g(row,'recompute_track') or ''}"
    sl=slopes.get(key); tot=g(row,'recompute_total')
    slope=abs(sl['slope']) if sl else (abs(tot)*FB if num(tot) and tot>0 else None)
    if slope is None: continue
    mk='M' if g(row,'region_metro') else 'L'
    for cut in ('c50','c70'):
        cp10,cp90=g(row,f'{cut}_comp_p10'),g(row,f'{cut}_comp_p90')
        med=g(row,f'{cut}_score_2027_median'); gr=g(row,f'{cut}_grade_2026')
        if not(num(cp10) and num(cp90) and num(med) and num(gr)): continue
        b=band(gr)
        q=cells.get(f'{b}|{mk}') or nat.get(b)
        if not q: continue
        comp_half=max(0.0,(cp90-cp10)/2)
        # grade drift: p90 = worst grade shift -> lowest score ; p10 = best -> highest score
        lo_half=(( slope*abs(q['p90']) )**2 + comp_half**2)**0.5
        hi_half=(( slope*abs(q['p10']) )**2 + comp_half**2)**0.5
        lo,hi=med-lo_half, med+hi_half
        if num(tot) and tot>0: lo=max(0.0,lo); hi=min(float(tot)*1.02,hi)   # 가산점 등으로 만점을 소폭 넘을 수 있음
        row[ix[f'{cut}_score_2027_p10']]=round(lo,3)
        row[ix[f'{cut}_score_2027_p90']]=round(hi,3)
        n+=1
        if abs(lo_half-hi_half)>1e-6: asym+=1
        if num(tot) and tot>0: widths.append((hi-lo)/tot*100)

PD['driftModel']['method']='등급대(A~E)×지역(수도권/지방)별 실측 P10/P90 분위수 (2023~2026 연도간 변화 19,765건)'
PD['driftModel']['quantiles']=Q
PD['driftModel']['mean_shift_applied']=False
PD['driftModel']['mean_shift_note']='등급대별 평균 이동 보정은 2026 홀드아웃 검정에서 개선폭이 +2.85%(0.01등급)에 그쳐, 평균회귀 착시 위험을 고려해 적용하지 않았습니다.'
PD['driftModel']['backtest_coverage']='등급대·지역별 구간의 과거 적중률 86.8%(σ방식) → 실측 분위수로 재보정'
print(f'구간 재계산 {n}칸 (비대칭 {asym})  폭 중앙 {statistics.median(widths):.2f}%')
open(HP,'w',encoding='utf-8').write(html[:m.start()]+m.group(1)+json.dumps(PD,ensure_ascii=False,separators=(',',':'))+m.group(3)+html[m.end():])
print('저장 완료')
