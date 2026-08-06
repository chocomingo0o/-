#!/usr/bin/env python3
"""census400 수집분 + 기존 45개교를 유형별로 집계한다.

중복 처리
  - 한 학교가 일반고 과제와 특수유형 과제에 모두 잡힌 경우 특수유형을 남긴다
    (지역 스윕에서 자사고·자공고가 딸려 들어온 것이므로).
  - 기존 45개교와 신규가 겹치면 신규를 남긴다 (코호트 규칙 정정 이후 수집분).

year_used가 2024가 아닌 레코드는 통계에서 빼고 따로 센다.
2024 입학생 표가 이미지뿐이라 다른 코호트로 대체한 건들이라 섞으면 기준이 흐려진다.
"""
import json
import glob
import os
import statistics
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIT = os.path.join(HERE, '..', 'audit')
CENSUS = os.path.join(AUDIT, 'census400')

FIELDS = [
    '공통_국어', '공통_수학', '공통_영어',
    '한국사_학기당', '통합사회_학기당', '통합과학_학기당', '과탐실_학기당',
    'y2_국어단위', 'y2_수학단위', 'y2_영어단위',
    'y2_탐구_과목수', 'y2_탐구_학기당단위',
    'y3_국어단위', 'y3_수학단위', 'y3_영어단위',
    'y3_선택_과목수', 'y3_선택_학기당단위',
]

# 지역 스윕에 딸려 들어온 특수유형 학교보다 우선순위가 낮은 유형
GENERAL = '일반고'


def load_new():
    out = []
    for path in sorted(glob.glob(os.path.join(CENSUS, '*.jsonl'))):
        task = os.path.basename(path)[:-6]
        for line in open(path):
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            if d.get('error') or not d.get('school'):
                continue
            d['_task'], d['_src'] = task, 'census400'
            out.append(d)
    return out


def load_old():
    out = []
    for path in sorted(glob.glob(os.path.join(AUDIT, 'curriculum_survey_*.json'))):
        if 'agg45' in path:
            continue
        for d in json.load(open(path)):
            d.setdefault('유형', GENERAL)
            d['_task'], d['_src'] = os.path.basename(path)[:-5], 'survey45'
            out.append(d)
    return out


def dedupe(records):
    """학교당 1건만 남긴다. 특수유형 > 일반고, 신규 > 기존45.

    키에 시도를 넣는다. 광남고(서울 광진구 / 경기 광주시), 광명고(경기 광명시 /
    부산 남구)처럼 이름만 같은 다른 학교가 있어 학교명만으로 묶으면 멀쩡한
    레코드가 사라진다.
    """
    best, dropped = {}, []
    for d in records:
        key = (d['school'], d.get('sido'))
        cur = best.get(key)
        if cur is None:
            best[key] = d
            continue
        # 특수유형이 일반고를 이긴다
        if cur['유형'] == GENERAL and d['유형'] != GENERAL:
            dropped.append((cur, d)); best[key] = d
        elif cur['유형'] != GENERAL and d['유형'] == GENERAL:
            dropped.append((d, cur))
        # 같은 유형이면 신규가 기존45를 이긴다
        elif cur['_src'] == 'survey45' and d['_src'] == 'census400':
            dropped.append((cur, d)); best[key] = d
        else:
            dropped.append((d, cur))
    return list(best.values()), dropped


def quartiles(vals):
    vals = sorted(vals)
    if not vals:
        return None
    if len(vals) == 1:
        return {'med': vals[0], 'q1': vals[0], 'q3': vals[0], 'n': 1}
    q = statistics.quantiles(vals, n=4, method='inclusive')
    return {'med': q[1], 'q1': q[0], 'q3': q[2], 'n': len(vals)}


def stats_for(records):
    out = {}
    for f in FIELDS:
        vals = [r[f] for r in records if r.get(f) is not None]
        s = quartiles(vals)
        if s:
            out[f] = s
    return out


def summarize(records, label):
    hk1 = sum(1 for r in records if str(r.get('한국사_학년', '')).startswith('1'))
    y3_free = sum(1 for r in records
                  if r.get('y3_국어단위') is None
                  and r.get('y3_수학단위') is None
                  and r.get('y3_영어단위') is None)
    career = sum(1 for r in records if r.get('y3_진로선택_있음'))
    sido = collections.Counter(r.get('sido') for r in records)
    return {
        'label': label,
        'n_schools': len(records),
        'sido_dist': dict(sido.most_common()),
        'hk_year1': f'{hk1}/{len(records)}',
        'y3_full_choice': f'{y3_free}/{len(records)}',
        'y3_career': f'{career}/{len(records)}',
        'stats': stats_for(records),
        'schools': sorted(r['school'] for r in records),
    }


def main():
    records = load_new() + load_old()
    kept, dropped = dedupe(records)

    off_cohort = [r for r in kept if r.get('year_used') != 2024]
    cohort2024 = [r for r in kept if r.get('year_used') == 2024]

    by_type = collections.defaultdict(list)
    for r in cohort2024:
        by_type[r['유형']].append(r)

    result = {
        'generated_for': '2024 입학생 편제 (2015 개정 / 고교학점제 부분도입)',
        'n_total_records': len(records),
        'n_after_dedupe': len(kept),
        'n_excluded_off_cohort': len(off_cohort),
        'excluded_off_cohort': [
            {'school': r['school'], '유형': r['유형'], 'year_used': r.get('year_used')}
            for r in sorted(off_cohort, key=lambda x: x['school'])
        ],
        'dedupe_dropped': [
            {'dropped': a['school'], 'dropped_as': f"{a['_task']}({a['유형']})",
             'kept_as': f"{b['_task']}({b['유형']})"}
            for a, b in sorted(dropped, key=lambda x: x[0]['school'])
        ],
        'by_type': {t: summarize(rs, t) for t, rs in sorted(by_type.items())},
    }

    out = os.path.join(CENSUS, 'aggregate.json')
    with open(out, 'w') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)

    print(f"레코드 {len(records)} → 중복제거 {len(kept)} → 2024코호트 {len(cohort2024)}")
    print(f"중복 제거 {len(dropped)}건, 코호트 제외 {len(off_cohort)}건\n")
    for t, s in sorted(result['by_type'].items(), key=lambda x: -x[1]['n_schools']):
        print(f"[{t}] {s['n_schools']}개교  한국사1학년 {s['hk_year1']}  "
              f"3학년국영수전면선택 {s['y3_full_choice']}")
    print(f"\n→ {out}")


if __name__ == '__main__':
    main()
