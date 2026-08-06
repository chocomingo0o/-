import json, glob, os, re, collections

D = "/tmp/claude-0/-home-user--/dbb2d001-af23-5f7b-950b-82e2c5cc5bf4/scratchpad/audit/census400"
EXCLUDE = {
 ("SEL-B","고척고등학교"),
 ("SEL-C","삼각산고등학교"),("SEL-C","누원고등학교"),("SEL-C","중화고등학교"),("SEL-C","광남고등학교"),
 ("GG-G","병점고등학교"),
 ("GB-B","포항이동고등학교"),("GB-B","상주고등학교"),("GB-B","죽변고등학교"),
 ("CN-A","웅천고등학교"),
 ("GG-D","구성고등학교"),("GG-D","포곡고등학교"),("GG-D","처인고등학교"),("GG-D","효양고등학교"),
 ("GG-D","안법고등학교"),("GG-D","안성고등학교"),
 ("GG-F","진접고등학교"),
}
KW = ["학점표","단위표","174","192","180","204"]

total=0; err=0; mentioned=0; excluded=0
missing = []
for path in sorted(glob.glob(os.path.join(D,"*.jsonl"))):
    task = os.path.basename(path)[:-6]
    for ln, line in enumerate(open(path, encoding="utf-8"),1):
        line=line.strip()
        if not line: continue
        try: r=json.loads(line)
        except Exception as e:
            print("PARSE FAIL", path, ln, e); continue
        total+=1
        if "error" in r and "school" not in r:
            err+=1; continue
        school = r.get("school","")
        bigo = r.get("비고","") or ""
        if any(k in bigo for k in KW):
            mentioned+=1; continue
        if (task, school) in EXCLUDE:
            excluded+=1; continue
        missing.append({"task":task,"school":school,"sido":r.get("sido"),"sgg":r.get("sgg"),"bigo":bigo})

print("total records:", total, "error rows:", err, "mention table:", mentioned, "excluded:", excluded, "MISSING:", len(missing))
c = collections.Counter(m["task"] for m in missing)
print(sorted(c.items()))
json.dump(missing, open("/tmp/claude-0/-home-user--/dbb2d001-af23-5f7b-950b-82e2c5cc5bf4/scratchpad/missing.json","w"), ensure_ascii=False, indent=1)
