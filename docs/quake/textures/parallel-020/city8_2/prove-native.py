"""Bounded city8_2 replay of current current PAK/BSP bytes through the retained native verifier."""
from pathlib import Path
import importlib.util, sys
root=Path(__file__).resolve().parents[5]
path=root/'docs/quake/textures/batch-001-native-source-proof.py'
spec=importlib.util.spec_from_file_location('quake_native_proof',path)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.NAMES=('city8_2',)
sys.argv=[str(path),'--root',str(root),'--output','docs/quake/textures/parallel-020/city8_2/native-proof.json']
module.main()
