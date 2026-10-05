"""Probe the installed Hermes loader and shell-hook adapter in a disposable home."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
from agent.skill_commands import scan_skill_commands, _load_skill_payload
from agent.shell_hooks import iter_configured_hooks, _make_callback
import yaml

home = Path(os.environ['HERMES_HOME'])
commands = scan_skill_commands()
for name in ('thinktank', 'tt-loop', 'tt-brainstorm'):
    assert '/' + name in commands, name
    loaded = _load_skill_payload(name)
    assert loaded and loaded[0]['success'], name
    assert str(loaded[1]).startswith(str(home)), loaded[1]
print('PASS real Hermes scanner/loader: /thinktank, /tt-loop, /tt-brainstorm')
config = yaml.safe_load((home / 'config.yaml').read_text())
specs = iter_configured_hooks(config)
assert len(specs) == 1 and specs[0].fail_closed
callback = _make_callback(specs[0])
assert callback(tool_name='terminal', args={'command': 'npm publish'}) is None
os.environ['HERMES_TT_LOOP_MODE'] = '1'
os.environ['HERMES_TT_REPO_PATH'] = str(Path.cwd())
result = callback(tool_name='terminal', args={'command': 'npm publish'})
assert result['action'] == 'block', result
assert callback(tool_name='terminal', args={'command': 'pwd'}) is None
assert callback(tool_name='search_files', args={'pattern': 'text', 'path': '.'}) is None
os.environ['HERMES_TT_VERIFY_COMMANDS'] = '["npm test"]'
assert callback(tool_name='terminal', args={'command': 'npm test'}) is None
assert callback(tool_name='terminal', args={'command': 'npm test && npm publish'})['action'] == 'block'
os.environ['HERMES_TT_ALLOW_DELEGATION'] = '1'
assert callback(tool_name='delegate_task', args={'goal': 'Read only review', 'role': 'leaf', 'output_schema': {'type': 'object'}}) is None
print('PASS real Hermes shell adapter: inactive, deny, scoped reads, pinned tests, typed leaf dispatch')
print(json.dumps({'verified': True, 'scope': 'loader and shell-hook adapter; no LLM or child process launched'}))
