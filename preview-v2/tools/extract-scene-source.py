"""Extract verbatim Scene 01 source for the website's X-Ray code viewer.

Usage:
    python preview-v2/tools/extract-scene-source.py "new assets/scene1_sources(1)/scene1_sources"

The archive is a historical source supplement, not a clean replay from an empty scene.
Keep the generated JavaScript in git; the full source archive is not needed by Pages.
"""

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'new assets/scene1_sources(1)/scene1_sources'
OUTPUT = ROOT / 'assets/studio/scenes/scene-01/scene-source-data.js'


def source(file_id, relative_path, label, stage, start=None, stop=None, stop_before=False):
    path = SOURCE / relative_path
    raw = path.read_bytes()
    lines = raw.decode('utf-8').splitlines(keepends=True)
    first = 1 if start is None else next(i for i, line in enumerate(lines, 1) if start in line)
    last = len(lines) if stop is None else next(i for i, line in enumerate(lines, 1) if stop in line) - int(stop_before)
    assert first <= last, relative_path
    return file_id, {
        'label': label,
        'stage': stage,
        'path': relative_path,
        'firstLine': first,
        'lastLine': last,
        'sha256': hashlib.sha256(raw).hexdigest(),
        'code': ''.join(lines[first - 1:last]),
    }


files = dict([
    source('floor_repair', 'final_repairs/render_robot.py', 'Floor completion', 'Final repair · source excerpt',
           '# User-authorized illustration repair:', "scene_floor_repaired.blend'), copy=True)"),
    source('wall_revision', 'stage19_wall/programs/program_002_Correct left wall profile and close local countertop return joint.py',
           'Left wall & countertop joint', 'Stage 19 revision · source excerpt',
           'def apply_left_wall_profile_and_scribe', 'def restore_left_wall_profile_and_scribe', stop_before=True),
    source('room_shell', 'initial_demo1_api/programs/program_001_room_shell.py', 'Room shell', 'Initial authoring program'),
    source('kitchen', 'initial_demo1_api/programs/program_031_kitchen_fitted.py', 'Kitchen & cabinets', 'Initial authoring program'),
    source('appliances', 'initial_demo1_api/programs/program_005_counter_appliances.py', 'Microwave & coffee machine', 'Initial authoring program'),
    source('stools', 'initial_demo1_api/programs/program_032_bar_stools.py', 'Bar stools', 'Initial authoring program'),
    source('glass', 'initial_demo1_api/programs/program_013_glass_entrance.py', 'Glass entrance', 'Initial authoring program'),
    source('column_socket', 'initial_demo1_api/programs/program_034_column_socket.py', 'Column outlet', 'Initial authoring program'),
    source('coffee_cord', 'scene_revision_history/stage09/programs/program_005_Clear return joint and route connected coffee cable around support.py',
           'Coffee cable routing', 'Stage 09 revision'),
    source('coffee_nozzle', 'scene_revision_history/stage10/programs/program_004_Source relative rounded coffee nozzle and stepped tray.py',
           'Coffee nozzle & tray', 'Stage 10 revision'),
    source('microwave_height', 'scene_revision_history/stage16/programs/program_007_Reduce microwave height with feet fixed on countertop.py',
           'Microwave height', 'Stage 16 revision'),
])

# These are navigation matches for the archived files, not claims that one file
# reproduces every polygon in the final native Blender scene.
entity_sources = {
    'Background': ['floor_repair', 'wall_revision', 'room_shell'],
    's1-floor-cabinet-measured': ['kitchen', 'wall_revision'],
    's1-microwave-003': ['appliances', 'microwave_height'],
    's1-coffee-machine': ['appliances', 'coffee_nozzle'],
    's1-hanging-cabinet-measured': ['kitchen'],
    'scene1-right-group': ['kitchen'],
    's1-wall-power-accessories': ['appliances', 'column_socket'],
    's1-coffee-power-detail': ['coffee_cord', 'appliances'],
    's1-stool-left': ['stools'],
    's1-stool-right': ['stools'],
    's1-left-glass-door-visible-partial': ['glass'],
}
entity_focus = {
    'Background': 'main_floor =',
    's1-floor-cabinet-measured': '# Continuous lower fitted cabinet',
    's1-microwave-003': '# Countertop microwave',
    's1-coffee-machine': '# Coffee machine at far right',
    's1-hanging-cabinet-measured': '# Upper cabinetry:',
    'scene1-right-group': '# Side raised utility top',
    's1-wall-power-accessories': '# Wall mounted outlets',
    's1-stool-left': 'for i,(u,v) in enumerate',
    's1-stool-right': 'for i,(u,v) in enumerate',
    's1-left-glass-door-visible-partial': '# Glass door is observed',
}

record = json.loads((ROOT / 'assets/studio/scenes/scene-01/scene-record.json').read_text(encoding='utf-8'))
assert {entry['id'] for entry in record['entities']} == set(entity_sources), 'Update the source mapping when Scene 01 entities change.'
assert all(file_id in files for choices in entity_sources.values() for file_id in choices)
assert all(focus in files[entity_sources[entity][0]]['code'] for entity, focus in entity_focus.items())
payload = {'provenance': 'Verbatim archived Python; the final .blend also includes later revisions.',
           'files': files, 'entitySources': entity_sources, 'entityFocus': entity_focus}
OUTPUT.write_text('window.NW_SCENE01_SOURCE = ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(f'{len(files)} archived source selections -> {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size:,} bytes)')
