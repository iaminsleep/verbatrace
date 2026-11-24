# Contributing

## Run the dev server

Use Node.js 22 or later.

```sh
npm ci
npm run speech-model
npm run dev
```

Run `npm run diarization-model` to enable speaker identification.

## Run the tests

```sh
npm run check
```

For browser tests, download the speaker model and install Chromium.

```sh
npm run diarization-model
npx playwright install chromium
npm run test:e2e
```

The tests build and serve the app on port 4173.

Keep processing on the device. Pin model revisions and SHA-256 hashes. Test changes to processing, privacy and storage.
