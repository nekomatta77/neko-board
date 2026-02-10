import { db, ref, update, onValue, off, set, remove } from '../../js/firebase-config.js';

// --- ИСПРАВЛЕНИЕ ОШИБКИ ЗАГРУЗКИ ---
// Используем прямые ссылки, чтобы телефон точно их увидел
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

    // Добавляем экран поворота в HTML
    container.innerHTML = `
        <div id="rotate-warning">
            <div class="rotate-icon">📱 ➔ 📺</div>
            <p>Пожалуйста, поверните устройство<br>горизонтально для игры</p>
        </div>

        <div id="brawl-container">
            <div id="game-ui">
                <div style="position:absolute; top:10px; left:10px; color:white; font-family:sans-serif; text-shadow:1px 1px 0 #000; pointer-events:none;">
                    <b>Brawl Mode</b><br>
                    <span id="loading-text">Загрузка ресурсов...</span>
                </div>
                <div id="joystick-zone"></div>
            </div>
        </div>
    `;

    initThreeJS();
    setupControls();
    animate();
}

function initThreeJS() {
    const gameDiv = document.getElementById('brawl-container');
    if (!gameDiv) return;

    // СЦЕНА
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2b2b35);
    scene.fog = new THREE.Fog(0x2b2b35, 1, 30);

    // КАМЕРА
    camera = new THREE.PerspectiveCamera(60, gameDiv.clientWidth / gameDiv.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.4, 1.8);
    camera.lookAt(0, 0.8, 0);

    // РЕНДЕРЕР
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(gameDiv.clientWidth, gameDiv.clientHeight);
    renderer.shadowMap.enabled = true;
    gameDiv.appendChild(renderer.domElement);

    // СВЕТ
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(3, 8, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // ПОЛ
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    const grid = new THREE.GridHelper(60, 60, 0x555555, 0x222222);
    scene.add(grid);

    // ЗАГРУЗКА
    const textureLoader = new THREE.TextureLoader();
    const loader = new FBXLoader();

    // !!! ПРОВЕРЬ ИМЯ ФАЙЛА КАРТИНКИ В ПАПКЕ assets/models !!!
    // Например: 'assets/models/Cock_Texture.png' или 'assets/models/texture.jpg'
    // Если картинка не загрузится, модель будет черной, но игра не вылетит.
    const texture = textureLoader.load('assets/models/Poly_Cock_01.png', 
        () => console.log("Текстура загружена"),
        undefined,
        (err) => console.log("Ошибка текстуры (модель будет черной)", err)
    );

    loader.load('assets/models/cock.fbx', 
        (object) => {
            console.log("Модель загружена");
            const loadingText = document.getElementById('loading-text');
            if (loadingText) loadingText.textContent = "Готово!";

            myPlayerModel = object;

            myPlayerModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    // Применяем текстуру
                    if (child.material) {
                         child.material.map = texture;
                         child.material.needsUpdate = true;
                         child.material.shininess = 0; 
                    }
                }
            });

            myPlayerModel.scale.set(0.01, 0.01, 0.01); 
            scene.add(myPlayerModel);

            // Анимация
            if (object.animations && object.animations.length > 0) {
                mixer = new THREE.AnimationMixer(myPlayerModel);
                runAction = mixer.clipAction(object.animations[0]);
                runAction.play(); 
                runAction.paused = true; // Стоим по умолчанию
            }
        },
        undefined,
        (error) => {
            console.error(error);
            const loadingText = document.getElementById('loading-text');
            if (loadingText) loadingText.textContent = "Ошибка загрузки FBX";
        }
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
    if (!zone) return;

    let touchId = null;
    let startX, startY;

    zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        // Берем только первый палец, коснувшийся джойстика
        const touch = e.changedTouches[0]; 
        touchId = touch.identifier;
        startX = touch.clientX;
        startY = touch.clientY;
        joystick = { x: 0, y: 0 };
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        // Ищем наш палец
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                const touch = e.changedTouches[i];
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;
                joystick.x = Math.max(-1, Math.min(1, dx / 40)); 
                joystick.y = Math.max(-1, Math.min(1, dy / 40));
                break;
            }
        }
    }, { passive: false });

    zone.addEventListener('touchend', (e) => {
        e.preventDefault();
        // Если подняли "наш" палец - сброс
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                joystick = { x: 0, y: 0 };
                touchId = null;
                break;
            }
        }
    }, { passive: false });
}

function onWindowResize() {
    if (!camera || !renderer || !containerEl) return;
    const gameDiv = document.getElementById('brawl-container');
    // Если игра скрыта (портретный режим), размер может быть 0, игнорируем
    if (!gameDiv || gameDiv.clientHeight === 0) return;
    
    camera.aspect = gameDiv.clientWidth / gameDiv.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(gameDiv.clientWidth, gameDiv.clientHeight);
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

    if (joystick.x !== 0 || joystick.y !== 0) {
        moveX = joystick.x;
        moveZ = joystick.y;
    }

    const isMoving = (moveX !== 0 || moveZ !== 0);

    if (myPlayerModel && isMoving) {
        const speed = 5 * delta;
        myPlayerModel.position.x += moveX * speed;
        myPlayerModel.position.z += moveZ * speed;

        const angle = Math.atan2(moveX, moveZ);
        myPlayerModel.rotation.y = angle;

        camera.position.x = myPlayerModel.position.x;
        camera.position.z = myPlayerModel.position.z + 1.8;
        camera.lookAt(myPlayerModel.position.x, 0.8, myPlayerModel.position.z);
    }

    if (mixer) {
        if (runAction) {
            runAction.paused = !isMoving;
        }
        mixer.update(delta);
    }

    renderer.render(scene, camera);
}

export function cleanupGame() {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', onWindowResize);
    window.onkeydown = null;
    window.onkeyup = null;
    if (renderer) renderer.dispose();
    if (containerEl) containerEl.innerHTML = '';
}