with open(r'd:\BRAVIUM-PRODUCCION\apps\web\app\(management)\proveedores\[id]\page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

count = 0
in_jsx = False
for i, line in enumerate(lines):
    line = line.strip()
    if 'return (' in line:
        if i > 350 and i < 360:
            in_jsx = True
            print(f"JSX START AT {i+1}")
    if in_jsx:
        # Simplistic tags count
        if '<div' in line:
            # count inner divs
            count += line.count('<div')
            print(f"{i+1}: DIV OPEN (+{line.count('<div')}) = {count}: {line}")
        if '</div>' in line:
            count -= line.count('</div>')
            print(f"{i+1}: DIV CLOSE (-{line.count('</div>')}) = {count}: {line}")
        if '</>' in line or ');' in line and count <= 0:
            if '</>' in line:
                print(f"{i+1}: FRAG CLOSE: {line}")
            # in_jsx = False

print(f"Final Count: {count}")
