#!/usr/bin/env python3
# usage: repl.py <FILEID> <match_substring> <record_json_file>
import json, sys, io

fid, needle, recf = sys.argv[1], sys.argv[2], sys.argv[3]
rec = json.load(open(recf, encoding='utf-8'))
line = json.dumps(rec, ensure_ascii=False)

paths = [
    f"/tmp/claude-0/-home-user--/dbb2d001-af23-5f7b-950b-82e2c5cc5bf4/scratchpad/audit/census400/{fid}.jsonl",
    f"/home/user/-/audit/census400/{fid}.jsonl",
]
for p in paths:
    lines = open(p, encoding='utf-8').read().rstrip('\n').split('\n')
    hits = [i for i, L in enumerate(lines) if needle in L and '"error"' in L]
    if len(hits) != 1:
        print(f"ABORT {p}: {len(hits)} matches"); sys.exit(1)
    lines[hits[0]] = line
    open(p, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    # validate
    for i, L in enumerate(open(p, encoding='utf-8')):
        json.loads(L)
    print(f"OK {p} line {hits[0]+1}, total {len(lines)} lines")
