import sys

def modify_file(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    # Imports to add at line 15 (which is index 14)
    imports = """import { geojsonToKml, geojsonToGpx, canvasToTiffBlob } from './services/format-converters.js';
import { handleSpatialFileShare, saveBlob } from './services/file-download-service.js';
"""
    lines.insert(14, imports)
    
    # We must offset our removals by +1 because we added 1 item (which is actually a multiline string, but it's 1 list element)
    # Wait, it's safer to delete by original line numbers, so let's delete first, then insert.
    
    # Ranges to delete (1-indexed inclusive):
    # 1349 to 1418
    # 795 to 920
    # 791 to 793
    # 355 to 480
    
    with open(filepath, 'r') as f:
        lines = f.readlines()

    # Sort ranges descending so deleting doesn't affect previous indices
    ranges = [
        (1349, 1418),
        (795, 920),
        (791, 793),
        (355, 480)
    ]
    
    for start, end in ranges:
        del lines[start-1:end]
        
    lines.insert(14, imports)
    
    with open(filepath, 'w') as f:
        f.writelines(lines)

modify_file('scripts/maps-tile.js')
