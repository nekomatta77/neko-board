import { db, ref, update, onValue, off, set, remove } from '../../js/firebase-config.js';
import * as THREE from 'https://esm.sh/three@0.160.0';
import { FBXLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader';

// Глобальные переменные
let scene, camera, renderer, clock;
let myPlayerModel; 
let mixer; 
let actions = { idle: null, run: null, jump: null, punch: null }; // Хранилище анимаций
let activeAction = null; // Какая анимация играет прямо сейчас
let containerEl;
let joystick = { x: 0, y: 0 };
let keys = { w: false, a: false, s: false, d: false, space: false, mouse: false };
let isJumping = false;
let isPunching = false;

// Определение устройства
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || navigator.maxTouchPoints > 0;

export function initGame(container, _roomId, _userId, isHost) {
    containerEl = container;
    clock = new THREE.Clock(); 

    // HTML Интерфейс
    const startScreenHTML = isMobile ? `
        <div id="start-screen"><button id="fullscreen-btn">НАЧАТЬ ⚔️</button></div>` : '';

    // Добавляем кнопки действий для мобилок (Прыжок и Удар)
    const mobileActionsHTML = isMobile ? `
        <div id="mobile-actions">
            <button id="btn-jump">🦘</button>
            <button id="btn-punch">🥊</button>
        </div>` : `<div id="pc-controls-hint">WASD-Бег | SPACE-Прыжок | ЛКМ-Удар</div>`;

    container.innerHTML = `
        <div id="rotate-warning">
            <div class="rotate-icon">📱 ➔ 📺</div><p>Поверни телефон!</p>
        </div>
        <div id="brawl-container">
            ${startScreenHTML}
            <div id="game-ui">
                <div id="custom-exit-btn">✕</div>
                <div id="loading-text">Загрузка ресурсов...</div>
                <div id="joystick-zone"><div id="joystick-nub"></div></div>
                ${mobileActionsHTML}
            </div>
        </div>
    `;

    // Логика кнопок
    setupUI();
    initThreeJS();
    setupControls();
    animate();
}

function setupUI() {
    // Старт (Фулскрин)
    if (isMobile) {
        document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            document.getElementById('start-screen').style.display = 'none';
        });

        // Кнопки действий на телефоне
        document.getElementById('btn-jump')?.addEventListener('touchstart', (e) => { e.preventDefault(); triggerJump(); });
        document.getElementById('btn-punch')?.addEventListener('touchstart', (e) => { e.preventDefault(); triggerPunch(); });
    }

    // Выход
    document.getElementById('custom-exit-btn').addEventListener('click', () => {
        if (document.exitFullscreen) document.exitFullscreen();
        document.getElementById('close-fullscreen-btn')?.click();
    });
}

function initThreeJS() {
    const gameDiv = document.getElementById('brawl-container');
    
    // Сцена
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 5, 40);

    // Камера
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.4, 1.8);
    camera.lookAt(0, 0.8, 0);

    // Рендерер
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace; // ВАЖНО ДЛЯ ЦВЕТОВ!
    gameDiv.appendChild(renderer.domElement);

    // Свет
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Пол
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    scene.add(new THREE.GridHelper(100, 100, 0x444444, 0x111111));

    // --- ЗАГРУЗКА МОДЕЛЕЙ ---
    loadPlayerAssets();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function loadPlayerAssets() {
    const loader = new FBXLoader();
    const texLoader = new THREE.TextureLoader();
    const loadingText = document.getElementById('loading-text');

    // 1. Загружаем текстуру
    const texture = texLoader.load('assets/models/cock/texture.png', 
        (tex) => { tex.colorSpace = THREE.SRGBColorSpace; }, // Правильный цвет
        undefined,
        (err) => console.warn("Текстура не найдена!")
    );

    // 2. Загружаем Базовую модель (Idle/Wait)
    loader.load('assets/models/cock/cock_wait.fbx', (fbx) => {
        myPlayerModel = fbx;
        myPlayerModel.scale.set(0.01, 0.01, 0.01); // Масштаб

        // Настройка материалов (Фикс черноты)
        myPlayerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    child.material.map = texture; // Принудительно ставим текстуру
                    child.material.shininess = 0; // Убираем блеск
                    child.material.vertexColors = false; // Важно для FBX из Mixamo!
                    child.material.needsUpdate = true;
                }
            }
        });

        scene.add(myPlayerModel);
        
        // Настройка анимаций
        mixer = new THREE.AnimationMixer(myPlayerModel);
        
        // Сохраняем анимацию Idle
        if(fbx.animations[0]) {
            actions.idle = mixer.clipAction(fbx.animations[0]);
            actions.idle.play();
            activeAction = actions.idle;
        }

        loadingText.innerText = "Загрузка бега...";

        // 3. Подгружаем остальные анимации в тот же mixer
        loadAnimation('assets/models/cock/cock_run.fbx', 'run', loader, () => {
            loadingText.innerText = "Загрузка прыжка...";
            loadAnimation('assets/models/cock/cock_jump.fbx', 'jump', loader, () => {
                loadingText.innerText = "Загрузка удара...";
                loadAnimation('assets/models/cock/cock_punch.fbx', 'punch', loader, () => {
                    loadingText.style.display = 'none'; // Готово!
                    console.log("Все анимации загружены!");
                });
            });
        });
    });
}

// Помощник для загрузки анимации из другого файла
function loadAnimation(path, name, loader, callback) {
    loader.load(path, (animFbx) => {
        if (animFbx.animations[0]) {
            const action = mixer.clipAction(animFbx.animations[0]);
            actions[name] = action;
            
            // Если это прыжок или удар - они не должны зацикливаться
            if (name === 'jump' || name === 'punch') {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true; // Остановиться в конце
            }
        }
        if (callback) callback();
    }, undefined, (err) => {
        console.error(`Ошибка загрузки ${name}:`, err);
        if (callback) callback(); // Продолжаем даже с ошибкой
    });
}

function triggerJump() {
    if (!actions.jump || isJumping || isPunching) return;
    fadeToAction('jump', 0.1);
    isJumping = true;
    // Возврат в Idle/Run произойдет в animate() по завершению
    mixer.addEventListener('finished', restoreState);
}

function triggerPunch() {
    if (!actions.punch || isJumping || isPunching) return;
    fadeToAction('punch', 0.1);
    isPunching = true;
    mixer.addEventListener('finished', restoreState);
}

function restoreState(e) {
    // Если закончилась анимация прыжка или удара
    if (e.action === actions.jump) isJumping = false;
    if (e.action === actions.punch) isPunching = false;
    
    // Снимаем слушатель, чтобы не засорять память
    mixer.removeEventListener('finished', restoreState);
    
    // Возвращаемся к idle или run в следующем кадре animate
}

// Плавный переход между анимациями
function fadeToAction(name, duration) {
    const nextAction = actions[name];
    if (!nextAction || activeAction === nextAction) return;

    nextAction.reset();
    nextAction.play();
    activeAction.crossFadeTo(nextAction, duration, true);
    activeAction = nextAction;
}

function setupControls() {
    // ПК Клавиатура
    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyW') keys.w = true;
        if (e.code === 'KeyS') keys.s = true;
        if (e.code === 'KeyA') keys.a = true;
        if (e.code === 'KeyD') keys.d = true;
        if (e.code === 'Space') { keys.space = true; triggerJump(); }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW') keys.w = false;
        if (e.code === 'KeyS') keys.s = false;
        if (e.code === 'KeyA') keys.a = false;
        if (e.code === 'KeyD') keys.d = false;
        if (e.code === 'Space') keys.space = false;
    });
    // ПК Мышь (Удар)
    window.addEventListener('mousedown', () => triggerPunch());

    // Мобильный джойстик
    if (isMobile) {
        const zone = document.getElementById('joystick-zone');
        const nub = document.getElementById('joystick-nub');
        if (!zone) return;
        let touchId = null;
        let startX, startY;
        const maxRadius = 35;

        zone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            touchId = touch.identifier;
            startX = touch.clientX;
            startY = touch.clientY;
            joystick = { x: 0, y: 0 };
            nub.style.transition = 'none';
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
                        dx *= ratio; dy *= ratio;
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
                    break;
                }
            }
        }, { passive: false });
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Логика движения
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

    // Управление анимациями (Стейт машина)
    if (mixer && !isJumping && !isPunching) {
        if (isMoving) {
            fadeToAction('run', 0.2);
        } else {
            fadeToAction('idle', 0.2);
        }
    }

    // Физическое движение
    if (myPlayerModel && isMoving && !isPunching) { // Не двигаемся во время удара
        const speed = 5 * delta;
        myPlayerModel.position.x += moveX * speed;
        myPlayerModel.position.z += moveZ * speed;
        myPlayerModel.rotation.y = Math.atan2(moveX, moveZ);
        
        camera.position.x = myPlayerModel.position.x;
        camera.position.z = myPlayerModel.position.z + 1.8;
        camera.lookAt(myPlayerModel.position.x, 0.8, myPlayerModel.position.z);
    }

    if (mixer) mixer.update(delta);
    renderer.render(scene, camera);
}

export function cleanupGame() {
    window.location.reload(); // Самый надежный способ очистки для демо
}