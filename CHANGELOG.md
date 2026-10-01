## v0.4.3 — Right-side control repairs

- Mode-aware optics/instrument controls with visible availability guidance
- Always-visible illustrative instrument guide; full route/tool reset
- Stable overview re-centering and interrupted-motion cleanup
- Coalesced optional skull loading with recoverable failure
- Rendered-pixel regression coverage for all controls, narrow phones, touch drags and repeated transitions

# v0.4.2 — Rendering and navigation repair

The previous release stopped with `ReferenceError: id is not defined` during group initialization. This occurred before GLB loading, rendering, or button wiring. A successful Vite/Vercel build did not test this runtime behavior.

This repair uses properly scoped scene construction, explicit loading/error states, opaque two-sided nasal surfaces, and a fitted camera path sharing exactly the model transform. It adds step/hold/keyboard controls, a depth slider, reset/recenter, and browser regression tests that compare rendered screenshots and camera coordinates. The 30-degree display span survives view changes.

## Scope and scientific limitations

The existing NasalSeg P001 mesh is reused unchanged. The illustrative viewing path is derived by voxelizing that surface at 1.25 source units, filling enclosed coronal cross-sections, and computing a clearance-biased path through one model half. It is not a validated endonasal surgical route. The earlier export retained proportions but not verified patient orientation; distances are therefore displayed as model units, not calibrated surgical measurements.

The unregistered, different-subject SPL skull is now a **separate reference view**, rather than an overlay that might be mistaken for registered anatomy. The synthetic sellar objects are a **separate illustration**, not a continuation of the measured nasal route. Automatic landmark credit and yaw-only 'safety' scores have been removed because they were not anatomical contact or competency measurements. No new patient datasets or operative videos are published by this repair.

The browser tests cover desktop and touch-emulated Chromium, anatomy visibility at route positions, advance/withdraw reversibility, mode switches, 30-degree optics, hold/keyboard input, optional skull loading, and a failed critical-asset request. Headset behavior and clinical fidelity are not validated by these tests.

Original source attribution remains in DATA_PROVENANCE.md and the app's source panel.
