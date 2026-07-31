import re

with open('scripts/maps-tile.js', 'r') as f:
    lines = f.readlines()

blocks = []
current_block = None
for i, line in enumerate(lines):
    if re.match(r'^(function|const|let|var|class)\s+[a-zA-Z0-9_]+', line):
        blocks.append({'line': i + 1, 'name': line.strip()})

print(f"Total blocks: {len(blocks)}")
for b in blocks[:50]:
    print(f"Line {b['line']}: {b['name'][:50]}")
