import { db, ref, update, onValue, off, set, remove } from '../../js/firebase-config.js';

// Используем прямые ссылки (надежнее для мобилок)
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

    // Вставляем HTML структуру
    // Обрати внимание: добавлен id="custom-exit-btn"
    container.innerHTML = `
        <div id="rotate-warning">
            <div class="rotate-icon">📱 ➔ 📺</div>
            <p>Поверни телефон горизонтально!</p>
        </div>

        <div id="brawl-container">
            <div id="game-ui">
                <div id="custom-exit-btn">✕</div>
                <div id="loading-text">Загрузка мира...</div>
                
                <div id="joystick-zone">
                    <div id="joystick-nub"></div>
                </div>
            </div>
        </div>
    `;

    // Привязываем кнопку выхода
    document.getElementById('custom-exit-btn').addEventListener('click', () => {
        // Эмулируем нажатие на "Свернуть" из главного меню
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

    // 1. СЦЕНА
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a); // Чуть светлее фон
    scene.fog = new THREE.Fog(0x1a1a1a, 5, 40);

    // 2. КАМЕРА
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.4, 1.8);
    camera.lookAt(0, 0.8, 0);

    // 3. РЕНДЕРЕР
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight); // На весь экран
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace; // Правильные цвета
    gameDiv.appendChild(renderer.domElement);

    // 4. СВЕТ (Сделаем поярче для телефона)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 5. ПОЛ
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    const grid = new THREE.GridHelper(100, 100, 0x444444, 0x111111);
    scene.add(grid);

    // 6. ЗАГРУЗКА РЕСУРСОВ
    const textureLoader = new THREE.TextureLoader();
    const loader = new FBXLoader();

    // !!! ВАЖНО: Укажи ТОЧНОЕ имя файла текстуры (с учетом регистра!) !!!
    const textureUrl = 'assets/models/Poly_Cock_01.png'; 

    const texture = textureLoader.load(textureUrl, 
        () => console.log("Текстура OK"),
        undefined,
        (err) => console.warn("Текстура не найдена, будет серый цвет")
    );

    loader.load('assets/models/cock.fbx', 
        (object) => {
            const loadText = document.getElementById('loading-text');
            if (loadText) loadText.style.display = 'none'; // Скрываем текст

            myPlayerModel = object;

            // Разворот (если нужно)
            // myPlayerModel.rotation.y = Math.PI; 

            myPlayerModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    if (child.material) {
                        // Если текстура загрузилась - применяем, если нет - ставим серый цвет
                        if (texture && texture.image) {
                            child.material.map = texture;
                        } else {
                            child.material.color.setHex(0xaaaaaa); // Серый цвет
                        }
                        
                        child.material.shininess = 0; // Матовый
                        child.material.needsUpdate = true;
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
                runAction.paused = true; 
            }
        },
        (xhr) => {
            const loadText = document.getElementById('loading-text');
            if (loadText) loadText.innerText = `Загрузка: ${Math.round(xhr.loaded / xhr.total * 100)}%`;
        },
        (error) => {
            console.error(error);
            const loadText = document.getElementById('loading-text');
            if (loadText) loadText.innerText = "Ошибка загрузки :(";
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

    // ТЕЛЕФОН (Улучшенный джойстик)
    const zone = document.getElementById('joystick-zone');
    const nub = document.getElementById('joystick-nub');
    if (!zone || !nub) return;

    let touchId = null;
    let startX, startY;
    const maxRadius = 50; // Радиус движения пипки

    zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0]; 
        touchId = touch.identifier;
        startX = touch.clientX;
        startY = touch.clientY;
        joystick = { x: 0, y: 0 };
        
        // Визуальный эффект нажатия
        nub.style.transition = 'none';
        nub.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                const touch = e.changedTouches[i];
                let dx = touch.clientX - startX;
                let dy = touch.clientY - startY;
                
                // Ограничиваем движение пипки кругом
                const distance = Math.sqrt(dx*dx + dy*dy);
                if (distance > maxRadius) {
                    const ratio = maxRadius / distance;
                    dx *= ratio;
                    dy *= ratio;
                }

                // Двигаем пипку
                nub.style.transform = `translate(${dx}px, ${dy}px)`;

                // Передаем данные в игру (-1 до 1)
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
                // Возвращаем пипку в центр
                nub.style.transition = 'transform 0.2s';
                nub.style.transform = `translate(0px, 0px)`;
                nub.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
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

    // Джойстик имеет приоритет
    if (Math.abs(joystick.x) > 0.1 || Math.abs(joystick.y) > 0.1) {
        moveX = joystick.x;
        moveZ = joystick.y;
    }

    const isMoving = (moveX !== 0 || moveZ !== 0);

    if (myPlayerModel && isMoving) {
        const speed = 6 * delta; // Скорость бега
        myPlayerModel.position.x += moveX * speed;
        myPlayerModel.position.z += moveZ * speed;

        const angle = Math.atan2(moveX, moveZ);
        // Плавный поворот
        const targetRotation = angle;
        // Простой поворот (можно улучшить lerp-ом)
        myPlayerModel.rotation.y = targetRotation;

        // Камера следует за игроком
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
    if (renderer) renderer.dispose();
    if (containerEl) containerEl.innerHTML = '';
}