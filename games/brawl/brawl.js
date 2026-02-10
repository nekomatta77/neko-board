import { db, ref, update, onValue, off, set, remove } from '../../js/firebase-config.js';
import * as THREE from 'https://esm.sh/three@0.160.0';
import { FBXLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader';

// --- НАСТРОЙКИ ФИЗИКИ ---
const GRAVITY = -30;    // Сила притяжения (чем меньше число, тем плавнее падение)
const JUMP_FORCE = 12;  // Сила прыжка (высота)
const SPEED = 6;        // Скорость бега

// Глобальные переменные
let scene, camera, renderer, clock;
let myPlayerModel; 
let mixer; 
let actions = { idle: null, run: null, jump: null, punch: null }; 
let activeAction = null; 
let containerEl;
let joystick = { x: 0, y: 0 };
let keys = { w: false, a: false, s: false, d: false, space: false };

// Состояние физики
let verticalVelocity = 0; // Текущая скорость вверх/вниз
let isGrounded = true;    // Стоим ли мы на земле?
let isPunching = false;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || navigator.maxTouchPoints > 0;

export function initGame(container, _roomId, _userId, isHost) {
    containerEl = container;
    clock = new THREE.Clock(); 

    const startScreenHTML = isMobile ? `<div id="start-screen"><button id="fullscreen-btn">НАЧАТЬ ⚔️</button></div>` : '';
    const mobileActionsHTML = isMobile ? `
        <div id="mobile-actions">
            <button id="btn-jump">🦘</button>
            <button id="btn-punch">🥊</button>
        </div>` : `<div id="pc-controls-hint">WASD-Бег | SPACE-Прыжок | ЛКМ-Удар</div>`;

    container.innerHTML = `
        <div id="rotate-warning"><div class="rotate-icon">📱 ➔ 📺</div><p>Поверни телефон!</p></div>
        <div id="brawl-container">
            ${startScreenHTML}
            <div id="game-ui">
                <div id="custom-exit-btn">✕</div>
                <div id="loading-text">Загрузка физики...</div>
                <div id="joystick-zone"><div id="joystick-nub"></div></div>
                ${mobileActionsHTML}
            </div>
        </div>
    `;

    setupUI();
    initThreeJS();
    setupControls();
    animate();
}

function setupUI() {
    if (isMobile) {
        document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            document.getElementById('start-screen').style.display = 'none';
        });
        document.getElementById('btn-jump')?.addEventListener('touchstart', (e) => { e.preventDefault(); triggerJump(); });
        document.getElementById('btn-punch')?.addEventListener('touchstart', (e) => { e.preventDefault(); triggerPunch(); });
    }
    document.getElementById('custom-exit-btn').addEventListener('click', () => {
        if (document.exitFullscreen) document.exitFullscreen();
        document.getElementById('close-fullscreen-btn')?.click();
    });
}

function initThreeJS() {
    const gameDiv = document.getElementById('brawl-container');
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

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    scene.add(new THREE.GridHelper(100, 100, 0x444444, 0x111111));

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

    const texture = texLoader.load('assets/models/cock/texture.png', (tex) => { tex.colorSpace = THREE.SRGBColorSpace; });

    loader.load('assets/models/cock/cock_wait.fbx', (fbx) => {
        myPlayerModel = fbx;
        myPlayerModel.scale.set(0.01, 0.01, 0.01); 

        myPlayerModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    child.material.map = texture;
                    child.material.shininess = 0;
                    child.material.needsUpdate = true;
                }
            }
        });

        scene.add(myPlayerModel);
        mixer = new THREE.AnimationMixer(myPlayerModel);
        
        if(fbx.animations[0]) {
            actions.idle = mixer.clipAction(fbx.animations[0]);
            actions.idle.play();
            activeAction = actions.idle;
        }

        loadingText.innerText = "Загрузка бега...";
        loadAnimation('assets/models/cock/cock_run.fbx', 'run', loader, () => {
            loadingText.innerText = "Загрузка прыжка...";
            loadAnimation('assets/models/cock/cock_jump.fbx', 'jump', loader, () => {
                loadingText.innerText = "Загрузка удара...";
                loadAnimation('assets/models/cock/cock_punch.fbx', 'punch', loader, () => {
                    loadingText.style.display = 'none';
                });
            });
        });
    });
}

function loadAnimation(path, name, loader, callback) {
    loader.load(path, (animFbx) => {
        if (animFbx.animations[0]) {
            const action = mixer.clipAction(animFbx.animations[0]);
            actions[name] = action;
            if (name === 'jump' || name === 'punch') {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
            }
        }
        if (callback) callback();
    });
}

// --- ЛОГИКА ФИЗИКИ ПРЫЖКА ---
function triggerJump() {
    // Прыгаем только если стоим на земле и не бьем
    if (!isGrounded || isPunching) return;

    isGrounded = false;       // Оторвались от земли
    verticalVelocity = JUMP_FORCE; // Придали ускорение вверх

    fadeToAction('jump', 0.1); // Включили анимацию
}

function triggerPunch() {
    if (isPunching) return; // Нельзя спамить удар
    fadeToAction('punch', 0.1);
    isPunching = true;
    
    // Удар длится пока играет анимация (примерно 0.5с)
    setTimeout(() => {
        isPunching = false;
        // Если после удара мы всё еще на земле, возвращаем Idle/Run
        if (isGrounded) {
             const isMoving = (keys.w || keys.s || keys.a || keys.d || Math.abs(joystick.x) > 0.1);
             fadeToAction(isMoving ? 'run' : 'idle', 0.2);
        }
    }, 500);
}

function fadeToAction(name, duration) {
    const nextAction = actions[name];
    if (!nextAction || activeAction === nextAction) return;
    nextAction.reset();
    nextAction.play();
    activeAction.crossFadeTo(nextAction, duration, true);
    activeAction = nextAction;
}

function setupControls() {
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
    window.addEventListener('mousedown', () => triggerPunch());

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
            startX = touch.clientX; startY = touch.clientY;
            joystick = { x: 0, y: 0 };
            nub.style.transition = 'none';
        }, { passive: false });

        zone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === touchId) {
                    const touch = e.changedTouches[i];
                    let dx = touch.clientX - startX; let dy = touch.clientY - startY;
                    const distance = Math.sqrt(dx*dx + dy*dy);
                    if (distance > maxRadius) {
                        const ratio = maxRadius / distance;
                        dx *= ratio; dy *= ratio;
                    }
                    nub.style.transform = `translate(${dx}px, ${dy}px)`;
                    joystick.x = dx / maxRadius; joystick.y = dy / maxRadius;
                    break;
                }
            }
        }, { passive: false });

        zone.addEventListener('touchend', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === touchId) {
                    joystick = { x: 0, y: 0 }; touchId = null;
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

    // 1. ДВИЖЕНИЕ (WASD / Джойстик)
    let moveX = 0;
    let moveZ = 0;
    if (keys.w) moveZ = -1;
    if (keys.s) moveZ = 1;
    if (keys.a) moveX = -1;
    if (keys.d) moveX = 1;
    if (Math.abs(joystick.x) > 0.1 || Math.abs(joystick.y) > 0.1) {
        moveX = joystick.x; moveZ = joystick.y;
    }
    const isMoving = (moveX !== 0 || moveZ !== 0);

    if (myPlayerModel) {
        // 2. ФИЗИКА (ГРАВИТАЦИЯ)
        // Если мы в воздухе, применяем гравитацию
        if (!isGrounded) {
            verticalVelocity += GRAVITY * delta;
        }
        
        // Применяем вертикальную скорость к позиции
        myPlayerModel.position.y += verticalVelocity * delta;

        // 3. УДАР ОБ ПОЛ (COLLISION)
        if (myPlayerModel.position.y <= 0) {
            myPlayerModel.position.y = 0; // Не проваливаемся
            verticalVelocity = 0;
            
            // Если мы только что приземлились
            if (!isGrounded) {
                isGrounded = true;
                // Возвращаем анимацию бега или стойки (если не бьем)
                if (!isPunching) {
                    fadeToAction(isMoving ? 'run' : 'idle', 0.2);
                }
            }
        }

        // 4. ГОРИЗОНТАЛЬНОЕ ДВИЖЕНИЕ
        // Двигаемся, только если не бьем (или если бьем, то медленно - опционально)
        if (isMoving && !isPunching) {
            myPlayerModel.position.x += moveX * SPEED * delta;
            myPlayerModel.position.z += moveZ * SPEED * delta;
            
            // Плавный поворот
            const targetRotation = Math.atan2(moveX, moveZ);
            let rotDiff = targetRotation - myPlayerModel.rotation.y;
            // Нормализация угла (чтобы не крутился на 360 лишнего)
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            myPlayerModel.rotation.y += rotDiff * 10 * delta; // 10 - скорость поворота
        }

        // 5. КАМЕРА (Следование)
        camera.position.x = myPlayerModel.position.x;
        // Камера чуть подпрыгивает вместе с игроком, но мягче
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, myPlayerModel.position.y + 1.4, 0.1);
        camera.position.z = myPlayerModel.position.z + 1.8;
        camera.lookAt(myPlayerModel.position.x, myPlayerModel.position.y + 0.8, myPlayerModel.position.z);
    
        // 6. ОБНОВЛЕНИЕ АНИМАЦИИ БЕГА/СТОЙКИ
        // Если мы на земле и не бьем, переключаем бег/стойку
        if (isGrounded && !isPunching && mixer) {
            const targetAction = isMoving ? actions.run : actions.idle;
            if (activeAction !== targetAction && targetAction) {
                fadeToAction(isMoving ? 'run' : 'idle', 0.2);
            }
        }
    }

    if (mixer) mixer.update(delta);
    renderer.render(scene, camera);
}

export function cleanupGame() {
    window.location.reload();
}