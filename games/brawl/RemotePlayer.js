export class RemotePlayer {
    constructor(scene, id, initialData) {
        this.scene = scene;
        this.id = id; 
        this.mesh = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.activeActionName = '';
        
        this.modelScale = 0.018; 
        this.maxHp = 3200;
        this.hp = initialData.hp !== undefined ? initialData.hp : 3200;
        this.isDead = initialData.isDead || false;
        
        this._targetRot = initialData.ry !== undefined ? initialData.ry : Math.PI;
        this.targetPos = new THREE.Vector3(initialData.x || 0, 0, initialData.z || 0);
        
        this.isHologram = !initialData.character;

        // Прыжки и визуальные тосты
        this.isJumping = false;
        this.jumpTime = 0;
        this.activeToasts = [];
        this.lastFireId = null;

        this.loader = new THREE.FBXLoader();
        this.texLoader = new THREE.TextureLoader();
        this.path = 'assets/models/toaster/';
        this.baseTexture = this.texLoader.load(this.path + 'ToastBrawler_Low_OG_BaseColor.png');
        
        this.createHologram(); 
        this.createHpBar(); 

        this.load(initialData.character || 'toaster');
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

        this.hologramGroup.position.copy(this.targetPos);
        this.scene.add(this.hologramGroup);
    }

    createHpBar() {
        this.hpCanvas = document.createElement('canvas');
        this.hpCanvas.width = 256;
        this.hpCanvas.height = 64;
        this.hpCtx = this.hpCanvas.getContext('2d');
        
        this.hpTexture = new THREE.CanvasTexture(this.hpCanvas);
        const spriteMat = new THREE.SpriteMaterial({ map: this.hpTexture, transparent: true, depthTest: false });
        this.hpSprite = new THREE.Sprite(spriteMat);
        this.hpSprite.scale.set(1.5, 0.375, 1);
        this.hpSprite.visible = !this.isHologram; 
        
        this.scene.add(this.hpSprite);
        this.updateHpBarCanvas();
    }

    updateHpBarCanvas() {
        const ctx = this.hpCtx;
        ctx.clearRect(0, 0, 256, 64);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(10, 10, 236, 44);
        ctx.fillStyle = '#ff4d4d';
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        ctx.fillRect(14, 14, 228 * hpPercent, 36);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("ВРАГ", 128, 42); 
        this.hpTexture.needsUpdate = true;
    }

    get targetRot() { return this._targetRot; }
    set targetRot(val) {
        if (val === 0 && this.isHologram) this._targetRot = Math.PI;
        else this._targetRot = val;
    }

    load(charId) {
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
            this.mesh.position.copy(this.targetPos);
            this.mesh.rotation.y = this.targetRot;

            this.mixer = new THREE.AnimationMixer(this.mesh);
            this.scene.add(this.mesh);

            this.loadAnim('Idle', 'idle.fbx', () => this.playAnim('Idle'));
            this.loadAnim('Run', 'run.fbx');
            this.loadAnim('Jump', 'jump.fbx', (action) => {
                action.loop = THREE.LoopOnce;
                action.clampWhenFinished = true;
            });
            this.loadAnim('Die', 'die.fbx', (action) => {
                action.loop = THREE.LoopOnce;
                action.clampWhenFinished = true;
            });
        });
    }

    loadAnim(name, file, cb) {
        this.loader.load(this.path + file, (anim) => {
            if (this.mixer) {
                const action = this.mixer.clipAction(anim.animations[0]);
                this.animations[name] = action;
                if(cb) cb(action);
            }
        });
    }

    playAnim(name) {
        if (!this.animations[name]) return;
        if (this.activeActionName === name) return; 
        if (this.isDead && name !== 'Die') return;

        // Если пришел прыжок - активируем физику локально!
        if (name === 'Jump') {
            this.isJumping = true;
            this.jumpTime = 0;
        }

        const newAction = this.animations[name];
        if (this.currentAction) this.currentAction.fadeOut(0.2);
        
        newAction.reset().fadeIn(0.2).play();
        this.currentAction = newAction;
        this.activeActionName = name;
    }

    updateNetworkData(data) {
        if (data.x !== undefined) this.targetPos.set(data.x, 0, data.z);
        if (data.ry !== undefined) this.targetRot = data.ry;
        
        if (data.character && this.isHologram) {
            this.isHologram = false;
            if (this.mesh) this.mesh.visible = true;
            if (this.hologramGroup) this.hologramGroup.visible = false;
            if (this.hpSprite) this.hpSprite.visible = true;
        }

        if (data.hp !== undefined && data.hp !== this.hp) {
            this.hp = data.hp;
            this.updateHpBarCanvas();
            if (this.hp <= 0 && !this.isDead) {
                this.isDead = true;
                this.playAnim('Die');
                if (this.hpSprite) this.hpSprite.visible = false; 
            }
        }

        if (data.anim && !this.isDead) {
            this.playAnim(data.anim);
        }

        // Если враг выстрелил тостом
        if (data.fireEvent && data.fireEvent.id !== this.lastFireId) {
            this.lastFireId = data.fireEvent.id;
            this.fireVisualToast(data.fireEvent);
        }
    }

    getHeadPosition() {
        if (!this.mesh) return new THREE.Vector3(0, 1.5, 0);
        return new THREE.Vector3(this.mesh.position.x, this.mesh.position.y + 1.8, this.mesh.position.z);
    }

    // Визуальный тост врага (Урона не наносит, просто красиво летит)
    fireVisualToast(targetPos) {
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

    update(dt) {
        if (this.isHologram && this.hologramGroup) {
            this.hologramGroup.position.lerp(this.targetPos, 0.1);
            this.crystal.rotation.y += dt;
            this.crystal.rotation.x += dt * 0.5;
            this.ring.rotation.z -= dt * 0.5;
        }

        // Обновление вражеских тостов
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
                this.scene.remove(t.mesh);
                this.activeToasts.splice(i, 1);
            }
        }

        if (!this.mesh || !this.mixer) return;
        this.mixer.update(dt);

        // Плавный расчет прыжка врага
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

        if (this.hpSprite && !this.isHologram && !this.isDead) {
            this.hpSprite.position.lerp(
                new THREE.Vector3(this.mesh.position.x, this.mesh.position.y + 1.8, this.mesh.position.z), 
                0.2
            );
        }

        if (!this.isDead) {
            // Lerp только по X и Z, Y контролируется прыжком!
            this.mesh.position.x += (this.targetPos.x - this.mesh.position.x) * 0.3;
            this.mesh.position.z += (this.targetPos.z - this.mesh.position.z) * 0.3;
            
            let rotDiff = this.targetRot - this.mesh.rotation.y;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.mesh.rotation.y += rotDiff * 0.1;
        }
    }
    
    dispose() {
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.hologramGroup) this.scene.remove(this.hologramGroup);
        if (this.hpSprite) this.scene.remove(this.hpSprite);
    }
}