export class RemotePlayer {
    constructor(scene, id, initialData) {
        this.scene = scene;
        this.id = id; 
        this.mesh = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        
        this.modelScale = 0.018; 
        
        // --- ЗДОРОВЬЕ ---
        this.maxHp = 3200;
        this.hp = initialData.hp !== undefined ? initialData.hp : 3200;
        this.isDead = initialData.isDead || false;
        
        this._targetRot = initialData.ry !== undefined ? initialData.ry : Math.PI;
        this.targetPos = new THREE.Vector3(initialData.x || 0, 0, initialData.z || 0);
        
        this.isHologram = !initialData.character;

        this.loader = new THREE.FBXLoader();
        this.texLoader = new THREE.TextureLoader();
        this.path = 'assets/models/toaster/';
        this.baseTexture = this.texLoader.load(this.path + 'ToastBrawler_Low_OG_BaseColor.png');
        
        this.createHologram(); 
        this.createHpBar(); // Создаем 3D полоску ХП

        this.load(initialData.character || 'toaster');
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

        this.hologramGroup.position.copy(this.targetPos);
        this.scene.add(this.hologramGroup);
    }

    // --- СОЗДАНИЕ 3D ПОЛОСКИ HP ---
    createHpBar() {
        this.hpCanvas = document.createElement('canvas');
        this.hpCanvas.width = 256;
        this.hpCanvas.height = 64;
        this.hpCtx = this.hpCanvas.getContext('2d');
        
        this.hpTexture = new THREE.CanvasTexture(this.hpCanvas);
        const spriteMat = new THREE.SpriteMaterial({ 
            map: this.hpTexture, 
            transparent: true,
            depthTest: false // Чтобы ХП было видно даже сквозь стены (по желанию можно убрать)
        });
        this.hpSprite = new THREE.Sprite(spriteMat);
        this.hpSprite.scale.set(1.5, 0.375, 1);
        
        // Полоска скрыта, пока игрок голограмма
        this.hpSprite.visible = !this.isHologram; 
        
        this.scene.add(this.hpSprite);
        this.updateHpBarCanvas();
    }

    updateHpBarCanvas() {
        const ctx = this.hpCtx;
        ctx.clearRect(0, 0, 256, 64);
        
        // Фон полоски (темный)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(10, 10, 236, 44);
        
        // Красная полоска здоровья
        ctx.fillStyle = '#ff4d4d';
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        ctx.fillRect(14, 14, 228 * hpPercent, 36);
        
        // Имя (опционально)
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("ВРАГ", 128, 42); // Можно заменить на this.id или имя из БД

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
            this.loadAnim('Punch', 'punch.fbx', (action) => {
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
        if (this.currentAction === this.animations[name] && name !== 'Punch') return;
        if (this.isDead && name !== 'Die') return; // Мертвый не двигается

        const newAction = this.animations[name];
        if (this.currentAction) this.currentAction.fadeOut(0.2);
        
        newAction.reset().fadeIn(0.2).play();
        this.currentAction = newAction;
    }

    updateNetworkData(data) {
        if (data.x !== undefined) this.targetPos.set(data.x, 0, data.z);
        if (data.ry !== undefined) this.targetRot = data.ry;
        
        if (data.character && this.isHologram) {
            this.isHologram = false;
            if (this.mesh) this.mesh.visible = true;
            if (this.hologramGroup) this.hologramGroup.visible = false;
            if (this.hpSprite) this.hpSprite.visible = true; // Показываем полоску ХП
        }

        // Обновляем здоровье, если оно пришло
        if (data.hp !== undefined && data.hp !== this.hp) {
            this.hp = data.hp;
            this.updateHpBarCanvas();
            if (this.hp <= 0 && !this.isDead) {
                this.isDead = true;
                this.playAnim('Die');
                if (this.hpSprite) this.hpSprite.visible = false; // Прячем полоску при смерти
            }
        }

        if (data.anim && !this.isDead) {
            this.playAnim(data.anim);
        }
    }

    update(dt) {
        if (this.isHologram && this.hologramGroup) {
            this.hologramGroup.position.lerp(this.targetPos, 0.1);
            this.crystal.rotation.y += dt;
            this.crystal.rotation.x += dt * 0.5;
            this.ring.rotation.z -= dt * 0.5;
        }

        // Позиция полоски здоровья (летит над головой)
        if (this.hpSprite && !this.isHologram && !this.isDead) {
            this.hpSprite.position.lerp(
                new THREE.Vector3(this.targetPos.x, this.targetPos.y + 1.8, this.targetPos.z), 
                0.2
            );
        }

        if (!this.mesh || !this.mixer) return;
        this.mixer.update(dt);

        if (!this.isDead) {
            this.mesh.position.lerp(this.targetPos, 0.1);
            
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