import json, glob, os, collections
D="/tmp/claude-0/-home-user--/dbb2d001-af23-5f7b-950b-82e2c5cc5bf4/scratchpad/audit/census400"
KW=["학점표","단위표","174","192","180","204"]
hit=collections.Counter(); empt=0; rows=[]
for path in sorted(glob.glob(os.path.join(D,"*.jsonl"))):
    for line in open(path,encoding="utf-8"):
        line=line.strip()
        if not line: continue
        r=json.loads(line)
        if "school" not in r: continue
        b=r.get("비고","") or ""
        ks=[k for k in KW if k in b]
        if ks: hit[tuple(ks)]+=1
        else:
            if b.strip()=="" : empt+=1
            rows.append(b)
print("keyword-combo counts:"); 
for k,v in hit.most_common(): print("  ",k,v)
print("no-mention total:",len(rows),"of which empty 비고:",empt)
print("--- sample non-empty no-mention 비고 ---")
seen=0
for b in rows:
    if b.strip():
        print("  *",b[:160]); seen+=1
    if seen>=25: break
