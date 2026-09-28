# Anatomy data provenance

## NasalSeg

The browser asset `public/assets/nasalseg-case.glb` is generated from the published **NasalSeg** dataset (DOI: 10.5281/zenodo.13893419), which contains 130 CT scans with pixel-wise annotations of the right/left nasal cavities, nasopharynx, and right/left maxillary sinuses.

The build script selects one segmentation case and extracts labels 3, 4, and 5 (right nasal cavity, left nasal cavity, nasopharynx) with marching cubes. It centers and decimates the mesh for browser rendering. It does not claim that this case is a normative atlas.

Source and citation: https://doi.org/10.5281/zenodo.13893419

The repository metadata for NasalSeg identifies the dataset as open access; retain the source citation and applicable dataset terms when redistributing derived assets.

## Deep TSS reconstruction

The current sphenoid/sellar face, paraclival ICA, optic apparatus, pituitary, and synthetic lesion are **educational reconstructions** authored for this prototype. They are not derived from NasalSeg and are rendered/labelled separately in the UI.

## PitVis

PitVis-2023 is **not redistributed in this repository**. Its published license is CC BY-NC-ND 4.0. It is reserved for separately governed research on workflow recognition and teaching design, not bundled as modified public simulator media.
