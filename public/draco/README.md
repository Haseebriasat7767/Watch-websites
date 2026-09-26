# Draco decoder payload

`lib/config.ts` sets `DRACO_DECODER_PATH = '/draco/'` and hands it straight to
`useGLTF(url, DRACO_DECODER_PATH)`, which forces Draco decompression natively in
the glTF loader.

Drop the two runtime files here to activate the production GLB lane:

```bash
# from the three.js distribution (or any glTF-Transform / DRACO release)
curl -L -o public/draco/draco_decoder.wasm \
  https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/libs/draco/gltf/draco_decoder.wasm
curl -L -o public/draco/draco_wasm_wrapper.js \
  https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js
```

Set `MODEL_URL` in `src/lib/config.ts` to a hosted, Draco-compressed `.glb` and
the component swaps from the procedural atelier mesh to the imported geometry —
no other change required.
