import os
import re

maps_tile_path = 'scripts/maps-tile.js'

with open(maps_tile_path, 'r') as f:
    lines = f.readlines()

# Helper to find function bounds
def get_func_bounds(func_name, lines):
    start = -1
    for i, line in enumerate(lines):
        if line.startswith(f"function {func_name}(") or line.startswith(f"async function {func_name}("):
            start = i
            break
    if start == -1:
        return -1, -1
    
    end = -1
    brace_count = 0
    in_func = False
    for i in range(start, len(lines)):
        line = lines[i]
        brace_count += line.count('{') - line.count('}')
        if not in_func and brace_count > 0:
            in_func = True
        if in_func and brace_count == 0:
            end = i
            break
    
    # Check for preceding jsdocs
    while start > 0 and lines[start-1].strip().startswith('*') or lines[start-1].strip().startswith('/*'):
        start -= 1
        if lines[start].strip().startswith('/*'):
            break
            
    return start, end

def extract_funcs(func_names, out_path, imports=""):
    extracted = []
    bounds_to_remove = []
    
    for fname in func_names:
        start, end = get_func_bounds(fname, lines)
        if start != -1:
            extracted.append("".join(lines[start:end+1]))
            bounds_to_remove.append((start, end))
            
    if not extracted:
        return bounds_to_remove
        
    with open(out_path, 'w') as f:
        f.write(imports + "\n\n")
        f.write("\n\n".join(extracted))
        
    return bounds_to_remove

# 1. header-view.js
header_funcs = ['updateHeaderLogo', 'adjustHeaderFontSize', 'balancedHeaderHTML', 'updateHeader', 'getFitPadding']
header_imports = """import { CIRCLE_ID } from '../config/app-config.js';

// Note: updateHeaderLogo depends on 'state' and 'normalizeZoneId'.
// For now, we will pass them or let them remain global, 
// but since we are using modules, we need to pass state as an argument or export it.
// Actually, it's safer to just export the functions and let the caller bind or pass state.
"""

header_bounds = extract_funcs(header_funcs, 'scripts/components/header-view.js', header_imports)

# 2. avenza-modal-view.js
avenza_funcs = ['getAppStoreUrl', 'launchAppWithStoreFallback', 'updateAvenzaModalHeaderTitle', 'getActiveSelectionThumbnail', 'openAppInstructionModal', 'openInAvenzaWithFallback', 'handleAppDirectOpen']
avenza_imports = """import { APP_INSTRUCTION_CONFIGS, CIRCLE_ID } from '../config/app-config.js';
"""
avenza_bounds = extract_funcs(avenza_funcs, 'scripts/components/avenza-modal-view.js', avenza_imports)

# 3. bottom-nav-view.js
bottom_nav_funcs = ['setupMobileBottomNav']
bottom_nav_bounds = extract_funcs(bottom_nav_funcs, 'scripts/components/bottom-nav-view.js', "")

# 4. modal-view.js
modal_funcs = ['closeAllModals']
modal_bounds = extract_funcs(modal_funcs, 'scripts/components/modal-view.js', "")

# Also need to remove showToast bounds
toast_start, toast_end = get_func_bounds('showToast', lines)
if toast_start != -1:
    bounds_to_remove = header_bounds + avenza_bounds + bottom_nav_bounds + modal_bounds + [(toast_start, toast_end)]
else:
    bounds_to_remove = header_bounds + avenza_bounds + bottom_nav_bounds + modal_bounds

# Remove extracted lines from maps-tile.js (in reverse order to not mess up indices)
bounds_to_remove.sort(key=lambda x: x[0], reverse=True)
for start, end in bounds_to_remove:
    del lines[start:end+1]

# Insert imports into maps-tile.js
new_imports = """
import { showToast } from './components/toast-view.js';
import { updateHeaderLogo, adjustHeaderFontSize, balancedHeaderHTML, updateHeader, getFitPadding } from './components/header-view.js';
import { getAppStoreUrl, launchAppWithStoreFallback, updateAvenzaModalHeaderTitle, getActiveSelectionThumbnail, openAppInstructionModal, openInAvenzaWithFallback, handleAppDirectOpen } from './components/avenza-modal-view.js';
import { setupMobileBottomNav } from './components/bottom-nav-view.js';
import { closeAllModals } from './components/modal-view.js';
"""
lines.insert(15, new_imports)

# add export keywords to all created component functions so they can be imported
def add_exports(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r') as f:
        content = f.read()
    content = re.sub(r'^(async\s+)?function\s+(\w+)\s*\(', r'export \1function \2(', content, flags=re.MULTILINE)
    with open(filepath, 'w') as f:
        f.write(content)

add_exports('scripts/components/header-view.js')
add_exports('scripts/components/avenza-modal-view.js')
add_exports('scripts/components/bottom-nav-view.js')
add_exports('scripts/components/modal-view.js')

with open(maps_tile_path, 'w') as f:
    f.writelines(lines)

print("Extraction complete!")
