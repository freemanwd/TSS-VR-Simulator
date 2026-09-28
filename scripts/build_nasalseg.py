#!/usr/bin/env python3
"""Build a browser mesh from the open NasalSeg segmentation dataset.

Source: Zhang Y, et al. NasalSeg, DOI 10.5281/zenodo.13893419.
The script downloads the published archive, chooses the first label volume,
extracts labels 3 (right nasal cavity), 4 (left nasal cavity), and 5
(nasopharynx), and exports a decimated GLB. The selected case is not
represented as a normal or canonical anatomy.
"""
from pathlib import Path
import io, os, urllib.request, zipfile, tempfile, json
import numpy as np
import nrrd
from skimage.measure import marching_cubes
import trimesh

URL="https://zenodo.org/records/13893419/files/NasalSeg.zip?download=1"
OUT=Path("public/assets"); OUT.mkdir(parents=True,exist_ok=True)
archive=Path(tempfile.gettempdir())/"NasalSeg.zip"
if not archive.exists():
    print("Downloading NasalSeg (224 MB)…")
    urllib.request.urlretrieve(URL, archive)
with zipfile.ZipFile(archive) as z:
    labels=[n for n in z.namelist() if n.lower().endswith((".nrrd",".nhdr")) and ("label" in n.lower() or "seg" in n.lower())]
    if not labels:
        # Dataset is documented as images/ + labels/; tolerate nested capitalization.
        labels=[n for n in z.namelist() if n.lower().endswith(".nrrd") and "/labels/" in ("/"+n.lower())]
    if not labels: raise RuntimeError("No NasalSeg label NRRD found in archive")
    case=sorted(labels)[0]; print("Representative case:",case)
    raw=z.read(case)
with tempfile.NamedTemporaryFile(suffix=".nrrd",delete=False) as f:
    f.write(raw); tmp=f.name
vol,h=nrrd.read(tmp); os.unlink(tmp)
mask=np.isin(vol,[3,4,5]).astype(np.uint8)
# Downsample only if needed; marching_cubes step_size preserves topology while reducing browser payload.
spacing=h.get("space directions")
try:
    sp=np.array([np.linalg.norm(v) for v in spacing],dtype=float)
except Exception: sp=np.ones(3)
verts,faces,normals,_=marching_cubes(mask,.5,spacing=tuple(sp),step_size=3,allow_degenerate=False)
mesh=trimesh.Trimesh(vertices=verts,faces=faces,vertex_normals=normals,process=True)
# Keep original physical proportions, center only. Viewer applies a rigid display transform.
mesh.apply_translation(-mesh.bounding_box.centroid)
scene=trimesh.Scene()
scene.add_geometry(mesh,node_name="NasalSeg_labels_3_4_5",geom_name="Nasal cavities + nasopharynx")
(OUT/"nasalseg-case.glb").write_bytes(scene.export(file_type="glb"))
meta={"dataset":"NasalSeg","doi":"10.5281/zenodo.13893419","source_url":URL,"case_file":case,"labels":{"3":"right nasal cavity","4":"left nasal cavity","5":"nasopharynx"},"vertices":int(len(mesh.vertices)),"faces":int(len(mesh.faces)),"processing":"marching cubes step_size=3; centered; no anatomical warping","note":"Representative research case; not a normative atlas or patient-specific model."}
(OUT/"nasalseg-case.json").write_text(json.dumps(meta,indent=2))
print(meta)
