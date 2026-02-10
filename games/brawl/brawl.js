import { db, ref, update, onValue, off, set, remove } from '../../js/firebase-config.js';
import * as THREE from 'https://esm.sh/three@0.160.0';
import { FBXLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader';

let scene, camera, renderer, clock;
let myPlayerModel; 
let mixer; 
let runAction;
let animationId;
let containerEl;
let joystick = { x: 0, y: 0 };
let keys = { w: false, a: false, s: false, d: false };

let myId = null;
let roomId = null;

export function initGame(container, _roomId, _userId, isHost) {
    containerEl = container;
    roomId = _roomId;
    myId = _userId;
    clock = new THREE.Clock(); 

    container.innerHTML = `
        <div id="rotate-warning">
            <div class="rotate-icon">📱 ➔ 📺</div>
            <p>Поверни телефон!</p>
        </div>

        <div id="brawl-container">
            
            <div id="start-screen">
                <button id="fullscreen-btn">НАЧАТЬ ИГРУ ⚔️</button>
            </div>

            <div id="game-ui">
                <div id="custom-exit-btn">✕</div>
                <div id="loading-text" style="display:none;">Загрузка...</div>
                
                <div id="joystick-zone">
                    <div id="joystick-nub"></div>
                </div>
            </div>
        </div>
    `;

    // Логика кнопки старта (Full Screen)
    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        const elem = document.documentElement;
        // Пытаемся включить полный экран
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        }
        // Скрываем кнопку
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('loading-text').style.display = 'block';
    });

    // Кнопка выхода
    document.getElementById('custom-exit-btn').addEventListener('click', () => {
        // Выход из фулскрина при закрытии
        if (document.exitFullscreen) document.exitFullscreen();
        
        const mainCloseBtn = document.getElementById('close-fullscreen-btn');
        if (mainCloseBtn) mainCloseBtn.click();
    });

    initThreeJS();
    setupControls();
    animate();
}

function initThreeJS() {
    const gameDiv = document.getElementById('brawl-container');
    if (!gameDiv) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 5, 40);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.4, 1.8);
    camera.lookAt(0, 0.8, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    gameDiv.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    const grid = new THREE.GridHelper(100, 100, 0x444444, 0x111111);
    scene.add(grid);

    // ЗАГРУЗКА
    const textureLoader = new THREE.TextureLoader();
    const loader = new FBXLoader();

    const textureUrl = 'assets/models/Poly_Cock_01.png'; // Проверь имя!

    const texture = textureLoader.load(textureUrl, undefined, undefined, (err) => {});

    loader.load('assets/models/cock.fbx', 
        (object) => {
            const loadText = document.getElementById('loading-text');
            if (loadText) loadText.style.display = 'none';

            myPlayerModel = object;

            myPlayerModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        if (texture && texture.image) {
                            child.material.map = texture;
                        } else {
                            child.material.color.setHex(0xaaaaaa);
                        }
                        child.material.shininess = 0; 
                        child.material.needsUpdate = true;
                    }
                }
            });

            myPlayerModel.scale.set(0.01, 0.01, 0.01); 
            scene.add(myPlayerModel);

            if (object.animations && object.animations.length > 0) {
                mixer = new THREE.AnimationMixer(myPlayerModel);
                runAction = mixer.clipAction(object.animations[0]);
                runAction.play(); 
                runAction.paused = true; 
            }
        },
        undefined,
        (error) => { console.error(error); }
    );

    window.addEventListener('resize', onWindowResize);
}

function setupControls() {
    // ПК
    window.addEventListener('keydown', (e) => {
        if (e.key === 'w') keys.w = true;
        if (e.key === 'a') keys.a = true;
        if (e.key === 's') keys.s = true;
        if (e.key === 'd') keys.d = true;
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'w') keys.w = false;
        if (e.key === 'a') keys.a = false;
        if (e.key === 's') keys.s = false;
        if (e.key === 'd') keys.d = false;
    });

    // ТЕЛЕФОН (Джойстик)
    const zone = document.getElementById('joystick-zone');
    const nub = document.getElementById('joystick-nub');
    if (!zone || !nub) return;

    let touchId = null;
    let startX, startY;
    
    // УМЕНЬШИЛ РАДИУС ДЕЙСТВИЯ (Размер круга / 2 - Размер пипки / 2)
    // 100px / 2 = 50. Пипка 35 / 2 = 17.5.  50 - 17.5 = 32.5.
    const maxRadius = 35; 

    zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0]; 
        touchId = touch.identifier;
        startX = touch.clientX;
        startY = touch.clientY;
        joystick = { x: 0, y: 0 };
        
        nub.style.transition = 'none';
        nub.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                const touch = e.changedTouches[i];
                let dx = touch.clientX - startX;
                let dy = touch.clientY - startY;
                
                const distance = Math.sqrt(dx*dx + dy*dy);
                if (distance > maxRadius) {
                    const ratio = maxRadius / distance;
                    dx *= ratio;
                    dy *= ratio;
                }

                nub.style.transform = `translate(${dx}px, ${dy}px)`;
                joystick.x = dx / maxRadius;
                joystick.y = dy / maxRadius;
                break;
            }
        }
    }, { passive: false });

    zone.addEventListener('touchend', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                joystick = { x: 0, y: 0 };
                touchId = null;
                nub.style.transition = 'transform 0.1s';
                nub.style.transform = `translate(0px, 0px)`;
                nub.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                break;
            }
        }
    }, { passive: false });
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    animationId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    let moveX = 0;
    let moveZ = 0;

    if (keys.w) moveZ = -1;
    if (keys.s) moveZ = 1;
    if (keys.a) moveX = -1;
    if (keys.d) moveX = 1;

    if (Math.abs(joystick.x) > 0.1 || Math.abs(joystick.y) > 0.1) {
        moveX = joystick.x;
        moveZ = joystick.y;
    }

    const isMoving = (moveX !== 0 || moveZ !== 0);

    if (myPlayerModel && isMoving) {
        const speed = 6 * delta; 
        myPlayerModel.position.x += moveX * speed;
        myPlayerModel.position.z += moveZ * speed;

        const angle = Math.atan2(moveX, moveZ);
        myPlayerModel.rotation.y = angle;

        camera.position.x = myPlayerModel.position.x;
        camera.position.z = myPlayerModel.position.z + 1.8;
        camera.lookAt(myPlayerModel.position.x, 0.8, myPlayerModel.position.z);
    }

    if (mixer) {
        if (runAction) runAction.paused = !isMoving;
        mixer.update(delta);
    }

    renderer.render(scene, camera);
}

export function cleanupGame() {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', onWindowResize);
    if (renderer) renderer.dispose();
    if (containerEl) containerEl.innerHTML = '';
}