export class Toaster {
    constructor(scene, loadingManager) {
        this.scene = scene;
        this.mesh = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.activeActionName = ''; 
        
        this.moveSpeed = 0.02; 
        this.runAnimSpeed = 1;
        this.modelScale = 0.018; 
        
        this.maxHp = 3200;
        this.hp = 3200;
        this.isDead = false;
        
        this.isHologram = true; 
        
        // --- ФИЗИКА ПРЫЖКА ---
        this.isJumping = false; 
        this.jumpTime = 0;

        // --- МЕХАНИКА СПОСОБНОСТЕЙ ---
        this.remotePlayers = null;
        this.playersRef = null;
        this.activeToasts = [];
        this.abilityCooldown = 0;
        this.isAiming = false;
        this.aimTarget = new THREE.Vector3();
        
        // Эстетичный прицел (путь из сфер)
        this.aimGroup = new THREE.Group();
        this.aimDots = [];
        for (let i = 0; i < 15; i++) {
            const dot = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 8, 8),
                new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8 - (i * 0.04) })
            );
            this.aimGroup.add(dot);
            this.aimDots.push(dot);
        }
        this.aimGroup.visible = false;
        this.scene.add(this.aimGroup);

        this.loader = new THREE.FBXLoader(loadingManager);
        this.texLoader = new THREE.TextureLoader(loadingManager);
        this.path = 'assets/models/toaster/';
        this.baseTexture = this.texLoader.load(this.path + 'ToastBrawler_Low_OG_BaseColor.png');

        this.createHologram();
    }

    // Инъекция ссылок на сеть из game.js
    setGameContext(remotePlayers, playersRef) {
        this.remotePlayers = remotePlayers;
        this.playersRef = playersRef;
    }

    createHologram() {
        this.hologramGroup = new THREE.Group();
        const geo1 = new THREE.OctahedronGeometry(0.5);
        const mat1 = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.8 });
        this.crystal = new THREE.Mesh(geo1, mat1);
        this.crystal.position.y = 1;
        this.hologramGroup.add(this.crystal);

        const geo2 = new THREE.TorusGeometry(0.8, 0.02, 16, 32);
        const mat2 = new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.5 });
        this.ring = new THREE.Mesh(geo2, mat2);
        this.ring.position.y = 1;
        this.ring.rotation.x = Math.PI / 2;
        this.hologramGroup.add(this.ring);

        this.scene.add(this.hologramGroup);
    }

    load() {
        this.loader.load(this.path + 'character.fbx', (fbx) => {
            this.mesh = fbx;
            this.mesh.scale.set(this.modelScale, this.modelScale, this.modelScale);
            
            this.mesh.traverse(c => {
                if (c.isMesh) {
                    c.castShadow = true;
                    c.receiveShadow = true;
                    if (c.material) {
                        c.material.map = this.baseTexture;
                        c.material.needsUpdate = true;
                    }
                }
            });
            
            this.mesh.visible = !this.isHologram;
            this.hologramGroup.visible = this.isHologram;
            this.mesh.rotation.y = Math.PI; 
            
            this.mixer = new THREE.AnimationMixer(this.mesh);
            
            this.scene.add(this.mesh);

            this.loadAnim('Idle', 'idle.fbx', () => this.playAnim('Idle'));
            this.loadAnim('Run', 'run.fbx');
            this.loadAnim('Jump', 'jump.fbx', (action) => {
                action.loop = THREE.LoopOnce;
                action.clampWhenFinished = true;
                action.timeScale = 1.2; 
            });
            this.loadAnim('Die', 'die.fbx', (action) => {
                action.loop = THREE.LoopOnce;
                action.clampWhenFinished = true;
            });

        }, undefined, (e) => console.error(e));
    }

    setHologram(value) {
        if (this.isHologram !== value) {
            this.isHologram = value;
            if (this.mesh) this.mesh.visible = !this.isHologram;
            if (this.hologramGroup) this.hologramGroup.visible = this.isHologram;
        }
    }

    loadAnim(name, file, cb) {
        this.loader.load(this.path + file, (anim) => {
            if (this.mixer) {
                const action = this.mixer.clipAction(anim.animations[0]);
                if (name === 'Run') action.timeScale = this.runAnimSpeed;
                this.animations[name] = action;
                if (cb) cb(action);
            }
        });
    }

    playAnim(name) {
        if (!this.animations[name]) return;
        if (this.activeActionName === name && name !== 'Jump') return;
        if (this.isDead && name !== 'Die') return;

        const newAction = this.animations[name];
        if (this.currentAction && this.currentAction !== newAction) {
            this.currentAction.fadeOut(0.2);
        }

        newAction.reset().fadeIn(0.2).play();
        this.currentAction = newAction;
        this.activeActionName = name;
    }

    // --- ФИЗИЧЕСКИЙ ПРЫЖОК ---
    jump() {
        if (this.isJumping || this.isDead) return false; 
        this.isJumping = true;
        this.jumpTime = 0; // Сброс таймера физики
        this.playAnim('Jump');
        return true; 
    }

    // --- СИСТЕМА СПОСОБНОСТЕЙ "ГОРЯЧИЙ ТОСТ" ---
    startAiming() {
        if (this.isDead || Date.now() < this.abilityCooldown) return;
        this.isAiming = true;
        this.aimGroup.visible = true;
    }

    updateAiming(targetPoint) {
        if (!this.isAiming) return;
        this.aimTarget.copy(targetPoint);
        
        const start = this.getHeadPosition();
        const T = 0.6; // Время полета
        const g = 40;  // Гравитация
        const vY = ((this.aimTarget.y - start.y) + 0.5 * g * T * T) / T;
        const vX = (this.aimTarget.x - start.x) / T;
        const vZ = (this.aimTarget.z - start.z) / T;

        // Расставляем сферы по параболе
        for (let i = 0; i < this.aimDots.length; i++) {
            const t = (i / (this.aimDots.length - 1)) * T;
            this.aimDots[i].position.set(
                start.x + vX * t,
                start.y + vY * t - 0.5 * g * t * t,
                start.z + vZ * t
            );
        }
    }

    stopAimingAndFire() {
        if (!this.isAiming) return;
        this.isAiming = false;
        this.aimGroup.visible = false;
        this.fireToast(this.aimTarget);
    }

    fireToast(targetPos) {
        this.playAnim('Jump'); // Небольшая отдача при выстреле
        
        const geometry = new THREE.BoxGeometry(0.5, 0.1, 0.5);
        const material = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xaa3300, roughness: 0.4 });
        const toastMesh = new THREE.Mesh(geometry, material);
        
        const startPos = this.getHeadPosition();
        toastMesh.position.copy(startPos);
        this.scene.add(toastMesh);

        const timeOfFlight = 0.6;
        const gravity = 40; 
        const vY = ((targetPos.y - startPos.y) + 0.5 * gravity * timeOfFlight * timeOfFlight) / timeOfFlight;
        const vX = (targetPos.x - startPos.x) / timeOfFlight;
        const vZ = (targetPos.z - startPos.z) / timeOfFlight;

        this.activeToasts.push({ mesh: toastMesh, vx: vX, vy: vY, vz: vZ, g: gravity, timeAlive: 0 });

        this.abilityCooldown = Date.now() + 4000; // КД 4 секунды
        
        const cdOverlay = document.getElementById('ability-cd-overlay');
        if (cdOverlay) {
            cdOverlay.style.display = 'flex';
            let cdLeft = 4;
            cdOverlay.innerText = cdLeft;
            const cdInterval = setInterval(() => {
                cdLeft--;
                if (cdLeft <= 0) {
                    cdOverlay.style.display = 'none';
                    clearInterval(cdInterval);
                } else {
                    cdOverlay.innerText = cdLeft;
                }
            }, 1000);
        }
    }

    createExplosion(pos) {
        // Уменьшенный радиус сферы взрыва (1.6 вместо 2.5)
        const geo = new THREE.SphereGeometry(1.6, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.8 });
        const explosion = new THREE.Mesh(geo, mat);
        explosion.position.copy(pos);
        this.scene.add(explosion);

        let scale = 0.1;
        let opacity = 0.8;
        const animInterval = setInterval(() => {
            scale += 0.3;
            opacity -= 0.1;
            explosion.scale.set(scale, scale, scale);
            mat.opacity = opacity;
            if (opacity <= 0) {
                this.scene.remove(explosion);
                clearInterval(animInterval);
            }
        }, 30);
    }

    applyDamageAndBurn(targetKey, targetPlayer) {
        if (targetPlayer.isDead || targetPlayer.isHologram || !this.playersRef) return;
        
        // Моментальный урон 750
        let currentHp = Math.max(0, targetPlayer.hp - 750);
        this.playersRef.child(targetKey).child('hp').set(currentHp);

        if (currentHp <= 0) return;

        // Поджог (3 раза по 250 урона)
        let ticks = 0;
        const burnInterval = setInterval(() => {
            if (ticks >= 3 || targetPlayer.isDead) {
                clearInterval(burnInterval);
                return;
            }
            currentHp = Math.max(0, targetPlayer.hp - 250);
            this.playersRef.child(targetKey).child('hp').set(currentHp);
            ticks++;
        }, 1000);
    }
    // ----------------------------------------

    update(dt, inputs, cameraAngleY) {
        if (this.hologramGroup && this.isHologram) {
            this.hologramGroup.position.copy(this.getPosition());
            this.crystal.rotation.y += dt;
            this.crystal.rotation.x += dt * 0.5;
            this.ring.rotation.z -= dt * 0.5;
        }

        // --- ОБНОВЛЕНИЕ СНАРЯДОВ (Внутри самого Тостера) ---
        for (let i = this.activeToasts.length - 1; i >= 0; i--) {
            const t = this.activeToasts[i];
            t.vy -= t.g * dt;
            t.mesh.position.x += t.vx * dt;
            t.mesh.position.y += t.vy * dt;
            t.mesh.position.z += t.vz * dt;
            t.mesh.rotation.x += 15 * dt;
            t.mesh.rotation.z += 10 * dt;

            if (t.mesh.position.y <= 0) {
                t.mesh.position.y = 0;
                this.createExplosion(t.mesh.position);
                
                // Проверка урона (Уменьшенный радиус 2.3)
                if (this.remotePlayers) {
                    Object.keys(this.remotePlayers).forEach(key => {
                        const rp = this.remotePlayers[key];
                        if (rp.targetPos.distanceTo(t.mesh.position) <= 2.3) {
                            this.applyDamageAndBurn(key, rp);
                        }
                    });
                }
                this.scene.remove(t.mesh);
                this.activeToasts.splice(i, 1);
            }
        }

        if (!this.mesh || !this.mixer) return;
        this.mixer.update(dt);

        // --- ЛОГИКА ФИЗИЧЕСКОГО ПРЫЖКА ---
        if (this.isJumping) {
            this.jumpTime += dt;
            let t = this.jumpTime / 0.8; // Анимация идет около 800мс
            if (t > 1) {
                t = 1;
                this.isJumping = false;
                this.mesh.position.y = 0;
                if (!this.isDead) this.playAnim('Idle');
            } else {
                // Математическая парабола прыжка (высота 2.5)
                this.mesh.position.y = 4 * 2.5 * t * (1 - t);
            }
        } else if (this.mesh.position.y !== 0) {
            this.mesh.position.y = 0;
        }

        if (this.isDead) return;

        let dx = 0; let dz = 0;

        if (inputs.forward) dz = -1;
        if (inputs.backward) dz = 1;
        if (inputs.left) dx = -1;
        if (inputs.right) dx = 1;
        if (inputs.joystick && inputs.joystick.active) {
            dz = -Math.sin(inputs.joystick.angle);
            dx = Math.cos(inputs.joystick.angle);
        }

        const isMoving = dx !== 0 || dz !== 0;

        if (isMoving) {
            if (!this.isJumping) this.playAnim('Run');
            
            const angleOffset = -cameraAngleY;
            const realX = dx * Math.cos(angleOffset) - dz * Math.sin(angleOffset);
            const realZ = dx * Math.sin(angleOffset) + dz * Math.cos(angleOffset);

            this.mesh.position.x += realX * this.moveSpeed;
            this.mesh.position.z += realZ * this.moveSpeed;

            const targetRotation = Math.atan2(-realX, -realZ) + Math.PI;
            let rotDiff = targetRotation - this.mesh.rotation.y;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.mesh.rotation.y += rotDiff * 0.15;
        } else {
            if (!this.isJumping) this.playAnim('Idle');
        }
    }
    
    setHp(newHp) {
        this.hp = newHp;
        if (this.hp <= 0 && !this.isDead) {
            this.hp = 0;
            this.isDead = true;
            this.playAnim('Die');
        }
    }

    getNetworkData() {
        if (!this.mesh) return null;
        return {
            x: this.mesh.position.x,
            y: this.mesh.position.y, // <-- ПЕРЕДАЕМ ВЫСОТУ ПРЫЖКА
            z: this.mesh.position.z,
            ry: this.mesh.rotation.y,
            anim: this.activeActionName
        };
    }
    
    getPosition() {
        return this.mesh ? this.mesh.position : new THREE.Vector3(0,0,0);
    }

    getHeadPosition() {
        if (!this.mesh) return new THREE.Vector3(0, 1.5, 0);
        return new THREE.Vector3(this.mesh.position.x, this.mesh.position.y + 1.8, this.mesh.position.z);
    }
}