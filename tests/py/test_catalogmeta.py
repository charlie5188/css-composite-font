"""Coverage generation uses declared ranges and preserves unknown responses."""
import importlib.util
from pathlib import Path
import sys

TOOLS = Path(__file__).resolve().parents[2] / 'tools'
sys.path.insert(0, str(TOOLS))
spec = importlib.util.spec_from_file_location('catalogmeta', TOOLS / 'catalogmeta.py')
catalogmeta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalogmeta)


def test_split_and_wildcard_ranges():
    result = catalogmeta.coverage("@font-face {unicode-range: U+30-39, U+4??;} @font-face {unicode-range: U+41-5A,U+61-7A;}")
    assert result['digit'] and result['latin']
    assert not result['sc'] and not result['tc'] and not result['jp'] and not result['kana']


def test_missing_ranges_are_unknown():
    assert catalogmeta.coverage('') is None
    assert catalogmeta.coverage('@font-face {src:url(font.ttf);}') is None
    assert catalogmeta.coverage('@font-face {unicode-range:U+30-39;} @font-face {src:url(other.ttf);}') is None
