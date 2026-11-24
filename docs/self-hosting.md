# Self-hosting

See the [README](../README.md) for local setup. Run the commands from the repository root.

## Model files

Both download scripts verify the files and reuse valid copies. To use a different directory, set it for the downloads and the server.

```sh
export VERBATRACE_SPEECH_MODEL_DIR=/path/to/models
npm run speech-model
npm run diarization-model
npm start
```

Speaker identification is optional.

## Docker

`docker compose up -d` downloads the recognition model and starts the app at `http://127.0.0.1:3000`.

Download the optional speaker model with Compose.

```sh
docker compose run --rm model-fetch node scripts/fetch-diarization-model.mjs
```

Set `VERBATRACE_BIND`, `VERBATRACE_PORT` or `VERBATRACE_SPEECH_MODEL_DIR` in `.env` to change the address, port or model directory.

## Public deployment

Run `npm run build`. Serve `dist/` over HTTPS, expose the models at `/speech-model/` and serve `index.html` for client-side routes. Use `text/javascript` for `.mjs` and `application/wasm` for `.wasm`.

Set these headers for multithreaded recognition.

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

See the [nginx](../deploy/nginx.conf), [Caddy](../deploy/Caddyfile) and [Cloudflare Pages](../deploy/pages/README.md) configurations.

## Troubleshooting

- **Models missing.** Check that the download and server use the same directory.
- **Recognition is slow.** Check that `crossOriginIsolated` is `true` in the browser console.
- **Library is empty after a move.** Browser storage is tied to the address and port. Restore a backup from the old address.
- **Large recording fails.** Check available browser storage.

Get a JSON session log from **Settings → Session logs**. Logs are on by default and expire after 14 days. They record actions, timing and error stacks. Recordings, transcripts, filenames, notes and search terms are excluded. Review logs before sharing.
