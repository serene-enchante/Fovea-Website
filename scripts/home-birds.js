// Adapted from the three.js webgpu_compute_birds example.
// Copyright © 2010-2026 three.js authors. MIT licensed; see THIRD_PARTY_NOTICES.md.
import * as THREE from "three/webgpu";
import * as tsl from "three/tsl";
import WebGPU from "three/addons/capabilities/WebGPU.js";

export async function mountHomeBirds(container) {
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    if (WebGPU.isAvailable() === false) return false;

    const {
        add, cameraProjectionMatrix, cameraViewMatrix, Continue, cos, dot, float, Fn,
        If, instancedArray, instanceIndex, length, Loop, mat3, max, modelWorldMatrix,
        negate, normalize, positionLocal, sin, sqrt, sub, uint, uniform, varying, vec4, vertexIndex
    } = tsl;

    const mobile = window.matchMedia("(max-width: 700px)").matches;
    const birdCount = mobile ? 640 : 1280;
    const bounds = 800;
    const speedLimit = 9;
    const containerWidth = Math.max(1, container.clientWidth || window.innerWidth);
    const containerHeight = Math.max(1, container.clientHeight || window.innerHeight);
    let disposed = false;
    let lastFrame = performance.now();
    let initialized = false;
    let computeVelocity;
    let computePosition;
    let effect;
    let birdColor;
    let renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, containerWidth / containerHeight, 1, 5000);
    camera.position.z = 1000;

    const pointer = new THREE.Vector2(0, 10);
    const raycaster = new THREE.Raycaster();

    class BirdGeometry extends THREE.BufferGeometry {
        constructor() {
            super();
            const vertices = new THREE.BufferAttribute(new Float32Array(27), 3);
            this.setAttribute("position", vertices);
            const span = 20;
            vertices.array.set([
                0, 0, -20, 0, -8, 10, 0, 0, 30,
                0, 0, -15, -span, 0, 5, 0, 0, 15,
                0, 0, 15, span, 0, 5, 0, 0, -15
            ]);
            this.scale(0.2, 0.2, 0.2);
        }
    }

    const positions = new Float32Array(birdCount * 3);
    const velocities = new Float32Array(birdCount * 3);
    const phases = new Float32Array(birdCount);
    for (let i = 0; i < birdCount; i++) {
        for (let axis = 0; axis < 3; axis++) {
            positions[i * 3 + axis] = Math.random() * bounds - bounds / 2;
            velocities[i * 3 + axis] = (Math.random() - 0.5) * 10;
        }
        phases[i] = 1;
    }

    const positionStorage = instancedArray(positions, "vec3");
    const velocityStorage = instancedArray(velocities, "vec3");
    const phaseStorage = instancedArray(phases, "float");
    positionStorage.setPBO(true);
    velocityStorage.setPBO(true);
    phaseStorage.setPBO(true);

    effect = {
        separation: uniform(15),
        alignment: uniform(20),
        cohesion: uniform(20),
        deltaTime: uniform(0),
        rayOrigin: uniform(new THREE.Vector3()),
        rayDirection: uniform(new THREE.Vector3())
    };
    birdColor = uniform(new THREE.Color());

    const birdMaterial = new THREE.NodeMaterial();
    birdMaterial.colorNode = birdColor;
    birdMaterial.side = THREE.DoubleSide;

    const birdVertex = Fn(() => {
        const position = positionLocal.toVar();
        const phase = phaseStorage.element(instanceIndex).toVar();
        const velocity = normalize(velocityStorage.element(instanceIndex)).toVar();
        If(vertexIndex.equal(4).or(vertexIndex.equal(7)), () => {
            position.y = sin(phase).mul(5);
        });
        const worldPosition = modelWorldMatrix.mul(position);
        velocity.z.mulAssign(-1);
        const horizontalLength = length(velocity.xz);
        const verticalCos = sqrt(float(1).sub(velocity.y.mul(velocity.y)));
        const cosY = velocity.x.div(horizontalLength).toVar();
        const sinY = velocity.z.div(horizontalLength).toVar();
        const cosZ = verticalCos;
        const sinZ = velocity.y.toVar();
        const rotateY = mat3(cosY, 0, negate(sinY), 0, 1, 0, sinY, 0, cosY);
        const rotateZ = mat3(cosZ, sinZ, 0, negate(sinZ), cosZ, 0, 0, 0, 1);
        const vertex = rotateY.mul(rotateZ).mul(worldPosition);
        vertex.addAssign(positionStorage.element(instanceIndex));
        return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vertex);
    });
    birdMaterial.vertexNode = birdVertex();

    const birdMesh = new THREE.InstancedMesh(new BirdGeometry(), birdMaterial, birdCount);
    birdMesh.rotation.y = Math.PI / 2;
    birdMesh.matrixAutoUpdate = false;
    birdMesh.frustumCulled = false;
    birdMesh.updateMatrix();
    scene.add(birdMesh);

    computeVelocity = Fn(() => {
        const pi2 = float(Math.PI * 2);
        const limit = float(speedLimit).toVar("limit");
        const { alignment, separation, cohesion, deltaTime, rayOrigin, rayDirection } = effect;
        const zoneRadius = separation.add(alignment).add(cohesion).toConst();
        const separationThreshold = separation.div(zoneRadius).toConst();
        const alignmentThreshold = separation.add(alignment).div(zoneRadius).toConst();
        const zoneRadiusSquared = zoneRadius.mul(zoneRadius).toConst();
        const birdIndex = instanceIndex.toConst("birdIndex");
        const position = positionStorage.element(birdIndex).toVar();
        const velocity = velocityStorage.element(birdIndex).toVar();

        const directionToRay = rayOrigin.sub(position).toConst();
        const projection = dot(directionToRay, rayDirection).toConst();
        const closestPoint = rayOrigin.sub(rayDirection.mul(projection)).toConst();
        const directionToPointer = closestPoint.sub(position).toConst();
        const pointerDistanceSquared = length(directionToPointer).toConst().mul(length(directionToPointer).toConst());
        const pointerRadiusSquared = float(150).mul(150).toConst();
        If(pointerDistanceSquared.lessThan(pointerRadiusSquared), () => {
            const adjustment = pointerDistanceSquared.div(pointerRadiusSquared).sub(1).mul(deltaTime).mul(100);
            velocity.addAssign(normalize(directionToPointer).mul(adjustment));
            limit.addAssign(5);
        });

        const centerDirection = position.toVar();
        centerDirection.y.mulAssign(2.5);
        velocity.subAssign(normalize(centerDirection).mul(deltaTime).mul(5));

        Loop({ start: uint(0), end: uint(birdCount), type: "uint", condition: "<" }, ({ i }) => {
            If(i.equal(birdIndex), () => Continue());
            const otherPosition = positionStorage.element(i);
            const direction = otherPosition.sub(position);
            const distance = length(direction);
            If(distance.lessThan(0.0001), () => Continue());
            const distanceSquared = distance.mul(distance);
            If(distanceSquared.greaterThan(zoneRadiusSquared), () => Continue());
            const percent = distanceSquared.div(zoneRadiusSquared);

            If(percent.lessThan(separationThreshold), () => {
                const adjustment = separationThreshold.div(percent).sub(1).mul(deltaTime);
                velocity.subAssign(normalize(direction).mul(adjustment));
            }).ElseIf(percent.lessThan(alignmentThreshold), () => {
                const blend = percent.sub(separationThreshold).div(alignmentThreshold.sub(separationThreshold));
                const adjustment = float(0.5).sub(cos(blend.mul(pi2)).mul(0.5)).add(0.5).mul(deltaTime);
                velocity.addAssign(normalize(velocityStorage.element(i)).mul(adjustment));
            }).Else(() => {
                const remainder = alignmentThreshold.oneMinus();
                const blend = remainder.equal(0).select(1, percent.sub(alignmentThreshold).div(remainder));
                const adjustment = float(0.5).sub(cos(blend.mul(pi2)).mul(-0.5).add(0.5)).mul(deltaTime);
                velocity.addAssign(normalize(direction).mul(adjustment));
            });
        });

        If(length(velocity).greaterThan(limit), () => {
            velocity.assign(normalize(velocity).mul(limit));
        });
        velocityStorage.element(birdIndex).assign(velocity);
    })().compute(birdCount).setName("Homepage birds velocity");

    computePosition = Fn(() => {
        const velocity = velocityStorage.element(instanceIndex);
        positionStorage.element(instanceIndex).addAssign(velocity.mul(effect.deltaTime).mul(15));
        const phase = phaseStorage.element(instanceIndex);
        const nextPhase = phase.add(effect.deltaTime)
            .add(length(velocity.xz).mul(effect.deltaTime).mul(3))
            .add(max(velocity.y, 0).mul(effect.deltaTime).mul(6));
        phaseStorage.element(instanceIndex).assign(nextPhase.mod(62.83));
    })().compute(birdCount).setName("Homepage birds position");

    const updateBirdTheme = () => {
        const isLight = document.documentElement.getAttribute("data-theme") === "light"
            || document.documentElement.classList.contains("theme-light")
            || document.body.classList.contains("theme-light");
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent-color").trim() || "#64b5f6";
        birdColor.value.set(accent).lerp(new THREE.Color(isLight ? "#14263b" : "#b9e4ff"), isLight ? 0.58 : 0.38);
    };
    updateBirdTheme();

    try {
        renderer = new THREE.WebGPURenderer({
            alpha: true,
            antialias: true,
            forceWebGL: false,
            requiredLimits: { maxStorageBuffersInVertexStage: 3 }
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(containerWidth, containerHeight);
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.setAttribute("aria-hidden", "true");
        container.appendChild(renderer.domElement);
        await renderer.init();

        const render = () => {
            if (disposed || document.hidden) return;
            const now = performance.now();
            const deltaTime = Math.min((now - lastFrame) / 1000, 0.08);
            lastFrame = now;
            raycaster.setFromCamera(pointer, camera);
            effect.deltaTime.value = deltaTime;
            effect.rayOrigin.value.copy(raycaster.ray.origin);
            effect.rayDirection.value.copy(raycaster.ray.direction);
            renderer.compute(computeVelocity);
            renderer.compute(computePosition);
            renderer.render(scene, camera);
            if (!initialized) {
                initialized = true;
                requestAnimationFrame(() => container.classList.add("is-ready"));
            }
        };

        renderer.setAnimationLoop(render);
        const onResize = () => {
            const width = Math.max(1, container.clientWidth || window.innerWidth);
            const height = Math.max(1, container.clientHeight || window.innerHeight);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        };
        const onPointerMove = event => {
            pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
            pointer.y = 1 - (event.clientY / window.innerHeight) * 2;
        };
        const onVisibilityChange = () => renderer.setAnimationLoop(document.hidden ? null : render);
        const themeObserver = new MutationObserver(updateBirdTheme);
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
        window.addEventListener("resize", onResize, { passive: true });
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("pagehide", () => {
            disposed = true;
            themeObserver.disconnect();
            window.removeEventListener("resize", onResize);
            window.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            renderer.setAnimationLoop(null);
            renderer.dispose();
        }, { once: true });
        return true;
    } catch (error) {
        renderer?.dispose();
        container.replaceChildren();
        throw error;
    }
}
