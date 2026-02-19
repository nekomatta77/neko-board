export class Toaster {
    constructor(scene, loadingManager) {
        this.scene = scene;
        this.mesh = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.activeActionName = ''; 
        
        // Базовая скорость
        this.moveSpeed = 1.2; // Изменили логику, теперь умножаем на dt, поэтому значение больше
        this.runAnimSpeed = 1;
        this.modelScale = 0.018; 
        
        this.maxHp = 3200;
        this.hp = 3200;
        this.isDead = false;
        this.isHologram = true; 
        
        this.isJumping = false; 
        this.jumpTime = 0;

        this.remotePlayers = null;
        this.playersRef = null;
        this.activeToasts = [];
        this.abilityCooldown = 0;
        this.isAiming = false;
        this.aimTarget = new THREE.Vector3();
        
        this.latestFireTarget = null;
        
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
        this.aimCircle = new THREE.Mesh(
            new THREE.RingGeometry(1.4, 1.5, 32),
            new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
        );
        this.aimCircle.rotation.x = -Math.PI / 2;
        this.aimGroup.add(this.aimCircle);
        this.aimGroup.visible = false;
        this.scene.add(this.aimGroup);

        this.loader = new THREE.FBXLoader(loadingManager);
        this.texLoader = new THREE.TextureLoader(loadingManager);
        this.path = 'assets/models/toaster/';
        this.baseTexture = this.texLoader.load(this.path + 'ToastBrawler_Low_OG_BaseColor.png');

        this.createHologram();
    }

    setGameContext(remotePlayers, playersRef) {
        this.remotePlayers = remotePlayers;
        this.playersRef = playersRef;
    }

    createHologram() {
        this.hologramGroup = new THREE.Group();
        const mat1 = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.8 });
        this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), mat1);
        this.crystal.position.y = 1;
        this.hologramGroup.add(this.crystal);

        const mat2 = new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.5 });
        this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.02, 16, 32), mat2);
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
        });
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
        if (this.activeActionName === name) return; 
        if (this.isDead && name !== 'Die') return;

        const newAction = this.animations[name];
        if (this.currentAction && this.currentAction !== newAction) {
            this.currentAction.fadeOut(0.2);
        }

        newAction.reset().fadeIn(0.2).play();
        this.currentAction = newAction;
        this.activeActionName = name;
    }

    jump() {
        if (this.isJumping || this.isDead) return false; 
        this.isJumping = true;
        this.jumpTime = 0; 
        this.playAnim('Jump');
        return true; 
    }

    startAiming() {
        if (this.isDead || Date.now() < this.abilityCooldown) return;
        this.isAiming = true;
        this.aimGroup.visible = true;
    }

    updateAiming(targetPoint) {
        if (!this.isAiming) return;
        this.aimTarget.copy(targetPoint);
        
        const start = this.getHeadPosition();
        const T = 0.6; 
        const g = 40;  
        const vY = ((this.aimTarget.y - start.y) + 0.5 * g * T * T) / T;
        const vX = (this.aimTarget.x - start.x) / T;
        const vZ = (this.aimTarget.z - start.z) / T;

        for (let i = 0; i < this.aimDots.length; i++) {
            const t = (i / (this.aimDots.length - 1)) * T;
            this.aimDots[i].position.set(start.x + vX * t, start.y + vY * t - 0.5 * g * t * t, start.z + vZ * t);
        }
        this.aimCircle.position.set(this.aimTarget.x, 0.05, this.aimTarget.z);
    }

    // НОВАЯ ФУНКЦИЯ (отмена прицеливания)
    cancelAiming() {
        if (!this.isAiming) return;
        this.isAiming = false;
        this.aimGroup.visible = false;
    }

    stopAimingAndFire() {
        if (!this.isAiming) return;
        this.isAiming = false;
        this.aimGroup.visible = false;
        this.fireToast(this.aimTarget);
    }

    fireToast(targetPos) {
        this.playAnim('Jump'); 
        this.latestFireTarget = { x: targetPos.x, y: targetPos.y, z: targetPos.z, id: Date.now() };

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

        this.abilityCooldown = Date.now() + 4000; 
        
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
        const expGroup = new THREE.Group();
        expGroup.position.copy(pos);
        this.scene.add(expGroup);

        const coreGeo = new THREE.SphereGeometry(0.5, 16, 16);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffff55, transparent: true, opacity: 1 });
        const core = new THREE.Mesh(coreGeo, coreMat);
        expGroup.add(core);

        const ringGeo = new THREE.TorusGeometry(0.6, 0.1, 16, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.9 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        expGroup.add(ring);

        const particles = [];
        const partMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        for(let i=0; i<6; i++) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), partMat);
            p.userData = { vx: (Math.random() - 0.5) * 0.3, vy: Math.random() * 0.2 + 0.1, vz: (Math.random() - 0.5) * 0.3 };
            expGroup.add(p);
            particles.push(p);
        }

        let frame = 0;
        const animInterval = setInterval(() => {
            frame++;
            const coreScale = 1 + frame * 0.15;
            core.scale.set(coreScale, coreScale, coreScale);
            coreMat.opacity = 1 - (frame / 20);

            const ringScale = 1 + frame * 0.2;
            ring.scale.set(ringScale, ringScale, ringScale);
            ringMat.opacity = 0.9 - (frame / 20);

            particles.forEach(p => {
                p.position.x += p.userData.vx; p.position.y += p.userData.vy; p.position.z += p.userData.vz;
                p.rotation.x += 0.2;
            });

            if (frame >= 20) {
                this.scene.remove(expGroup);
                clearInterval(animInterval);
            }
        }, 20);
    }

    applyDamageAndBurn(targetKey, targetPlayer) {
        if (targetPlayer.isDead || targetPlayer.isHologram || !this.playersRef) return;
        
        let currentHp = Math.max(0, targetPlayer.hp - 750);
        this.playersRef.child(targetKey).child('hp').set(currentHp);

        if (currentHp <= 0) return;

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

    update(dt, inputs, cameraAngleY) {
        if (this.hologramGroup && this.isHologram) {
            this.hologramGroup.position.copy(this.getPosition());
            this.crystal.rotation.y += dt;
            this.crystal.rotation.x += dt * 0.5;
            this.ring.rotation.z -= dt * 0.5;
        }

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
                
                if (this.remotePlayers) {
                    Object.keys(this.remotePlayers).forEach(key => {
                        const rp = this.remotePlayers[key];
                        if (rp.targetPos.distanceTo(t.mesh.position) <= 1.5) {
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

        if (this.isJumping) {
            this.jumpTime += dt;
            let t = this.jumpTime / 0.6; 
            if (t > 1) {
                t = 1;
                this.isJumping = false;
                this.mesh.position.y = 0;
                if (!this.isDead) this.playAnim('Idle');
            } else {
                this.mesh.position.y = 4 * 2.0 * t * (1 - t);
            }
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
            const inputX = dx * Math.cos(angleOffset) - dz * Math.sin(angleOffset);
            const inputZ = dx * Math.sin(angleOffset) + dz * Math.cos(angleOffset);

            // ИДЕАЛЬНАЯ СИНХРОНИЗАЦИЯ СКОРОСТИ
            // 1. Нормализуем вектор (чтобы по диагонали скорость была такой же, как по прямой)
            const len = Math.sqrt(inputX * inputX + inputZ * inputZ);
            const normLen = Math.min(len, 1);
            const realX = (inputX / len) * normLen;
            const realZ = (inputZ / len) * normLen;

            // 2. Умножаем на dt * 60 (чтобы на низком FPS скорость компенсировалась)
            const speedMultiplier = this.moveSpeed * (dt * 60);

            this.mesh.position.x += realX * speedMultiplier;
            this.mesh.position.z += realZ * speedMultiplier;

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
            z: this.mesh.position.z,
            ry: this.mesh.rotation.y,
            anim: this.activeActionName,
            fireEvent: this.latestFireTarget 
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