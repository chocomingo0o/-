import json, sys, io, os

BASE = "/tmp/claude-0/-home-user--/dbb2d001-af23-5f7b-950b-82e2c5cc5bf4/scratchpad/audit/census400"

def replace(fname, school, newrec):
    path = os.path.join(BASE, fname)
    lines = open(path, encoding="utf-8").read().splitlines()
    n_before = len(lines)
    out = []
    hits = 0
    for l in lines:
        s = l.strip()
        if not s:
            out.append(l)
            continue
        d = json.loads(s)
        if d.get("school") == school:
            hits += 1
            out.append(json.dumps(newrec, ensure_ascii=False))
        else:
            out.append(l)
    assert hits == 1, f"{fname} {school}: matched {hits} lines"
    assert len(out) == n_before, "line count changed"
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    # verify
    ls = [x for x in open(path, encoding="utf-8").read().splitlines() if x.strip()]
    for x in ls:
        json.loads(x)
    print(f"OK {fname} {school}: {n_before} lines -> {len(open(path,encoding='utf-8').read().splitlines())} lines, all valid JSON")
