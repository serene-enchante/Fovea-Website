# Archived homepage bird background integration

These snippets were removed from the live `index.html` on 2026-11-09. The standalone simulations and their license are archived in this folder.

## Import map

```html
    <script type="importmap">
        {
            "imports": {
                "three": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.webgpu.js",
                "three/webgpu": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.webgpu.js",
                "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.tsl.js",
                "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/"
            }
        }
    </script>
```

## Background styles

```css
        .home-birds {
            position: fixed;
            inset: 0;
            z-index: 0;
            overflow: hidden;
            opacity: 0;
            pointer-events: none;
            transition: opacity 4s ease;
        }

        .home-birds.is-ready {
            opacity: 0.32;
        }

        [data-theme="light"] .home-birds.is-ready,
        html.theme-light .home-birds.is-ready,
        body.theme-light .home-birds.is-ready {
            opacity: 0.22;
        }

        .home-birds canvas {
            display: block;
            width: 100%;
            height: 100%;
        }

        @media (prefers-reduced-motion: reduce) {
            .home-birds,
            .home-birds.is-ready {
                display: none;
                transition: none;
            }
        }
```

## Background container

```html
    <div id="home-birds" class="home-birds" aria-hidden="true"></div>
```

## Deferred loader

```js
            // Start the decorative simulation only after the homepage has had time to render.
            if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                const startHomeBirds = () => {
                    const container = document.getElementById("home-birds");
                    const startFallback = () => import("./scripts/home-birds-fallback.js")
                        .then(({ mountFallbackBirds }) => mountFallbackBirds(container))
                        .catch(() => {});
                    if (!navigator.gpu) {
                        startFallback();
                        return;
                    }
                    import("./scripts/home-birds.js")
                        .then(({ mountHomeBirds }) => mountHomeBirds(container))
                        .then(isMounted => { if (!isMounted) startFallback(); })
                        .catch(startFallback);
                };
                if ("requestIdleCallback" in window) {
                    window.requestIdleCallback(startHomeBirds, { timeout: 2400 });
                } else {
                    window.setTimeout(startHomeBirds, 1400);
                }
            }
```
