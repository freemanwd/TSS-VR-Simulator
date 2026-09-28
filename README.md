# TSS VR Simulator

Browser-based **transsphenoidal surgery (TSS) simulation research prototype** from STR-X.

## v0.1
This standalone build provides a dependency-free, synthetic endoscopic exploration scene for desktop and mobile browsers:
- synthetic endoscopic corridor
- schematic septum and turbinate region
- sphenoid/sellar progression
- bilateral ICA representations
- synthetic lesion
- keyboard, pointer, and touch navigation
- landmark discovery tracking

## Important
This is an **experimental educational/research prototype**. Current anatomy is procedurally generated and is **not patient-derived, anatomically validated, or suitable for clinical guidance or credentialing**. It does not yet model drilling, resection, bleeding, haptics, deformable tissue, or validated surgical performance.

## Run locally
No package install is required for development:
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000`.

## Vercel
The repository contains `vercel.json` and can be imported directly into Vercel as a static site.

## Roadmap
Add appropriately licensed CT/MRI-derived skull-base geometry, expert-reviewed segmentations, WebXR, instrument interaction, procedural-state modeling, and AI-assisted debriefing while keeping synthetic and patient-derived assets explicitly separated.
