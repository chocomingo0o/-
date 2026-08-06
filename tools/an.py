import sys,re
t=open(sys.argv[1],encoding='utf-8').read()
print('CHARS',len(t))
print('=== headings / cohort labels ===')
for m in re.finditer(r'^(#+ .*)$',t,re.M):
    if len(m.group(1))<160: print(' ',m.group(1))
print('=== cohort mentions ===')
for m in set(re.findall(r'20\d\d\s*(?:학년도|년도)?\s*(?:입학생|신입생)',t)): print('  ',m)
starts=[m.start() for m in re.finditer(r'<table>',t)]
print('=== tables:',len(starts),starts)
KEY=['한국사','통합사회','통합과학','과학탐구실험','이수단위','이수학점','총 이수','계']
for i,s in enumerate(starts):
    e=starts[i+1] if i+1<len(starts) else len(t)
    seg=t[s:e]
    rows=re.findall(r'<tr>.*?</tr>',seg,re.S)
    if len(rows)<6: continue
    hdr=re.sub(r'\|+','|',re.sub(r'<[^>]+>','|',''.join(rows[:2])))
    print(f'--- TABLE#{i} @{s} rows={len(rows)}')
    print('   HDR:',hdr[:320])
    for r in rows:
        x=re.sub(r'\|+','|',re.sub(r'<[^>]+>','|',r)).strip()
        if re.search(r'(한국사|통합사회|통합과학|과학탐구실험)\|',x) or re.search(r'(이수\s*(단위|학점)\s*(계|소계)|총\s*이수|학기별 총)',x):
            print('   ',x[:200])
