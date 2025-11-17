// Enhanced 3D Truck Visualization with Measurement Tools and Advanced Controls

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';

class Enhanced3DVisualization {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.width = this.container.offsetWidth || 800;
        this.height = 600;
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 1, 10000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        this.controls = null;
        this.selectedItem = null;
        this.measurementMode = false;
        this.measurementPoints = [];
        this.measurements = [];
        this.itemMeshes = [];
        this.truckMeshes = [];
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.init();
    }
    
    init() {
        // Clear container
        this.container.innerHTML = '';
        
        // Create control panel
        this.createControlPanel();
        
        // Setup Three.js scene
        this.scene.background = new THREE.Color(0xf8f9fa);
        
        // Setup camera
        this.camera.position.set(800, 600, 1200);
        this.camera.lookAt(0, 0, 0);
        
        // Setup renderer
        this.renderer.setSize(this.width, this.height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
        
        // Setup lighting
        this.setupLighting();
        
        // Setup controls
        this.setupControls();
        
        // Setup interaction
        this.setupInteraction();
        
        // Add grid and axes helpers
        this.addHelpers();
    }
    
    createControlPanel() {
        const controlPanel = document.createElement('div');
        controlPanel.className = 'truck-3d-controls';
        controlPanel.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(255, 255, 255, 0.9);
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            min-width: 200px;
            font-family: Arial, sans-serif;
            z-index: 1000;
        `;
        
        controlPanel.innerHTML = `
            <h5 style="margin: 0 0 10px 0; color: #333;">3D Controls</h5>
            
            <div style="margin-bottom: 10px;">
                <button id="measurementBtn" class="btn btn-sm btn-outline-primary">
                    📏 Measure Tool
                </button>
            </div>
            
            <div style="margin-bottom: 10px;">
                <button id="resetViewBtn" class="btn btn-sm btn-outline-secondary">
                    🔄 Reset View
                </button>
            </div>
            
            <div style="margin-bottom: 10px;">
                <button id="topViewBtn" class="btn btn-sm btn-outline-info">
                    ⬆️ Top View
                </button>
            </div>
            
            <div style="margin-bottom: 10px;">
                <button id="sideViewBtn" class="btn btn-sm btn-outline-info">
                    ➡️ Side View
                </button>
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: flex; align-items: center; font-size: 12px;">
                    <input type="checkbox" id="wireframeToggle" style="margin-right: 5px;">
                    Wireframe Mode
                </label>
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: flex; align-items: center; font-size: 12px;">
                    <input type="checkbox" id="transparencyToggle" style="margin-right: 5px;">
                    Transparency
                </label>
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: flex; align-items: center; font-size: 12px;">
                    <input type="checkbox" id="labelsToggle" checked style="margin-right: 5px;">
                    Show Labels
                </label>
            </div>
            
            <div id="selectionInfo" style="margin-top: 10px; font-size: 11px; color: #666;">
                Click on items to select and measure
            </div>
        `;
        
        this.container.appendChild(controlPanel);
        
        // Add event listeners
        this.setupControlEvents();
    }
    
    setupControlEvents() {
        document.getElementById('measurementBtn').addEventListener('click', () => {
            this.toggleMeasurementMode();
        });
        
        document.getElementById('resetViewBtn').addEventListener('click', () => {
            this.resetView();
        });
        
        document.getElementById('topViewBtn').addEventListener('click', () => {
            this.setTopView();
        });
        
        document.getElementById('sideViewBtn').addEventListener('click', () => {
            this.setSideView();
        });
        
        document.getElementById('wireframeToggle').addEventListener('change', (e) => {
            this.toggleWireframe(e.target.checked);
        });
        
        document.getElementById('transparencyToggle').addEventListener('change', (e) => {
            this.toggleTransparency(e.target.checked);
        });
        
        document.getElementById('labelsToggle').addEventListener('change', (e) => {
            this.toggleLabels(e.target.checked);
        });
    }
    
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        // Directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1000, 1000, 1000);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
        
        // Point light for better illumination
        const pointLight = new THREE.PointLight(0xffffff, 0.3, 2000);
        pointLight.position.set(-500, 500, 500);
        this.scene.add(pointLight);
    }
    
    setupControls() {
        import('https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/controls/OrbitControls.js').then(module => {
            this.controls = new module.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.screenSpacePanning = false;
            this.controls.minDistance = 100;
            this.controls.maxDistance = 3000;
            this.controls.maxPolarAngle = Math.PI;
            
            this.animate();
        });
    }
    
    setupInteraction() {
        this.renderer.domElement.addEventListener('click', (event) => {
            this.onMouseClick(event);
        });
        
        this.renderer.domElement.addEventListener('mousemove', (event) => {
            this.onMouseMove(event);
        });
    }
    
    addHelpers() {
        // Grid helper
        const gridHelper = new THREE.GridHelper(1000, 20, 0x444444, 0x888888);
        gridHelper.position.y = 0;
        this.scene.add(gridHelper);
        
        // Axes helper
        const axesHelper = new THREE.AxesHelper(200);
        this.scene.add(axesHelper);
    }
    
    renderTruck(resultData) {
        // Clear previous meshes
        this.clearScene();
        
        resultData.forEach((bin, binIdx) => {
            // Create truck outline
            this.createTruckOutline(bin, binIdx);
            
            // Create packed items
            bin.fitted_items.forEach((item, itemIdx) => {
                this.createPackedItem(item, itemIdx, binIdx);
            });
        });
        
        // Update camera to fit the scene
        this.fitCameraToScene();
    }
    
    createTruckOutline(bin, binIdx) {
        const truckGeometry = new THREE.BoxGeometry(bin.length || 600, bin.width || 250, bin.height || 250);
        const truckMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x666666, 
            wireframe: true,
            transparent: true,
            opacity: 0.3
        });
        
        const truckMesh = new THREE.Mesh(truckGeometry, truckMaterial);
        truckMesh.position.set(
            (bin.length || 600) / 2,
            (bin.height || 250) / 2,
            (bin.width || 250) / 2
        );
        
        truckMesh.userData = { type: 'truck', binIndex: binIdx, name: bin.bin_name };
        this.scene.add(truckMesh);
        this.truckMeshes.push(truckMesh);
        
        // Add truck label
        this.addLabel(truckMesh, bin.bin_name || `Truck ${binIdx + 1}`, 0x333333);
    }
    
    createPackedItem(item, itemIdx, binIdx) {
        const geometry = new THREE.BoxGeometry(item.depth, item.height, item.width);
        
        // Create material with item-specific color
        const color = new THREE.Color(item.color || '#2194ce');
        const material = new THREE.MeshPhongMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.8,
            shininess: 30
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Set position
        mesh.position.set(
            item.position[0] + item.depth / 2,
            item.position[2] + item.height / 2,
            item.position[1] + item.width / 2
        );
        
        // Enable shadows
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Store metadata
        mesh.userData = { 
            type: 'item', 
            itemIndex: itemIdx, 
            binIndex: binIdx,
            name: item.name,
            dimensions: { width: item.width, height: item.height, depth: item.depth },
            position: item.position,
            originalColor: color.clone()
        };
        
        this.scene.add(mesh);
        this.itemMeshes.push(mesh);
        
        // Add item label (initially hidden)
        this.addLabel(mesh, item.name, 0x000000, false);
    }
    
    addLabel(mesh, text, color = 0x000000, visible = true) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        context.fillStyle = 'rgba(255, 255, 255, 0.9)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        context.font = '16px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        sprite.position.copy(mesh.position);
        sprite.position.y += mesh.geometry.parameters.height / 2 + 20;
        sprite.scale.set(100, 25, 1);
        sprite.visible = visible;
        
        mesh.userData.label = sprite;
        this.scene.add(sprite);
    }
    
    onMouseClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.itemMeshes);
        
        if (intersects.length > 0) {
            const selectedMesh = intersects[0].object;
            this.selectItem(selectedMesh);
            
            if (this.measurementMode) {
                this.addMeasurementPoint(intersects[0].point);
            }
        } else {
            this.deselectItem();
        }
    }
    
    onMouseMove(event) {
        if (!this.measurementMode) return;
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects([...this.itemMeshes, ...this.truckMeshes]);
        
        if (intersects.length > 0) {
            this.renderer.domElement.style.cursor = 'crosshair';
        } else {
            this.renderer.domElement.style.cursor = 'default';
        }
    }
    
    selectItem(mesh) {
        // Deselect previous item
        this.deselectItem();
        
        // Select new item
        this.selectedItem = mesh;
        mesh.material.emissive.setHex(0x444444);
        
        // Show selection info
        const info = mesh.userData;
        document.getElementById('selectionInfo').innerHTML = `
            <strong>Selected:</strong> ${info.name}<br>
            <small>Dimensions: ${info.dimensions.width.toFixed(1)} × ${info.dimensions.height.toFixed(1)} × ${info.dimensions.depth.toFixed(1)}</small><br>
            <small>Position: (${info.position[0].toFixed(1)}, ${info.position[1].toFixed(1)}, ${info.position[2].toFixed(1)})</small>
        `;
    }
    
    deselectItem() {
        if (this.selectedItem) {
            this.selectedItem.material.emissive.setHex(0x000000);
            this.selectedItem = null;
            document.getElementById('selectionInfo').innerHTML = 'Click on items to select and measure';
        }
    }
    
    toggleMeasurementMode() {
        this.measurementMode = !this.measurementMode;
        const btn = document.getElementById('measurementBtn');
        
        if (this.measurementMode) {
            btn.innerHTML = '📏 Measuring...';
            btn.className = 'btn btn-sm btn-warning';
            this.renderer.domElement.style.cursor = 'crosshair';
        } else {
            btn.innerHTML = '📏 Measure Tool';
            btn.className = 'btn btn-sm btn-outline-primary';
            this.renderer.domElement.style.cursor = 'default';
            this.clearMeasurements();
        }
    }
    
    addMeasurementPoint(point) {
        this.measurementPoints.push(point.clone());
        
        // Create visual marker
        const markerGeometry = new THREE.SphereGeometry(5, 8, 6);
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(point);
        this.scene.add(marker);
        
        if (this.measurementPoints.length === 2) {
            this.createMeasurement();
            this.measurementPoints = [];
        }
    }
    
    createMeasurement() {
        const [point1, point2] = this.measurementPoints;
        const distance = point1.distanceTo(point2);
        
        // Create line
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([point1, point2]);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        this.scene.add(line);
        
        // Create distance label
        const midPoint = point1.clone().add(point2).multiplyScalar(0.5);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 32;
        
        context.fillStyle = 'rgba(255, 255, 255, 0.9)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.fillStyle = '#ff0000';
        context.font = '14px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`${distance.toFixed(1)} cm`, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(midPoint);
        sprite.scale.set(60, 15, 1);
        this.scene.add(sprite);
        
        this.measurements.push({ line, sprite });
    }
    
    clearMeasurements() {
        this.measurements.forEach(measurement => {
            this.scene.remove(measurement.line);
            this.scene.remove(measurement.sprite);
        });
        this.measurements = [];
        this.measurementPoints = [];
    }
    
    resetView() {
        this.camera.position.set(800, 600, 1200);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) {
            this.controls.reset();
        }
    }
    
    setTopView() {
        this.camera.position.set(0, 1500, 0);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) {
            this.controls.update();
        }
    }
    
    setSideView() {
        this.camera.position.set(1500, 200, 0);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) {
            this.controls.update();
        }
    }
    
    toggleWireframe(enabled) {
        this.itemMeshes.forEach(mesh => {
            mesh.material.wireframe = enabled;
        });
    }
    
    toggleTransparency(enabled) {
        this.itemMeshes.forEach(mesh => {
            mesh.material.opacity = enabled ? 0.5 : 0.8;
        });
    }
    
    toggleLabels(enabled) {
        this.itemMeshes.forEach(mesh => {
            if (mesh.userData.label) {
                mesh.userData.label.visible = enabled;
            }
        });
        this.truckMeshes.forEach(mesh => {
            if (mesh.userData.label) {
                mesh.userData.label.visible = enabled;
            }
        });
    }
    
    fitCameraToScene() {
        const box = new THREE.Box3().setFromObject(this.scene);
        const size = box.getSize(new THREE.Vector3()).length();
        const center = box.getCenter(new THREE.Vector3());
        
        this.camera.position.copy(center);
        this.camera.position.x += size;
        this.camera.position.y += size * 0.5;
        this.camera.position.z += size;
        this.camera.lookAt(center);
        
        if (this.controls) {
            this.controls.target.copy(center);
            this.controls.update();
        }
    }
    
    clearScene() {
        // Remove previous meshes
        [...this.itemMeshes, ...this.truckMeshes].forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.userData.label) {
                this.scene.remove(mesh.userData.label);
            }
        });
        
        this.itemMeshes = [];
        this.truckMeshes = [];
        this.clearMeasurements();
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.controls) {
            this.controls.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    // Export functionality
    exportScene() {
        const canvas = this.renderer.domElement;
        const link = document.createElement('a');
        link.download = 'truck-packing-visualization.png';
        link.href = canvas.toDataURL();
        link.click();
    }
}

// Export the enhanced visualization class
export { Enhanced3DVisualization };

// Backward compatibility function
export function renderTruckVisualizationEnhanced(containerId, resultData) {
    const visualization = new Enhanced3DVisualization(containerId);
    visualization.renderTruck(resultData);
    return visualization;
}