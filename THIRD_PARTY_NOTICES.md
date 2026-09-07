# Third-party notices

The Python core is original implementation built on published reduction concepts, cited in docs/design.md. No third-party Python runtime packages are required.

The website uses React and React DOM (MIT), Vinext (MIT), Vite (MIT), Tailwind CSS (MIT), Base UI (MIT), shadcn/ui components (MIT), Lucide icons (ISC), Geist fonts (SIL Open Font License), and Pyodide (MPL-2.0 with bundled software under its respective licenses, including CPython under the PSF license). Build and test packages have their own licenses in the npm dependency tree.

Pyodide's files are copied unchanged from the pinned `pyodide` npm package. The upstream MPL license is preserved in `public/PYODIDE-LICENSE.txt`; source and constituent licensing are available at https://github.com/pyodide/pyodide. The runtime license is also copied into the deployed assets.

The four retained shadcn components are unmodified; their upstream copyright and MIT permission notice are preserved in [licenses/SHADCN-MIT.txt](licenses/SHADCN-MIT.txt). The Geist font license is preserved in [public/GEIST-OFL.txt](public/GEIST-OFL.txt).

Before each website build, `scripts/prepare-runtime.mjs` collects installed npm package license files into `/runtime/THIRD_PARTY_LICENSES.txt`, which is deployed with the website. It includes build/test dependencies conservatively, even where their executable code is not distributed. Dependency versions and integrity hashes are recorded in package-lock.json. This notice supplements, and does not replace, applicable upstream license terms.
