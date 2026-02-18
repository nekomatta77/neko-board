import { CHARACTERS } from '../data/characters.js';

export class Lobby {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.container = document.getElementById('ui-layer');
        this.selectedCharId = null;
        
        this.initHTML();
        this.bindEvents();
    }

    initHTML() {
        this.container.innerHTML = `
            <div class="smoke-btn-container" id="open-grid-btn">
                <div class="smoke-cloud"></div>
                <div class="smoke-text">ВЫБОР ГЕРОЯ</div>
            </div>

            <div class="hero-grid-overlay" id="grid-overlay">
                <div class="grid-title">Выберите бойца</div>
                <div class="avatars-container" id="avatars-grid">
                    </div>
            </div>

            <div class="hero-selection-overlay" id="detail-overlay">
                <button class="back-btn" id="back-to-grid-btn">←</button>
                
                <div class="hero-layout">
                    <div class="panel-left">
                        <div class="hero-header">
                            <h1 id="ui-hero-name">NAME</h1>
                            <div class="hero-role" id="ui-hero-role">Role</div>
                        </div>
                        <div class="hero-lore" id="ui-hero-lore">Lore...</div>
                        <button class="select-btn" id="confirm-select-btn">ВЫБРАТЬ</button>
                    </div>

                    <div class="panel-center" id="rotate-zone" title="Крутите модель"></div>

                    <div class="panel-right">
                        <div class="stat-box">
                            <div class="stat-row"><span>Здоровье</span><span id="val-hp">0</span></div>
                            <div class="stat-bar"><div class="stat-fill" style="width: 70%; background:#00b894;"></div></div>
                            <div class="stat-row" style="margin-top:12px;"><span>Урон</span><span id="val-dmg">0</span></div>
                            <div class="stat-bar"><div class="stat-fill" style="width: 50%; background:#ff7675;"></div></div>
                        </div>
                        
                        <div class="ability-card">
                            <div class="ability-icon">S</div>
                            <div class="ability-name" id="ui-spec-name">Spec</div>
                            <div class="ability-desc" id="ui-spec-desc">Desc</div>
                        </div>
                        
                        <div class="ability-card ult-card">
                            <div class="ability-icon">ULT</div>
                            <div class="ability-name" id="ui-ult-name">Ult</div>
                            <div class="ability-desc" id="ui-ult-desc">Desc</div>
                        </div>
                    </div>
                </div>
            </div>

            <button id="ready-btn">ГОТОВ</button>
        `;
        
        this.renderGrid();
    }

    renderGrid() {
        const grid = document.getElementById('avatars-grid');
        grid.innerHTML = '';

        // 1. Тостер (Доступен)
        const toasterCard = document.createElement('div');
        toasterCard.className = 'avatar-card';
        toasterCard.innerHTML = `<img src="${CHARACTERS.toaster.avatar}">`;
        toasterCard.onclick = () => this.openDetail(CHARACTERS.toaster);
        grid.appendChild(toasterCard);

        // 2. Заглушки (Coming Soon)
        for (let i = 0; i < 9; i++) {
            const locked = document.createElement('div');
            locked.className = 'avatar-card locked';
            locked.innerHTML = '<div class="locked-text">COMING<br>SOON</div>';
            grid.appendChild(locked);
        }
    }

    openDetail(char) {
        this.selectedCharId = char.id;
        
        // Заполняем UI
        document.getElementById('ui-hero-name').innerText = char.name;
        document.getElementById('ui-hero-role').innerText = char.role;
        document.getElementById('ui-hero-lore').innerText = char.description;
        document.getElementById('val-hp').innerText = char.stats.health;
        document.getElementById('val-dmg').innerText = char.stats.damage;
        document.getElementById('ui-spec-name').innerText = char.abilities.special.name;
        document.getElementById('ui-spec-desc').innerText = char.abilities.special.desc;
        document.getElementById('ui-ult-name').innerText = char.abilities.ultimate.name;
        document.getElementById('ui-ult-desc').innerText = char.abilities.ultimate.desc;

        // Переключаем экраны
        document.getElementById('grid-overlay').classList.remove('active');
        document.getElementById('detail-overlay').classList.add('active');

        // Сообщаем игре показать модельку для превью
        this.game.previewCharacter(char.id);
    }

    bindEvents() {
        const openGridBtn = document.getElementById('open-grid-btn');
        const gridOverlay = document.getElementById('grid-overlay');
        const detailOverlay = document.getElementById('detail-overlay');
        const backBtn = document.getElementById('back-to-grid-btn');
        const confirmBtn = document.getElementById('confirm-select-btn');
        const readyBtn = document.getElementById('ready-btn');
        const rotateZone = document.getElementById('rotate-zone');

        // 1. Дым -> Сетка
        openGridBtn.onclick = () => {
            openGridBtn.classList.add('hidden');
            gridOverlay.classList.add('active');
        };

        // 2. Детали -> Назад в Сетку
        backBtn.onclick = () => {
            detailOverlay.classList.remove('active');
            gridOverlay.classList.add('active');
            this.game.hidePreview(); // Скрываем модель
        };

        // 3. Детали -> ВЫБРАТЬ
        confirmBtn.onclick = () => {
            detailOverlay.classList.remove('active');
            this.game.selectCharacter(this.selectedCharId); // Фиксируем выбор
            readyBtn.classList.add('visible');
        };

        // 4. Готов
        readyBtn.onclick = () => {
            readyBtn.innerText = "ОЖИДАНИЕ...";
            readyBtn.classList.add('pushed');
            this.game.setPlayerReady();
        };

        // 5. Вращение модели в детальном меню
        let isDragging = false;
        let lastX = 0;

        rotateZone.onmousedown = (e) => { isDragging = true; lastX = e.clientX; };
        window.addEventListener('mouseup', () => isDragging = false);
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const delta = e.clientX - lastX;
            this.game.rotatePlayerInLobby(delta * 0.015);
            lastX = e.clientX;
        });
        
        rotateZone.ontouchstart = (e) => { isDragging = true; lastX = e.touches[0].clientX; };
        window.addEventListener('touchend', () => isDragging = false);
        rotateZone.ontouchmove = (e) => {
            if (!isDragging) return;
            const delta = e.touches[0].clientX - lastX;
            this.game.rotatePlayerInLobby(delta * 0.015);
            lastX = e.touches[0].clientX;
        };
    }
}