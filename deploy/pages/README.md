# Cloudflare Pages

## Deploy from GitHub

In Pages, choose **Connect to Git**. Set the production branch to `main`, leave the root directory blank and set `NODE_VERSION=24`. Set the output directory to `dist-pages`.

Enter the following build command.

```sh
npm run speech-model && npm run diarization-model && npx vite build --config deploy/pages/vite.config.ts
```

## Upload a local build

Run `npm ci` and the build command above. To reuse downloaded weights, set `VERBATRACE_SPEECH_MODEL_DIR`. The build splits large weights into parts of up to 20 MiB. Keep the weights and `dist-pages/` out of Git.

Use the name of your Pages project. Run the creation command once for a new Direct Upload project.

```sh
npx wrangler@4 login
npx wrangler@4 pages project create verbatrace --production-branch main
npx wrangler@4 pages deploy dist-pages --project-name verbatrace --branch preview
```

On the preview, check that `crossOriginIsolated` is `true`. Transcribe a short file, reload the editor and check that subsequent transcriptions use cached weights. Deploy with `--branch main` to publish.
