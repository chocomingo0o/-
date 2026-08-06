#!/usr/bin/env python3
"""학교알리미 「교과별(학년별) 학업성취 사항」 전수 파일 수집기.
사용: python3 census_ingest.py <파일1> [파일2 ...]   (CSV / XLSX / ZIP 지원)
출력: audit/schoolinfo_census.json + 요약 표
집계: ① 교과별 학기당 단위수 분포  ② 교과별 학기당 과목수  ③ 진로선택 성취도 A/B/C 전국 분포(수강자수 가중)
      ④ 수강자수 분포(소인수 13명 미만 비율)  ⑤ 원점수 표준편차 요약(σ 교차검증용)
"""
import sys,os,json,csv,io,re,zipfile,statistics,collections

def read_rows(path):
    if path.lower().endswith('.zip'):
        with zipfile.ZipFile(path) as z:
            for nm in z.namelist():
                if nm.lower().endswith(('.csv','.xlsx')):
                    data=z.read(nm)
                    yield from read_bytes(nm,data)
    else:
        yield from read_bytes(path,open(path,'rb').read())

def read_bytes(name,data):
    if name.lower().endswith('.xlsx'):
        try:
            import openpyxl
        except ImportError:
            os.system('pip install openpyxl -q'); import openpyxl
        wb=openpyxl.load_workbook(io.BytesIO(data),read_only=True,data_only=True)
        for ws in wb.worksheets:
            for row in ws.iter_rows(values_only=True):
                yield [('' if v is None else str(v)) for v in row]
    else:
        for enc in ('utf-8-sig','cp949','euc-kr','utf-8'):
            try:
                text=data.decode(enc); break
            except UnicodeDecodeError: continue
        yield from csv.reader(io.StringIO(text))

def norm(h): return re.sub(r'[\s()\[\]%·]','',str(h))

# 열 이름 퍼지 매칭
COLS={
 'school':['학교명'],'schoolcode':['학교코드','정보공시학교코드'],
 'level':['학교급','학교급코드'],'kind':['설립','학교유형','계열'],
 'year':['공시연도','연도'],'grade':['학년'],'term':['학기'],
 'subject':['교과','교과명','교과군'],'course':['과목','과목명'],
 'units':['단위수','학점수','학점','이수단위'],'takers':['수강자수','수강자'],
 'mean':['원점수평균','평균'],'sd':['원점수표준편차','표준편차'],
 'A':['성취도별분포비율A','성취도A','A'],'B':['성취도별분포비율B','성취도B','B'],
 'C':['성취도별분포비율C','성취도C','C'],'D':['성취도별분포비율D','성취도D','D'],
 'E':['성취도별분포비율E','성취도E','E'],
}
def map_header(hdr):
    nh=[norm(h) for h in hdr]; m={}
    for key,cands in COLS.items():
        for c in cands:
            nc=norm(c)
            for i,h in enumerate(nh):
                if h==nc or (len(nc)>2 and nc in h):
                    if key not in m: m[key]=i
    return m if ('course' in m and 'units' in m) else None

SUBJ_MAP={'국어':'국어','수학':'수학','영어':'영어','한국사':'한국사',
 '사회':'사회','사회(역사/도덕포함)':'사회','역사':'사회','도덕':'사회','과학':'과학'}
def canon_subject(s):
    s=norm(s)
    for k,v in SUBJ_MAP.items():
        if norm(k) in s or s in norm(k): return v
    return '기타'
def fnum(x):
    try:
        v=float(str(x).replace(',','').replace('%','').strip()); return v
    except (ValueError,TypeError): return None

def main(paths):
    units_dist=collections.defaultdict(list)          # subject -> [units...]
    per_term_courses=collections.defaultdict(collections.Counter)  # (school,grade,term,subject) count
    career_w={'A':0.0,'B':0.0,'C':0.0}; career_courses=0
    takers=[]; small=0; taker_n=0
    sds=[]
    n_rows=0; n_schools=set(); career_units=collections.defaultdict(list)
    for path in paths:
        hdr=None; hm=None
        for row in read_rows(path):
            if hm is None:
                hm=map_header(row)
                continue
            if len(row)<3: continue
            g=lambda k:(row[hm[k]] if k in hm and hm[k]<len(row) else '')
            lvl=str(g('level'))
            if lvl and ('고' not in lvl and lvl not in ('4','04','고등학교')): continue
            subj=canon_subject(g('subject')); course=str(g('course')).strip()
            u=fnum(g('units')); tk=fnum(g('takers')); sd=fnum(g('sd'))
            A,B,C,D,E=(fnum(g(k)) for k in 'ABCDE')
            if u is None: continue
            n_rows+=1; n_schools.add(g('school') or g('schoolcode'))
            gr=str(g('grade')).strip() or '?'; tm=str(g('term')).strip() or '?'
            # 진로선택 판별: 성취도 3단계(A/B/C만 있고 D/E 없음)
            is_career=(A is not None and B is not None and (D in (None,0) and E in (None,0)) and C is not None)
            if is_career and tk:
                for k,v in (('A',A),('B',B),('C',C)):
                    if v is not None: career_w[k]+=v*tk
                career_courses+=1
                career_units[subj].append(u)
            else:
                units_dist[subj].append(u)
                per_term_courses[(g('school'),gr,tm,subj)][course]+=1
            if tk is not None:
                takers.append(tk); taker_n+=1
                if tk<13: small+=1
            if sd is not None and sd>0: sds.append(sd)
    out={'files':[os.path.basename(p) for p in paths],'rows':n_rows,'schools':len(n_schools)}
    med=lambda a:round(statistics.median(a),2) if a else None
    out['units_by_subject']={s:{'median':med(v),'mean':round(sum(v)/len(v),2),'n':len(v)} for s,v in units_dist.items()}
    out['career_units_by_subject']={s:{'median':med(v),'n':len(v)} for s,v in career_units.items()}
    cnt_list=collections.defaultdict(list)
    for (sch,gr,tm,subj),c in per_term_courses.items(): cnt_list[subj].append(sum(c.values()))
    out['courses_per_term_by_subject']={s:{'median':med(v),'n':len(v)} for s,v in cnt_list.items()}
    tw=sum(career_w.values())
    out['career_achievement_ratios']={k:round(v/tw*100,1) for k,v in career_w.items()} if tw else None
    out['career_course_rows']=career_courses
    out['takers']={'median':med(takers),'under13_pct':round(small/taker_n*100,2) if taker_n else None,'n':taker_n}
    out['original_score_sd']={'median':med(sds),'n':len(sds)}
    os.makedirs('audit',exist_ok=True)
    json.dump(out,open('audit/schoolinfo_census.json','w'),ensure_ascii=False,indent=1)
    print(json.dumps(out,ensure_ascii=False,indent=1))

if __name__=='__main__':
    if len(sys.argv)<2: print(__doc__); sys.exit(1)
    main(sys.argv[1:])
