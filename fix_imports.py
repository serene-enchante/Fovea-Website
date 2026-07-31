def replace_in_file(filepath, old, new):
    with open(filepath, 'r') as f:
        content = f.read()
    content = content.replace(old, new)
    with open(filepath, 'w') as f:
        f.write(content)

replace_in_file('scripts/components/header-view.js', "import { state, normalizeZoneId } from '../maps-tile.js';", "import { state } from '../maps-tile.js';\nimport { normalizeZoneId } from '../utils/format-utils.js';")
replace_in_file('scripts/components/avenza-modal-view.js', "import { state, normalizeZoneId, displayZoneId, generateAppSpatialBlob } from '../maps-tile.js';", "import { state, generateAppSpatialBlob } from '../maps-tile.js';\nimport { normalizeZoneId, displayZoneId } from '../utils/format-utils.js';")
