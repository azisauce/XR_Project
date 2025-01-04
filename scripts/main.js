import * as CANNON from 'https://cdn.skypack.dev/cannon-es';

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const canvasEl = document.querySelector('#canvas');
const scoreResult = document.querySelector('#score-result');
const rollBtn = document.querySelector('#roll-btn');

let renderer, scene, camera, diceMesh, physicsWorld;

const params = {
    numberOfDice: 2,
    segments: 40,
    edgeRadius: .07,
    notchRadius: .12,
    notchDepth: .1,

    // Camera settings
    cameraDistance: 7, // Distance from the center
    minDistance: 5,    // Minimum distance from center
    maxDistance: 10    // Maximum distance from center
};

let isOrientationEnabled = false;
let initialOrientation = null;

const diceArray = [];

function handleDeviceOrientation(event) {
    if (!isOrientationEnabled) return;

    // Initialize reference orientation if not set
    if (!initialOrientation) {
        initialOrientation = {
            alpha: event.alpha || 0,
            beta: event.beta || 0,
            gamma: event.gamma || 0
        };
        return;
    }

    // Get the current orientation angles
    const alpha = event.alpha || 0;
    const beta = event.beta || 0;
    const gamma = event.gamma || 0;
    
    // Calculate relative angles (difference from initial orientation)
    let deltaAlpha = ((alpha - initialOrientation.alpha) * Math.PI) / 180;
    let deltaBeta = ((beta - initialOrientation.beta) * Math.PI) / 180;
    let deltaGamma = ((gamma - initialOrientation.gamma) * Math.PI) / 180;
    

    // Normalize deltaAlpha to keep it between -PI and PI
    deltaAlpha = ((deltaAlpha + Math.PI) % (2 * Math.PI)) - Math.PI;

    // Create quaternions for each rotation
    const quaternionY = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        deltaAlpha
    );
    const quaternionX = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        deltaBeta
    );
    const quaternionZ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        deltaGamma
    );

    // // Calculate camera position using spherical coordinates
    // const phi = beta;  // Vertical angle
    // const theta = alpha; // Horizontal angle
    
    // // Calculate camera position
    // const x = params.cameraDistance * Math.sin(phi) * Math.sin(theta);
    // const y = params.cameraDistance * Math.cos(phi);
    // const z = params.cameraDistance * Math.sin(phi) * Math.cos(theta);
    
    // Update camera position
     // Reset camera position and rotation
     camera.position.set(0, 0, params.cameraDistance);
     camera.quaternion.identity();
    // camera.position.set(x, y, z);

    // Apply rotations in the correct order
    camera.quaternion.multiply(quaternionY);    // First rotate around Y (left/right)
    camera.quaternion.multiply(quaternionX);    // Then rotate around X (up/down)
    camera.quaternion.multiply(quaternionZ);    // Finally apply the tilt
    
    camera.position.applyQuaternion(quaternionY.multiply(quaternionX));
    // // Make camera look at the center of the scene
    // camera.lookAt(0, 0, 0);
    
    // // Apply gamma rotation (device tilt)
    // camera.rotateZ(gamma);
}

async function requestOrientationPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                isOrientationEnabled = true;
                window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
                window.addEventListener('deviceorientation', handleDeviceOrientation, true);
            }
        } catch (error) {
            console.error('Error requesting device orientation permission:', error);
        }
    } else {
        // For devices that don't require permission
        isOrientationEnabled = true;
        window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    }
}

initPhysics();
initScene();

let isShaking = false;
let shakeTimer = null;
const SHAKE_THRESHOLD = 15;
const SHAKE_TIMEOUT = 500;

/**
 * Handles device motion events to detect shaking and trigger dice throw
 * @param {DeviceMotionEvent} event - The device motion event object
 * @returns {void}
 * 
 * @description
 * This function:
 * 1. Extracts acceleration data including gravity from the device motion event
 * 2. Calculates total acceleration using x, y, z components
 * 3. Detects shake gestures when acceleration exceeds threshold
 * 4. Implements a debounce timer to prevent multiple rapid shake detections
 * 5. Triggers dice throw when shake gesture is complete
 * 
 * @requires SHAKE_THRESHOLD - Global constant defining minimum acceleration for shake detection
 * @requires SHAKE_TIMEOUT - Global constant defining debounce timeout duration
 * @requires isShaking - Global variable tracking shake state
 * @requires shakeTimer - Global variable for debounce timeout
 * @requires throwDice - Global function to execute dice throw
 */

function handleDeviceMotion(event) {
    const acceleration = event.accelerationIncludingGravity;
    if (!acceleration) return;
    
    const x = acceleration.x || 0;
    const y = acceleration.y || 0;
    const z = acceleration.z || 0;
    
    const totalAcceleration = Math.sqrt(x * x + y * y + z * z);
    
    if (totalAcceleration > SHAKE_THRESHOLD) {
        isShaking = true;
        if (shakeTimer) {
            clearTimeout(shakeTimer);
        }
        shakeTimer = setTimeout(() => {
            if (isShaking) {
                isShaking = false;
                throwDice();
            }
        }, SHAKE_TIMEOUT);
    }
}
window.addEventListener('resize', updateSceneSize);
window.addEventListener('dblclick', throwDice);
rollBtn.addEventListener('click', throwDice);
window.addEventListener('devicemotion', handleDeviceMotion);


function initScene() {

    renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas: canvasEl
    });
    renderer.shadowMap.enabled = true
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        75, // Wider FOV for better immersion
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    camera.position.set(0, 0, params.cameraDistance);
    camera.lookAt(0, 0, 0);

    // camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, .1, 300)
    // camera.position.set(0, .5, 4).multiplyScalar(7);

    updateSceneSize();

    const ambientLight = new THREE.AmbientLight(0xffffff, .5);
    scene.add(ambientLight);

    const lights = [
        { pos: [10, 15, 0], intensity: 0.4 },
        { pos: [-10, 15, 0], intensity: 0.4 },
        { pos: [0, 15, 10], intensity: 0.4 },
        { pos: [0, 15, -10], intensity: 0.4 },
        { pos: [0, -15, 0], intensity: 0.2 }  // Bottom light for better visibility when looking down
    ];
    
    lights.forEach(light => {
        const pointLight = new THREE.PointLight(0xffffff, light.intensity);
        pointLight.position.set(...light.pos);
        pointLight.castShadow = true;
        pointLight.shadow.mapSize.width = 2048;
        pointLight.shadow.mapSize.height = 2048;
        pointLight.shadow.camera.near = 5;
        pointLight.shadow.camera.far = 400;
        scene.add(pointLight);
    });

    // const ambientLight = new THREE.AmbientLight(0xffffff, .5);
    // scene.add(ambientLight);
    // const topLight = new THREE.PointLight(0xffffff, .5);
    // topLight.position.set(10, 15, 0);
    // topLight.castShadow = true;
    // topLight.shadow.mapSize.width = 2048;
    // topLight.shadow.mapSize.height = 2048;
    // topLight.shadow.camera.near = 5;
    // topLight.shadow.camera.far = 400;
    // scene.add(topLight);
    
    createFloor();
    diceMesh = createDiceMesh();
    for (let i = 0; i < params.numberOfDice; i++) {
        diceArray.push(createDice());
        addDiceEvents(diceArray[i]);
    }

    requestOrientationPermission();

    throwDice();

    render();
}

function initPhysics() {
    physicsWorld = new CANNON.World({
        allowSleep: true,
        gravity: new CANNON.Vec3(0, -50, 0),
    })
    physicsWorld.defaultContactMaterial.restitution = .3;
}


function createFloor() {
    // const floor = new THREE.Mesh(
    //     new THREE.PlaneGeometry(1000, 1000),
    //     new THREE.ShadowMaterial({
    //         opacity: .1
    //     })
    // )

    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(20, 32), // Using circle instead of plane for better 360° view
        new THREE.ShadowMaterial({
            opacity: 0.2 // Slightly more visible
        })
    );

    floor.receiveShadow = true;
    floor.position.y = -7;
    floor.rotation.x = -Math.PI / 2;
    // floor.quaternion.setFromAxisAngle(new THREE.Vector3(-1, 0, 0), Math.PI * .5);
    scene.add(floor);

    const floorBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
    });
    floorBody.position.copy(floor.position);
    floorBody.quaternion.copy(floor.quaternion);
    physicsWorld.addBody(floorBody);
}

function createDiceMesh() {
    const boxMaterialOuter = new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
    })
    const boxMaterialInner = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0,
        metalness: 1,
        side: THREE.DoubleSide
    })

    const diceMesh = new THREE.Group();
    const innerMesh = new THREE.Mesh(createInnerGeometry(), boxMaterialInner);
    const outerMesh = new THREE.Mesh(createBoxGeometry(), boxMaterialOuter);
    outerMesh.castShadow = true;
    diceMesh.add(innerMesh, outerMesh);

    return diceMesh;
}

function createDice() {
    const mesh = diceMesh.clone();
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Box(new CANNON.Vec3(.5, .5, .5)),
        sleepTimeLimit: .1
    });
    physicsWorld.addBody(body);

    return {mesh, body};
}

/**
 * Creates a modified box geometry with rounded edges and notched surfaces.
 * 
 * @function createBoxGeometry
 * @returns {THREE.BufferGeometry} Modified box geometry with rounded edges and notches
 * 
 * @description
 * This function creates a box geometry and modifies it in the following ways:
 * 1. Rounds the edges based on params.edgeRadius
 * 2. Adds notches to the surfaces based on params.notchRadius and params.notchDepth
 * 
 * Uses helper functions:
 * - notchWave(v) - Creates a cosine wave pattern for notch depth calculation
 * - notch(pos) - Applies the notch wave pattern to a given position
 * 
 * @requires THREE - Three.js library
 * @requires BufferGeometryUtils - Three.js BufferGeometryUtils for vertex merging
 * 
 * @param {Object} params - Expected global parameters:
 * @param {number} params.segments - Number of segments for the box geometry
 * @param {number} params.edgeRadius - Radius for edge rounding
 * @param {number} params.notchRadius - Radius of the notch pattern
 * @param {number} params.notchDepth - Depth of the notches
 */
function createBoxGeometry() {

    let boxGeometry = new THREE.BoxGeometry(1, 1, 1, params.segments, params.segments, params.segments);

    const positionAttr = boxGeometry.attributes.position;
    const subCubeHalfSize = .5 - params.edgeRadius;


    for (let i = 0; i < positionAttr.count; i++) {

        let position = new THREE.Vector3().fromBufferAttribute(positionAttr, i);

        const subCube = new THREE.Vector3(Math.sign(position.x), Math.sign(position.y), Math.sign(position.z)).multiplyScalar(subCubeHalfSize);
        const addition = new THREE.Vector3().subVectors(position, subCube);

        if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.normalize().multiplyScalar(params.edgeRadius);
            position = subCube.add(addition);
        } else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize) {
            addition.z = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.x = subCube.x + addition.x;
            position.y = subCube.y + addition.y;
        } else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.y = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.x = subCube.x + addition.x;
            position.z = subCube.z + addition.z;
        } else if (Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.x = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.y = subCube.y + addition.y;
            position.z = subCube.z + addition.z;
        }

        const notchWave = (v) => {
            v = (1 / params.notchRadius) * v;
            v = Math.PI * Math.max(-1, Math.min(1, v));
            return params.notchDepth * (Math.cos(v) + 1.);
        }
        const notch = (pos) => notchWave(pos[0]) * notchWave(pos[1]);

        const offset = .23;

        if (position.y === .5) {
            position.y -= notch([position.x, position.z]);
        } else if (position.x === .5) {
            position.x -= notch([position.y + offset, position.z + offset]);
            position.x -= notch([position.y - offset, position.z - offset]);
        } else if (position.z === .5) {
            position.z -= notch([position.x - offset, position.y + offset]);
            position.z -= notch([position.x, position.y]);
            position.z -= notch([position.x + offset, position.y - offset]);
        } else if (position.z === -.5) {
            position.z += notch([position.x + offset, position.y + offset]);
            position.z += notch([position.x + offset, position.y - offset]);
            position.z += notch([position.x - offset, position.y + offset]);
            position.z += notch([position.x - offset, position.y - offset]);
        } else if (position.x === -.5) {
            position.x += notch([position.y + offset, position.z + offset]);
            position.x += notch([position.y + offset, position.z - offset]);
            position.x += notch([position.y, position.z]);
            position.x += notch([position.y - offset, position.z + offset]);
            position.x += notch([position.y - offset, position.z - offset]);
        } else if (position.y === -.5) {
            position.y += notch([position.x + offset, position.z + offset]);
            position.y += notch([position.x + offset, position.z]);
            position.y += notch([position.x + offset, position.z - offset]);
            position.y += notch([position.x - offset, position.z + offset]);
            position.y += notch([position.x - offset, position.z]);
            position.y += notch([position.x - offset, position.z - offset]);
        }

        positionAttr.setXYZ(i, position.x, position.y, position.z);
    }


    boxGeometry.deleteAttribute('normal');
    boxGeometry.deleteAttribute('uv');
    boxGeometry = BufferGeometryUtils.mergeVertices(boxGeometry);

    boxGeometry.computeVertexNormals();

    return boxGeometry;
}

/**
 * Creates a merged buffer geometry consisting of six planes arranged in a cube-like formation.
 * Each plane is positioned and rotated to form the inner surfaces of a dice.
 * The planes are offset from the center and sized according to the edge radius parameter.
 * 
 * @returns {THREE.BufferGeometry} A merged buffer geometry of six transformed planes.
 * @requires THREE
 * @requires BufferGeometryUtils
 */
function createInnerGeometry() {
    const baseGeometry = new THREE.PlaneGeometry(1 - 2 * params.edgeRadius, 1 - 2 * params.edgeRadius);
    const offset = .48;
    return BufferGeometryUtils.mergeBufferGeometries([
        baseGeometry.clone().translate(0, 0, offset),
        baseGeometry.clone().translate(0, 0, -offset),
        baseGeometry.clone().rotateX(.5 * Math.PI).translate(0, -offset, 0),
        baseGeometry.clone().rotateX(.5 * Math.PI).translate(0, offset, 0),
        baseGeometry.clone().rotateY(.5 * Math.PI).translate(-offset, 0, 0),
        baseGeometry.clone().rotateY(.5 * Math.PI).translate(offset, 0, 0),
    ], false);
}

/**
 * Adds event listeners to handle dice rolling results when the dice comes to rest
 * @param {Object} dice - The dice object containing a physics body
 * @param {CANNON.Body} dice.body - The physics body of the dice
 * @description This function adds a 'sleep' event listener to the dice's physics body.
 * When the dice stops moving (enters sleep state), it calculates the orientation
 * using Euler angles to determine which face is up. The function then calls
 * showRollResults with the corresponding dice value (1-6). If the dice lands
 * on an edge, it allows the physics simulation to continue until the dice
 * falls on a face.
 */
function addDiceEvents(dice) {
    dice.body.addEventListener('sleep', (e) => {

        dice.body.allowSleep = false;

        const euler = new CANNON.Vec3();
        e.target.quaternion.toEuler(euler);

        const eps = .1;
        let isZero = (angle) => Math.abs(angle) < eps;
        let isHalfPi = (angle) => Math.abs(angle - .5 * Math.PI) < eps;
        let isMinusHalfPi = (angle) => Math.abs(.5 * Math.PI + angle) < eps;
        let isPiOrMinusPi = (angle) => (Math.abs(Math.PI - angle) < eps || Math.abs(Math.PI + angle) < eps);


        if (isZero(euler.z)) {
            if (isZero(euler.x)) {
                showRollResults(1);
            } else if (isHalfPi(euler.x)) {
                showRollResults(4);
            } else if (isMinusHalfPi(euler.x)) {
                showRollResults(3);
            } else if (isPiOrMinusPi(euler.x)) {
                showRollResults(6);
            } else {
                // landed on edge => wait to fall on side and fire the event again
                dice.body.allowSleep = true;
            }
        } else if (isHalfPi(euler.z)) {
            showRollResults(2);
        } else if (isMinusHalfPi(euler.z)) {
            showRollResults(5);
        } else {
            // landed on edge => wait to fall on side and fire the event again
            dice.body.allowSleep = true;
        }
    });
}

function showRollResults(score) {
    let isSummable = false
    if (scoreResult.innerHTML === '') {
        scoreResult.innerHTML += score;
    } else {
        scoreResult.innerHTML += ('+' + score);
        isSummable = true;
    }
    if (isSummable) {
        const scores = scoreResult.innerHTML.split('+').map(Number);
        const sum = scores.reduce((a, b) => a + b, 0);
        scoreResult.innerHTML += ` = ${sum} !`;
    }
}

/**
 * Renders the physics simulation and updates the visual representation of dice.
 * This function is called recursively using requestAnimationFrame to create a continuous animation loop.
 * Updates the position and rotation of each dice mesh based on its physics body state,
 * steps the physics world simulation forward, and renders the scene.
 * @function render
 * @returns {void}
 */
function render() {
    physicsWorld.fixedStep();

    for (const dice of diceArray) {
        dice.mesh.position.copy(dice.body.position)
        dice.mesh.quaternion.copy(dice.body.quaternion)
    }

    renderer.render(scene, camera);
    requestAnimationFrame(render);
}

function updateSceneSize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function throwDice() {
    scoreResult.innerHTML = '';

    diceArray.forEach((d, dIdx) => {

        d.body.velocity.setZero();
        d.body.angularVelocity.setZero();

        d.body.position = new CANNON.Vec3(6, dIdx * 1.5, 0);
        d.mesh.position.copy(d.body.position);

        d.mesh.rotation.set(2 * Math.PI * Math.random(), 0, 2 * Math.PI * Math.random())
        d.body.quaternion.copy(d.mesh.quaternion);

        const force = 3 + 5 * Math.random();
        d.body.applyImpulse(
            new CANNON.Vec3(-force, force, 0),
            new CANNON.Vec3(0, 0, .2)
        );

        d.body.allowSleep = true;
    });
}