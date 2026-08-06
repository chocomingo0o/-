import json, sys, io
BASE="/tmp/claude-0/-home-user--/dbb2d001-af23-5f7b-950b-82e2c5cc5bf4/scratchpad/audit/census400/"

def update(fname, school, patch):
    p = BASE + fname
    lines = open(p, encoding='utf-8').read().splitlines()
    n = len(lines)
    out = []
    hit = 0
    for l in lines:
        if not l.strip():
            out.append(l); continue
        d = json.loads(l)
        if d.get('school') == school:
            d.update(patch)
            out.append(json.dumps(d, ensure_ascii=False))
            hit += 1
        else:
            out.append(l)
    assert hit == 1, f"{school}: matched {hit}"
    assert len(out) == n, "line count changed"
    open(p, 'w', encoding='utf-8').write("\n".join(out) + "\n")
    print(f"OK {fname} {school} (lines={n})")
