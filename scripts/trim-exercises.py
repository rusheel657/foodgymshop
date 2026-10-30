# Regenerates src/data/exercises.json from free-exercise-db (Unlicense / public domain).
# Usage: curl -sL https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json | python3 scripts/trim-exercises.py
import json, sys

out = [
    {"id": e["id"], "name": e["name"], "muscle": e["primaryMuscles"][0], "equipment": e["equipment"] or "other",
     "image": e["images"][0] if e["images"] else None}
    for e in json.load(sys.stdin)
    if e["category"] != "stretching" and e["primaryMuscles"]
]
out.sort(key=lambda e: e["name"].lower())
json.dump(out, open("src/data/exercises.json", "w"), separators=(",", ":"), ensure_ascii=False)
print(len(out), "exercises")
