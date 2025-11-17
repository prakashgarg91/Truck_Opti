// truck_3d.js - Three.js visualization for packed truck

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';

export function renderTruckVisualization(containerId, resultData) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const width = container.offsetWidth || 800;
    const height = 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
    camera.position.set(500, 500, 1000);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 500, 1000).normalize();
    scene.add(light);

    // Draw truck bins and items
    resultData.forEach((bin, binIdx) => {
        // Draw truck outline
        const truckGeometry = new THREE.BoxGeometry(bin.length, bin.width, bin.height);
        const truckMaterial = new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true });
        const truckMesh = new THREE.Mesh(truckGeometry, truckMaterial);
        truckMesh.position.set(bin.length / 2, bin.width / 2, bin.height / 2);
        scene.add(truckMesh);

        // Draw fitted items
        bin.fitted_items.forEach((item, itemIdx) => {
            const boxGeometry = new THREE.BoxGeometry(item.depth, item.width, item.height);
            const boxMaterial = new THREE.MeshPhongMaterial({ color: 0x2194ce, opacity: 0.8, transparent: true });
            const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
            boxMesh.position.set(
                item.position[0] + item.depth / 2,
                item.position[1] + item.width / 2,
                item.position[2] + item.height / 2
            );
            scene.add(boxMesh);
        });
    });

    // Controls (basic orbit)
    import('https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/controls/OrbitControls.js').then(module => {
        const controls = new module.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.update();
        animate();
        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
    });
}