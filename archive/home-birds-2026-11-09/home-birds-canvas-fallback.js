// Lightweight canvas flock for browsers without WebGPU or when Three.js cannot load.
export function mountFallbackBirds(container) {
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    container.replaceChildren(canvas);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const mobile = window.matchMedia("(max-width: 700px)").matches;
    const birdCount = mobile ? 48 : 84;
    const birds = Array.from({ length: birdCount }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: Math.random() * 1.2 - 0.6,
        vy: Math.random() * 1.2 - 0.6
    }));
    const pointer = { x: -10000, y: -10000 };
    let width = 0;
    let height = 0;
    let color = "#64b5f6";
    let frameId = 0;
    let previousTime = performance.now();

    const resize = () => {
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const updateTheme = () => {
        color = getComputedStyle(document.documentElement).getPropertyValue("--accent-color").trim() || "#64b5f6";
    };

    const render = now => {
        if (document.hidden) return;
        const dt = Math.min((now - previousTime) / 16.67, 2);
        previousTime = now;
        context.clearRect(0, 0, width, height);
        context.fillStyle = color;

        for (let i = 0; i < birds.length; i++) {
            const bird = birds[i];
            let nearby = 0;
            let alignX = 0;
            let alignY = 0;
            let centerX = 0;
            let centerY = 0;
            let separateX = 0;
            let separateY = 0;

            for (let j = 0; j < birds.length; j++) {
                if (i === j) continue;
                const other = birds[j];
                const dx = other.x - bird.x;
                const dy = other.y - bird.y;
                const distanceSquared = dx * dx + dy * dy;
                if (distanceSquared > 85 * 85 || distanceSquared < 1) continue;
                nearby++;
                centerX += other.x;
                centerY += other.y;
                alignX += other.vx;
                alignY += other.vy;
                if (distanceSquared < 28 * 28) {
                    separateX -= dx / distanceSquared;
                    separateY -= dy / distanceSquared;
                }
            }

            if (nearby) {
                bird.vx += ((alignX / nearby - bird.vx) * 0.014 + (centerX / nearby - bird.x) * 0.00015 + separateX * 1.4) * dt;
                bird.vy += ((alignY / nearby - bird.vy) * 0.014 + (centerY / nearby - bird.y) * 0.00015 + separateY * 1.4) * dt;
            }

            const pointerX = bird.x - pointer.x;
            const pointerY = bird.y - pointer.y;
            const pointerDistance = pointerX * pointerX + pointerY * pointerY;
            if (pointerDistance > 0 && pointerDistance < 150 * 150) {
                const force = (1 - Math.sqrt(pointerDistance) / 150) * 0.08 * dt;
                bird.vx += pointerX * force;
                bird.vy += pointerY * force;
            }

            const speed = Math.hypot(bird.vx, bird.vy) || 1;
            const limitedSpeed = Math.min(1.25, Math.max(0.45, speed));
            bird.vx = bird.vx / speed * limitedSpeed;
            bird.vy = bird.vy / speed * limitedSpeed;
            bird.x = (bird.x + bird.vx * dt + width) % width;
            bird.y = (bird.y + bird.vy * dt + height) % height;

            context.save();
            context.translate(bird.x, bird.y);
            context.rotate(Math.atan2(bird.vy, bird.vx) + Math.PI / 2);
            context.globalAlpha = 0.82;
            context.beginPath();
            context.moveTo(0, -7.5);
            context.quadraticCurveTo(-1.5, -1.5, -7.5, 3);
            context.quadraticCurveTo(-3, 3, 0, 1.5);
            context.quadraticCurveTo(3, 3, 7.5, 3);
            context.quadraticCurveTo(1.5, -1.5, 0, -7.5);
            context.fill();
            context.restore();
        }

        if (!container.classList.contains("is-ready")) {
            requestAnimationFrame(() => container.classList.add("is-ready"));
        }
        frameId = requestAnimationFrame(render);
    };

    const onPointerMove = event => { pointer.x = event.clientX; pointer.y = event.clientY; };
    const onVisibilityChange = () => {
        if (document.hidden) cancelAnimationFrame(frameId);
        else {
            previousTime = performance.now();
            frameId = requestAnimationFrame(render);
        }
    };
    const themeObserver = new MutationObserver(updateTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    resize();
    updateTheme();
    frameId = requestAnimationFrame(render);
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", () => {
        cancelAnimationFrame(frameId);
        themeObserver.disconnect();
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("visibilitychange", onVisibilityChange);
    }, { once: true });
}
