const NekoLoader = {
    element: null,

    // Инициализация
    init() {
        if (document.getElementById('neko-global-loader')) return;

        const loaderDiv = document.createElement('div');
        loaderDiv.id = 'neko-global-loader';
        loaderDiv.innerHTML = `
            <div class="loader-spinner"></div>
            <div class="loader-text">Загрузка...</div>
        `;
        document.body.appendChild(loaderDiv);
        this.element = loaderDiv;
    },

    // Показать
    show() {
        // Если вызвали show до инициализации DOM, пробуем инициализировать
        if (!this.element) {
            if (document.body) this.init();
            else return; // Рано
        }
        this.element.classList.remove('hidden');
    },

    // Скрыть
    hide() {
        if (this.element) {
            this.element.classList.add('hidden');
        }
    },

    async waitForImages(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return Promise.resolve();

        const images = Array.from(container.querySelectorAll('img'));
        if (images.length === 0) return Promise.resolve();

        const imagePromises = images.map(img => {
            if (img.complete && img.naturalHeight !== 0) {
                return Promise.resolve();
            }
            return new Promise(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
            });
        });

        return Promise.all(imagePromises);
    }
};

// ВАЖНО: Ждем загрузки DOM перед добавлением в body
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NekoLoader.init());
} else {
    NekoLoader.init();
}