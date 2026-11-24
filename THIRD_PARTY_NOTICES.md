# Third-party notices

The [MIT license](LICENSE) covers Verbatrace code. See the licenses below for models, fonts and dependencies. Installed packages include their license files.

## Models

### Speech recognition

**Parakeet TDT 0.6b v3**, int8 ONNX.

- Original model by [NVIDIA](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3).
- [ONNX conversion by istupakov](https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx).
- [ONNX repackaging by ysdede](https://huggingface.co/ysdede/parakeet-tdt-0.6b-v3-onnx).
- License [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The [manifest](speech-model.json) pins the revision and SHA-256 hashes. The demo serves the encoder in parts and reassembles it in the browser.

### Speaker identification

The optional CAM++ embeddings from 3D-Speaker / Alibaba DAMO use the [Sherpaw preload repackaging](https://huggingface.co/moeru-ai/sherpaw-campplus-zh-en-advanced) under [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0). The [manifest](diarization-model.json) pins the revision and SHA-256 hashes.

## Runtime and application dependencies

| Component | License | Use |
|---|---|---|
| `@sherpaw/speaker-diarization` | Apache-2.0 | sherpa-onnx and WebAssembly diarization |
| `onnxruntime-web` | MIT | ONNX execution in WebAssembly |
| `parakeet.js` | MIT | Parakeet, spectrogram and decoding |
| `Dexie` | Apache-2.0 | IndexedDB |
| `docx` | MIT | DOCX in the browser |
| `fflate` | MIT | Local ZIP backup |
| React / React DOM / React Router | MIT | UI and routing |
| Radix UI packages | MIT | UI primitives |
| TanStack Query | MIT | Local query state |
| `react-dropzone` / `react-virtuoso` | MIT | Upload and virtualization |
| `lucide-react` | ISC | Icons |
| `sonner` / `clsx` / `tailwind-merge` | MIT | Notifications and CSS classes |
| IBM Plex Sans / Mono | OFL-1.1 | Interface fonts |

## Borrowed code

- `src/local/pipeline/segments.ts` adapts `partitionWordsIntoSegments` from [parakeet.js](https://github.com/ysdede/parakeet.js) by Yunus Seyhan Dede under the MIT license.

### parakeet.js license

MIT License

Copyright (c) 2025 Yunus Seyhan Dede

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
