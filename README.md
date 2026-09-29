# NeoWorld

Official NeoWorld-3 research blog: **Building Interactive Worlds for Embodied Intelligence**.

Live site: https://mulan2022.github.io/NeoWorld/

Light article palette for review: https://mulan2022.github.io/NeoWorld/?theme=light

Ocean palette for review: https://mulan2022.github.io/NeoWorld/?theme=ocean

## Publish

Push changes to `main`. `.github/workflows/pages.yml` runs `python preview-v2/tools/build.py` to package the published site and uploads `site-v2/` using GitHub Pages. Repository Settings → Pages → Source is **GitHub Actions**.

## Source

- `preview-v2/`: the published page — HTML, styles, and JavaScript. Homepage camera and framing are in `preview-v2/scene-hero.js`.
- `preview-v2/optimized/`: derived media the page loads (WebP icons, references and posters, the quantized hero wireframe, H.264 video encodes). Regenerate with `python preview-v2/tools/optimize-assets.py`; the files are committed so packaging needs no extra dependencies.
- `preview-v2/tools/build.py`: packaging script, mirrored by `scripts/build-pages.py`. Writes `site-v2/`.
- `preview/`: the earlier version of the page, kept for reference. `scripts/build-pages.py` still packages it into `site/`.
- `assets/`: Scene 01 source model, optimized hero wireframe, video, subset pixel font, and ten articulated URDF objects.
- `assets/architecture/`: lightweight animated workflow renders generated from the reference images and URDF viewer.
- `scripts/build-pages.py`: dependency-free packaging script for `preview/`.
- `scripts/generate-architecture-gifs.py`: regenerates the workflow GIFs while `python scripts/preview-server.py` is running.

The generated site uses relative URLs so it works under a repository subpath. Serve `site-v2/` through an HTTP server to preview; opening `index.html` as a local file cannot load the 3D assets.

The homepage loads a prebaked line-only scene. The video and articulation viewer start loading near their sections; each published URDF object is delivered as one compressed runtime bundle, and large PNG materials use WebP runtime copies.

## Attribution

The research article is maintained in `Neoworld-3_blog.md` and presented in `preview/index.html`. The Scene 01 coffee-area GLB, comparison video, and poster originate from [NeoWorld Studio](https://neoworldproject.github.io/Studio/). The URDF viewer demonstrates kinematics, without a physics solver. Three.js and Anime.js licenses are retained under `preview/vendor/` and copied into the published bundle.
