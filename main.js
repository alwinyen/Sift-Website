import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";

const canvas = document.querySelector("#sift-canvas");

if (!canvas || !window.WebGLRenderingContext) {
  if (canvas?.parentElement) {
    const fallback = document.createElement("p");
    fallback.className = "canvas-fallback";
    fallback.textContent = "Interactive grains require WebGL support.";
    canvas.parentElement.appendChild(fallback);
  }
} else {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf2f5f8, 18, 36);

  const camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 50);
  camera.position.set(0, 0, 12);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.55);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(3, 8, 10);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xdce6ff, 0.55);
  fillLight.position.set(-5, 0, 6);
  scene.add(fillLight);

  const palette = [
    ["#cab17d", "#a08459"],
    ["#48596d", "#2e3947"],
    ["#7ca4bf", "#4f7389"],
    ["#cfa7aa", "#aa7d84"],
    ["#8e8f93", "#65666a"],
    ["#d58254", "#a95a33"],
  ];

  const state = {
    width: 1,
    height: 1,
    pointer: new THREE.Vector2(),
    pointerDown: false,
    dragIndex: -1,
    clock: new THREE.Clock(),
  };

  const container = {
    width: 9.2,
    height: 10.8,
    radius: 0.58,
    floorBounce: 0.74,
  };

  const glassGroup = new THREE.Group();
  scene.add(glassGroup);

  const roundedRectShape = createRoundedRect(
    -container.width / 2,
    -container.height / 2,
    container.width,
    container.height,
    0.65
  );

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    roughness: 0.18,
    metalness: 0.04,
    transmission: 0.25,
    thickness: 0.8,
  });

  const glassMesh = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape), glassMaterial);
  glassGroup.add(glassMesh);

  const outlinePoints = roundedRectShape.getPoints(72);
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
  });
  const outline = new THREE.Line(outlineGeometry, outlineMaterial);
  outline.position.z = 0.04;
  glassGroup.add(outline);

  const innerGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(container.width * 0.995, container.height * 0.995),
    new THREE.MeshBasicMaterial({
      color: 0xf9f8f3,
      transparent: true,
      opacity: 0.08,
    })
  );
  innerGlow.position.z = -0.2;
  glassGroup.add(innerGlow);

  const grainGeometry = new THREE.SphereGeometry(1, 36, 36);
  const grains = [];
  const grainCount = 16;

  for (let index = 0; index < grainCount; index += 1) {
    const [base, shadow] = palette[index % palette.length];
    const radius = THREE.MathUtils.lerp(0.38, 0.9, (index % 6) / 5);
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(base),
      emissive: new THREE.Color(base).multiplyScalar(0.06),
      roughness: 0.78,
      metalness: 0.02,
      clearcoat: 0.08,
    });

    const mesh = new THREE.Mesh(grainGeometry, material);
    mesh.scale.setScalar(radius);
    mesh.position.set(
      THREE.MathUtils.randFloat(-3.35, 3.35),
      THREE.MathUtils.randFloat(2.6, 5.7),
      THREE.MathUtils.randFloat(-0.55, 0.55)
    );
    scene.add(mesh);

    const rim = new THREE.Mesh(
      grainGeometry,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(shadow),
        transparent: true,
        opacity: 0.18,
      })
    );
    rim.scale.setScalar(radius * 1.03);
    rim.position.copy(mesh.position);
    scene.add(rim);

    grains.push({
      radius,
      mesh,
      rim,
      velocity: new THREE.Vector2(
        THREE.MathUtils.randFloatSpread(0.4),
        THREE.MathUtils.randFloatSpread(0.25)
      ),
      spin: THREE.MathUtils.randFloat(0.4, 1.1),
    });
  }

  const raycaster = new THREE.Raycaster();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const dragIntersection = new THREE.Vector3();

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    state.width = Math.max(bounds.width, 1);
    state.height = Math.max(bounds.height, 1);

    renderer.setSize(state.width, state.height, false);

    const aspect = state.width / state.height;
    const viewHeight = 11.2;
    const viewWidth = viewHeight * aspect;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  }

  function updatePointer(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    state.pointer.set(x, y);
  }

  function onPointerDown(event) {
    state.pointerDown = true;
    updatePointer(event);

    raycaster.setFromCamera(state.pointer, camera);
    const hits = raycaster.intersectObjects(grains.map((grain) => grain.mesh));
    if (hits.length > 0) {
      state.dragIndex = grains.findIndex((grain) => grain.mesh === hits[0].object);
    }
  }

  function onPointerMove(event) {
    updatePointer(event);
  }

  function endPointer() {
    state.pointerDown = false;
    state.dragIndex = -1;
  }

  function keepInside(grain) {
    const left = -container.width / 2 + grain.radius + container.radius * 0.26;
    const right = container.width / 2 - grain.radius - container.radius * 0.26;
      const bottom = -container.height / 2 + grain.radius + container.radius * 0.18;
    const top = container.height / 2 - grain.radius - container.radius * 0.2;

    if (grain.mesh.position.x < left) {
      grain.mesh.position.x = left;
      grain.velocity.x *= -0.82;
    } else if (grain.mesh.position.x > right) {
      grain.mesh.position.x = right;
      grain.velocity.x *= -0.82;
    }

    if (grain.mesh.position.y < bottom) {
      grain.mesh.position.y = bottom;
      grain.velocity.y *= -container.floorBounce;
      grain.velocity.x *= 0.98;
    } else if (grain.mesh.position.y > top) {
      grain.mesh.position.y = top;
      grain.velocity.y *= -0.68;
    }
  }

  function solveCollisions() {
    for (let i = 0; i < grains.length; i += 1) {
      for (let j = i + 1; j < grains.length; j += 1) {
        const a = grains[i];
        const b = grains[j];
        const dx = b.mesh.position.x - a.mesh.position.x;
        const dy = b.mesh.position.y - a.mesh.position.y;
        const distanceSq = dx * dx + dy * dy;
        const minDistance = a.radius + b.radius;

        if (distanceSq === 0 || distanceSq >= minDistance * minDistance) {
          continue;
        }

        const distance = Math.sqrt(distanceSq);
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDistance - distance;
        const correction = overlap * 0.5;

        a.mesh.position.x -= nx * correction;
        a.mesh.position.y -= ny * correction;
        b.mesh.position.x += nx * correction;
        b.mesh.position.y += ny * correction;

        const relativeVelocityX = b.velocity.x - a.velocity.x;
        const relativeVelocityY = b.velocity.y - a.velocity.y;
        const separatingVelocity = relativeVelocityX * nx + relativeVelocityY * ny;

        if (separatingVelocity > 0) {
          continue;
        }

        const impulse = separatingVelocity * -0.78;
        a.velocity.x -= impulse * nx;
        a.velocity.y -= impulse * ny;
        b.velocity.x += impulse * nx;
        b.velocity.y += impulse * ny;
      }
    }
  }

  function animate() {
    const delta = Math.min(state.clock.getDelta(), 1 / 30);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0, 0.04);
    camera.lookAt(0, 0, 0);

    glassGroup.rotation.y = THREE.MathUtils.lerp(glassGroup.rotation.y, 0, 0.05);
    glassGroup.rotation.x = THREE.MathUtils.lerp(glassGroup.rotation.x, 0, 0.05);

    for (let index = 0; index < grains.length; index += 1) {
      const grain = grains[index];

      if (state.pointerDown && state.dragIndex === index) {
        raycaster.setFromCamera(state.pointer, camera);
        raycaster.ray.intersectPlane(dragPlane, dragIntersection);
        grain.mesh.position.x = THREE.MathUtils.clamp(
          dragIntersection.x,
          -container.width / 2 + grain.radius,
          container.width / 2 - grain.radius
        );
        grain.mesh.position.y = THREE.MathUtils.clamp(
          dragIntersection.y,
          -container.height / 2 + grain.radius,
          container.height / 2 - grain.radius
        );
        grain.velocity.x = 0;
        grain.velocity.y = 0;
      } else {
        grain.velocity.y += -11.8 * delta;
        grain.velocity.multiplyScalar(0.995);

        grain.mesh.position.x += grain.velocity.x * delta;
        grain.mesh.position.y += grain.velocity.y * delta;
      }

      keepInside(grain);

      grain.mesh.rotation.x += grain.spin * delta * 0.45;
      grain.mesh.rotation.y += grain.spin * delta * 0.32;

      grain.rim.position.copy(grain.mesh.position);
      grain.rim.position.z = grain.mesh.position.z - 0.04;
    }

    solveCollisions();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resize);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => {
    state.pointer.set(0, 0);
  });

  resize();
  animate();
}

function createRoundedRect(x, y, width, height, radius) {
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}
