#!/usr/bin/env python3
"""Build browser-ready skull-base reference geometry from the SPL Head & Neck Atlas.
Source: Open Anatomy Project, head-neck-2016-09.zip; 3D Slicer License section B.
This keeps source geometry proportions and only centers/scales at display time.
"""
from pathlib import Path
import json, tempfile, urllib.request, zipfile, re, os
import numpy as np, trimesh
import vtk
from vtk.util.numpy_support import vtk_to_numpy

URL="https://www.openanatomy.org/atlases/nac/head-neck-2016-09.zip"
OUT=Path("public/assets"); OUT.mkdir(parents=True,exist_ok=True)
arc=Path(tempfile.gettempdir())/"head-neck-2016-09.zip"
if not arc.exists():
    print("Downloading SPL Head & Neck Atlas…"); urllib.request.urlretrieve(URL,arc)
with zipfile.ZipFile(arc) as z:
    names=z.namelist()
    candidates=[n for n in names if n.lower().endswith((".vtk",".stl",".ply",".obj"))]
    print("Model files",len(candidates))
    skull=[n for n in candidates if re.search(r"(skull|cranium|cranial)",n,re.I)]
    # If atlas names bone generically, retain head bone candidates but avoid mandible/vertebrae.
    if not skull:
        skull=[n for n in candidates if re.search(r"(bone|head)",n,re.I) and not re.search(r"(mandible|vertebr|rib|hyoid)",n,re.I)]
    print("Skull candidates",skull[:30])
    if not skull: raise RuntimeError("No skull/cranium model found; candidates: "+str(candidates[:80]))
    chosen=skull[0]
    raw=z.read(chosen)
suffix=Path(chosen).suffix.lower()
with tempfile.NamedTemporaryFile(suffix=suffix,delete=False) as f: f.write(raw); tmp=f.name
try:
    if suffix==".vtk":
        reader=vtk.vtkPolyDataReader(); reader.SetFileName(tmp); reader.Update()
        poly=reader.GetOutput()
        triang=vtk.vtkTriangleFilter(); triang.SetInputData(poly); triang.Update(); poly=triang.GetOutput()
        verts=vtk_to_numpy(poly.GetPoints().GetData())
        arr=vtk_to_numpy(poly.GetPolys().GetData()).reshape(-1,4)
        mesh=trimesh.Trimesh(vertices=verts,faces=arr[:,1:4],process=True)
    else: mesh=trimesh.load(tmp,force="mesh",process=True)
finally: os.unlink(tmp)
# Reduce payload while retaining the source surface; no non-rigid transformation.
if len(mesh.faces)>70000:
    try:
        mesh=mesh.simplify_quadric_decimation(face_count=60000)
        print("Decimated skull to", len(mesh.faces), "faces")
    except Exception as e: print("Decimation skipped",e)
mesh.apply_translation(-mesh.bounding_box.centroid)
scene=trimesh.Scene();scene.add_geometry(mesh,node_name="SPL_CT_skull",geom_name="CT-derived skull")
(OUT/"spl-skull.glb").write_bytes(scene.export(file_type="glb"))
meta={"dataset":"SPL Head and Neck Atlas","source_url":URL,"license":"3D Slicer License section B","source_model":chosen,"vertices":int(len(mesh.vertices)),"faces":int(len(mesh.faces)),"processing":"source surface centered; optional topology-preserving decimation; no anatomical warping","note":"Reference atlas geometry from a different subject than NasalSeg; not a registered patient-specific composite."}
(OUT/"spl-skull.json").write_text(json.dumps(meta,indent=2))
print(meta)

# v0.3 build trigger

# vtk pipeline trigger

# v0.4 mobile optimization trigger
