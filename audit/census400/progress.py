#!/usr/bin/env python3
"""queue.json 대비 수집 진행률 집계."""
import json, os, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))
queue = json.load(open(os.path.join(HERE, 'queue.json')))

rows, done_tot, tgt_tot, err_tot = [], 0, 0, 0
for q in queue:
    qid, tgt = q['id'], q['target']
    path = os.path.join(HERE, qid + '.jsonl')
    ok = err = 0
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                err += 1
                continue
            if d.get('error') or not d.get('school'):
                err += 1
            else:
                ok += 1
    rows.append((qid, q['type'], ok, tgt, err))
    done_tot += ok
    tgt_tot += tgt
    err_tot += err

state = lambda ok, tgt: '완료' if ok >= tgt else ('진행' if ok else '대기')
for qid, typ, ok, tgt, err in rows:
    print(f"{qid:6} {typ:9} {ok:2}/{tgt:<2} {state(ok,tgt)}" + (f"  (실패 {err})" if err else ""))

print(f"\n신규 수집 {done_tot}/{tgt_tot}  (실패기록 {err_tot})")
print(f"기존 45개교 포함 총 {done_tot + 45}/{tgt_tot + 45}")
remaining = [r[0] for r in rows if r[2] < r[3]]
print(f"미완료 과제 {len(remaining)}개: {' '.join(remaining)}")
