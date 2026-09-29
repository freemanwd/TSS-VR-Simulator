# TSS Lab — v0.4.2

Dataset-derived nasal anatomy visualization for a browser. This repair fixes the fatal `id is not defined` startup error in v0.4 and verifies actual visible movement, rather than treating a successful Vite build as a functional browser test.

## Open the app

https://tss-vr-simulator.vercel.app

Wait for **NasalSeg P001 · CT mesh loaded**. Click **Advance** or **Withdraw**, hold either button for continuous motion, or move the position slider. Drag the image to look. W/S also move. Reset restores the route start; Re-center restores the viewing direction. At 0% Withdraw is intentionally disabled.

Views: Nasal endoscope; Nasal atlas with illustrative camera trajectory; separate SPL skull reference; separate synthetic sellar illustration. The latter two are not registered to the NasalSeg case.

## Local development

Node.js 22.12+:

```sh
npm install
npm run dev
```

Production build: `npm run build`. Vercel uses the included `vercel.json` configuration. The source GLB models are already bundled; normal application builds do not download or regenerate datasets.

## Browser regression testing

The GitHub **Browser navigation check** workflow builds the app and runs Chromium. It checks surface visibility and changing pixels at successive camera positions; exact advance/withdraw reversal; touch-emulated navigation; keyboard/hold release; view/optics/instrument switches; and a deliberately failed critical anatomy request. Test screenshots and JSON results are uploaded as artifacts. On `main`, it also waits for v0.4.2 and runs the tests on the public Vercel site.

To run locally with the built site served on port 4173:

```sh
pip install playwright numpy pillow
python -m playwright install chromium
python -m http.server 4173 --directory dist
# In another terminal:
python browser-test.py
```

## Anatomical and educational limitations

- Existing NasalSeg P001 cavities/nasopharynx mesh is unchanged. The viewing trajectory is a visualization aid fitted to this surface, not a validated surgical route.
- Patient orientation was not retained in the earlier source-to-mesh exporter. Distances are model units, not calibrated surgical measurements.
- SPL skull comes from a different subject and is shown independently. No patient-specific registration is claimed.
- Sella, ICA, optic and pituitary objects are a **synthetic illustration**. Do not mistake them for measured anatomy or a continuous TSS operative path.
- Automatic landmark credit and yaw-based danger scoring have been removed. No competency, collision-physics, clinical, or headset validation is claimed.

See [DATA_PROVENANCE.md](DATA_PROVENANCE.md) and [CHANGELOG.md](CHANGELOG.md). This software is for research demonstration, not clinical decisions, surgical planning, or credentialing.
