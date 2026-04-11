with open(r'd:\BRAVIUM-PRODUCCION\apps\web\app\(management)\proveedores\[id]\page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

in_jsx = False
depth = 0
open_tags = []

for i, line in enumerate(lines):
    line = line.strip()
    if 'return (' in line:
        if i > 350 and i < 360:
            in_jsx = True
            print(f"JSX START AT {i+1}")
    if in_jsx:
        # split by tags
        import re
        tags = re.findall(r'</?[\w-]+|/>|</>', line)
        for tag in tags:
            if tag.startswith('</'):
                if open_tags:
                    open_tags.pop()
                    depth -= 1
                else:
                    print(f"UNBALANCED CLOSE {tag} AT {i+1}")
            elif tag.endswith('/>'):
                # self closing, depth stays
                pass
            else:
                open_tags.append(tag)
                depth += 1
                
        if '</>' in line:
            print(f"FRAG CLOSE AT {i+1}")
        
        if line == ');' and depth == 0:
            print(f"JSX END AT {i+1}")
            # in_jsx = False

print(f"Final open tags: {open_tags}")
print(f"Final Count: {depth}")
