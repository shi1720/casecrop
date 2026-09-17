# Firebase Hosting

The public application is https://casecrop.web.app.

The app has no server-side application API or database. Vinext exports all routes to `dist/client`; Firebase serves the exported HTML, React navigation payloads, assets and browser workers directly. Browser computation and exports are unchanged.

## Build and preview

```sh
npm ci
npm run build
npm start -- --port 3000
```

The preview serves the actual static export, including clean page URLs. Missing paths return 404 rather than returning a misleading app page.

## Deploy

```sh
npx firebase-tools@15.30.1 deploy --only hosting:casecrop --project gen-lang-client-0444960702
```

Authenticate the Firebase CLI with an account authorized for this project first. The configuration targets only the `casecrop` Hosting site and cannot deploy the other sites in the shared project. No service account key or model credential is needed in the frontend.

Firebase deployment does not publish an npm/Python package or change the Python library. Source changes are tested before deployment. The historical Sites manifest remains only as project provenance; it is not read by Vite or Firebase.
