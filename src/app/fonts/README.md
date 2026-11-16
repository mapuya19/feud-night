# Vendored fonts

These are the existing Inter and Outfit typefaces, using their Latin variable
WOFF2 files rather than downloading Google Fonts CSS during every build.
They are third-party assets under the SIL Open Font License 1.1, **not** the
repository's MIT source-code license. The unmodified licenses are included:

- Inter: `Inter-OFL.txt`, https://github.com/google/fonts/tree/main/ofl/inter
- Outfit: `Outfit-OFL.txt`, https://github.com/google/fonts/tree/main/ofl/outfit

Original WOFF2 sources (downloaded 2026-11-16):

- `inter-latin-variable.woff2`: https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2
- `outfit-latin-variable.woff2`: https://fonts.gstatic.com/s/outfit/v15/QGYvz_MVcBeNP4NJtEtq.woff2

Both files cover weights 100–900. Characters outside the Latin subset fall
back to system fonts. Keep the license files when copying or updating fonts.
No font download or font-generation tool is required to build this repo.

SHA-256:

```text
3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62  inter-latin-variable.woff2
6c18d579fd87c3776be068b762cbc83fde3acb543d49eabd3ade842eb987e887  outfit-latin-variable.woff2
```
