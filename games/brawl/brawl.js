import { db, ref, update, onValue, off, set, remove } from '../../js/firebase-config.js';

// Импорты через "карту" (index.html)
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

let scene, camera, renderer, clock;
let myPlayerModel; 
let mixer; 
let runAction; // Сохраним действие бега, чтобы управлять им
let animationId;
let containerEl;
let joystick = { x: 0, y: 0 }; // Состояние джойстика
let keys = { w: false, a: false, s: false, d: false }; // Состояние клавиш

// Состояние
let myId = null;
let roomId = null;

export function initGame(container, _roomId, _userId, isHost) {
    containerEl = container;
    roomId = _roomId;
    myId = _userId;
    clock = new THREE.Clock(); 

    // Интерфейс
    container.innerHTML = `
        <div id="brawl-container">
            <div id="game-ui">
                <div style="position:absolute; top:10px; left:10px; color:white; font-family:sans-serif; text-shadow:1px 1px 0 #000; pointer-events:none;">
                    <b>Управление:</b> WASD (ПК) или Джойстик (Тел)<br>
                    <span id="loading-text">Загрузка...</span>
                </div>
                <div id="joystick-zone"></div>
            </div>
        </div>
    `;

    initThreeJS();
    setupControls(); // Подключаем управление
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); // Яркий общий свет
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

    // --- ЗАГРУЗКА ТЕКСТУРЫ И МОДЕЛИ ---
    const textureLoader = new THREE.TextureLoader();
    
    // !!! ВАЖНО: ЗАМЕНИТЕ 'cock_texture.png' НА ИМЯ ВАШЕГО ФАЙЛА ТЕКСТУРЫ !!!
    // Если не знаете имя, посмотрите в папке assets/models
    const texture = textureLoader.load('assets/models/cock_texture.png'); 
    // Пример имени, может быть Texture_01.jpg и т.д.

    const loader = new FBXLoader();
    
    loader.load('assets/models/cock.fbx', 
        (object) => {
            console.log("FBX загружен!", object);
            const loadingText = document.getElementById('loading-text');
            if (loadingText) loadingText.textContent = "Готово!";

            myPlayerModel = object;
            
            // Если он смотрит на нас - разворачиваем (раскомментируй, если нужно)
            // myPlayerModel.rotation.y = Math.PI; 

            myPlayerModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // ПРИНУДИТЕЛЬНО НАКЛАДЫВАЕМ ТЕКСТУРУ
                    if (child.material) {
                         child.material.map = texture; // Накладываем картинку
                         child.material.needsUpdate = true;
                         // Убираем черноту
                         child.material.shininess = 0; 
                         child.material.emissive = new THREE.Color(0x000000);
                    }
                }
            });

            myPlayerModel.scale.set(0.01, 0.01, 0.01); 
            scene.add(myPlayerModel);

            // АНИМАЦИЯ
            if (object.animations && object.animations.length > 0) {
                mixer = new THREE.AnimationMixer(myPlayerModel);
                runAction = mixer.clipAction(object.animations[0]);
                runAction.play(); 
                runAction.paused = true; // Сначала СТОИМ
            }
        },
        undefined,
        (error) => {
            console.error(error);
            const loadingText = document.getElementById('loading-text');
            if (loadingText) loadingText.textContent = "Ошибка загрузки";
        }
    );

    window.addEventListener('resize', onWindowResize);
}

// --- УПРАВЛЕНИЕ ---
function setupControls() {
    // Клавиатура (ПК)
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

    // Джойстик (Мобилки) - простая реализация
    const zone = document.getElementById('joystick-zone');
    let touchId = null;
    let startX, startY;

    zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        startX = touch.clientX;
        startY = touch.clientY;
        joystick = { x: 0, y: 0 };
    });

    zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId);
        if (touch) {
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            // Нормализуем джойстик от -1 до 1
            joystick.x = Math.max(-1, Math.min(1, dx / 40)); 
            joystick.y = Math.max(-1, Math.min(1, dy / 40));
        }
    });

    zone.addEventListener('touchend', (e) => {
        e.preventDefault();
        joystick = { x: 0, y: 0 };
    });
}

function onWindowResize() {
    if (!camera || !renderer || !containerEl) return;
    const gameDiv = document.getElementById('brawl-container');
    if (!gameDiv) return;
    camera.aspect = gameDiv.clientWidth / gameDiv.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(gameDiv.clientWidth, gameDiv.clientHeight);
}

function animate() {
    animationId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    // --- ЛОГИКА ДВИЖЕНИЯ ---
    let moveX = 0;
    let moveZ = 0;

    // 1. Считываем ввод
    if (keys.w) moveZ = -1;
    if (keys.s) moveZ = 1;
    if (keys.a) moveX = -1;
    if (keys.d) moveX = 1;

    // Джойстик имеет приоритет
    if (joystick.x !== 0 || joystick.y !== 0) {
        moveX = joystick.x;
        moveZ = joystick.y;
    }

    const isMoving = (moveX !== 0 || moveZ !== 0);

    // 2. Двигаем модель
    if (myPlayerModel && isMoving) {
        const speed = 5 * delta;
        myPlayerModel.position.x += moveX * speed;
        myPlayerModel.position.z += moveZ * speed;

        // Поворачиваем модель в сторону движения
        const angle = Math.atan2(moveX, moveZ);
        myPlayerModel.rotation.y = angle;

        // Камера следует за игроком
        camera.position.x = myPlayerModel.position.x;
        camera.position.z = myPlayerModel.position.z + 1.8;
        camera.lookAt(myPlayerModel.position.x, 0.8, myPlayerModel.position.z);
    }

    // 3. Управление анимацией
    if (mixer) {
        if (runAction) {
            if (isMoving) {
                runAction.paused = false; // Бежим
            } else {
                runAction.paused = true; // Стоим (замираем в позе бега)
                // В идеале тут нужно переключаться на анимацию Idle, 
                // но пока её нет, просто "морозим" бег.
            }
        }
        mixer.update(delta);
    }

    renderer.render(scene, camera);
}

export function cleanupGame() {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', onWindowResize);
    // Удаляем слушатели клавиатуры (упрощенно)
    window.onkeydown = null;
    window.onkeyup = null;
    
    if (renderer) renderer.dispose();
    if (containerEl) containerEl.innerHTML = '';
}