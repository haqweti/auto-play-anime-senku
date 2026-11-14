// ==UserScript==
// @name         Senku Ultimate Autoplay
// @namespace    http://tampermonkey.net/
// @version      3.6.0
// @description  Автозапуск, нативный переход, умная очередь, авто-восстановление после обрыва сети и сна, контроль скорости
// @author       mikuro
// @match        *://senku.one/*
// @match        *://*.senku.one/*
// @updateURL    https://raw.githubusercontent.com/haqweti/auto-play-anime-senku/refs/heads/main/Senku%20Ultimate%20Autoplay.user.js
// @downloadURL  https://raw.githubusercontent.com/haqweti/auto-play-anime-senku/refs/heads/main/Senku%20Ultimate%20Autoplay.user.js
// @grant        none
// ==/UserScript==

// @ts-check
/* eslint-disable no-undef */

(function() {
    'use strict';

    if (window.top !== window.self) return;
    const onWatchPage = () => window.location.href.includes('/watch');

    // --- ЛОКАЛИЗАЦИЯ / LOCALIZATION ---
    const isRussian = navigator.language.toLowerCase().startsWith('ru');
    const lang = {
        ru: {
            waiting: 'Ожидание...', watching: 'Смотрю', muted: 'Без звука', queue: 'Очередь',
            add: 'Доб.', clear: 'Очистить всё', reset: 'Сбросить плагин', linkPlaceholder: 'Ссылка на /anime/... или /watch/...',
            pause: 'Пауза', loading: 'Загрузка...', error: 'Ошибка (см. консоль)', queueEmpty: 'Очередь пуста',
            clickSite: 'Кликни по сайту!', endSeason: 'Конец сезона/очереди', nextEp: 'Включаю', transition: 'Переход',
            resume: 'Продолжаю', pressPlay: 'Жму Play...', waitingStart: 'Ожидание старта...', total: 'Всего', episode: 'Серия',
            startedClick: 'Запущено кликом!', invalidLink: 'Некорректная ссылка!', errorLoading: 'Ошибка загрузки',
            resetConfirm: 'Сбросить все настройки плагина?', clearConfirm: 'Очистить всю очередь?',
            animeId: 'Аниме (ID:', linkText: 'Ссылка', searching: 'Поиск плеера...', speed: 'Скорость',
            reconnecting: 'Переподключение', noNet: 'Нет сети, жду...', checkingNet: 'Проверка сети...',
            recovering: 'Восстановление', nativeNext: 'Нативная кнопка'
        },
        en: {
            waiting: 'Waiting...', watching: 'Watching', muted: 'Muted', queue: 'Queue',
            add: 'Add', clear: 'Clear all', reset: 'Reset plugin', linkPlaceholder: 'Link to /anime/... or /watch/...',
            pause: 'Paused', loading: 'Loading...', error: 'Error (check console)', queueEmpty: 'Queue is empty',
            clickSite: 'Click on the site!', endSeason: 'End of season/queue', nextEp: 'Playing', transition: 'Transition to',
            resume: 'Resuming', pressPlay: 'Pressing Play...', waitingStart: 'Waiting for start...', total: 'Total', episode: 'Episode',
            startedClick: 'Started by click!', invalidLink: 'Invalid link!', errorLoading: 'Loading error',
            resetConfirm: 'Reset all plugin settings?', clearConfirm: 'Clear the entire queue?',
            animeId: 'Anime (ID:', linkText: 'Link', searching: 'Searching player...', speed: 'Speed',
            reconnecting: 'Reconnecting', noNet: 'No network, waiting...', checkingNet: 'Checking network...',
            recovering: 'Recovering', nativeNext: 'Native next button'
        }
    };
    const t = (key) => lang[isRussian ? 'ru' : 'en'][key];

    const STORAGE_KEY = 'senku_autonext_enabled';
    const VOLUME_KEY = 'senku_autonext_volume';
    const QUEUE_KEY = 'senku_autonext_queue';
    const PANEL_OPEN_KEY = 'senku_panel_open';
    const SPEED_KEY = 'senku_autonext_speed';

    // Сколько секунд без прогресса считаем зависанием
    const STALL_MS = 6000;
    // Если пауза произошла в течение этого окна после действия пользователя — пауза пользовательская
    const USER_ACTION_WINDOW = 1500;

    let needsUserClickToPlay = false;
    let userInteracted = false;
    let heartbeatTimer = null;

    // --- состояние восстановления ---
    let wantPlaying = false;        // true = пользователь хочет смотреть (пауза не его)
    let lastUserActionAt = 0;       // время последнего действия пользователя
    let lastProgressAt = 0;         // когда последний раз видео реально продвинулось
    let recoverAttempts = 0;        // номер текущей попытки восстановления
    let nextRecoverAt = 0;          // когда можно делать следующую попытку
    let recovering = false;         // идёт ли асинхронная попытка
    let lastTime = 0;
    let lastVideoEl = null;
    let lastEpisodeKey = '';
    let transitionInProgress = false;
    let hasStartedCurrentVideo = false;
    const hookedDocs = new WeakSet();

    function logError(context, error) {
        console.error(`\n🛑🛑🛑 [SENKU SKIP ERROR] 🛑🛑🛑\nContext: ${context}\nError: ${error.message || error}\nStack:`, error.stack || 'No stack');
        if (statusText) {
            statusText.innerText = `❌ ${t('error')}`;
            statusText.className = 'error';
        }
    }

    if (localStorage.getItem(STORAGE_KEY) === null) localStorage.setItem(STORAGE_KEY, 'true');

    let savedVolume = parseFloat(localStorage.getItem(VOLUME_KEY) || '1.0');
    if (isNaN(savedVolume)) savedVolume = 1.0;

    const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    let savedSpeed = parseFloat(localStorage.getItem(SPEED_KEY) || '1');
    if (!SPEEDS.includes(savedSpeed)) savedSpeed = 1;

    /** @type {Array<any>} */
    let queue = [];
    try {
        const saved = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        if (Array.isArray(saved)) {
            queue = saved
                .filter(item => item && typeof item === 'object')
                .map(item => {
                    const url = String(item.url || item);
                    const title = String(item.title || '');
                    const image = String(item.image || '');
                    const startEp = parseInt(item.startEp, 10) || 1;
                    const totalEps = item.totalEps || '?';
                    return { url, title, image, startEp, totalEps };
                });
        }
    } catch (e) {}

    // --- 1. СТИЛИ ---
    if (!document.getElementById('senku-font')) {
        const link = document.createElement('link');
        link.id = 'senku-font';
        link.href = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;700&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }

    const style = document.createElement('style');
    style.textContent = `
        #senku-autonext-panel {
            position: fixed !important; top: 15px !important; right: 15px !important; left: auto !important; bottom: auto !important;
            background: rgba(15, 15, 15, 0.95) !important; backdrop-filter: blur(15px) !important; -webkit-backdrop-filter: blur(15px) !important;
            color: #fff !important; padding: 6px 10px !important; border-radius: 12px !important;
            z-index: 2147483647 !important; font-family: "Unbounded", system-ui, sans-serif !important;
            font-size: 11px !important; font-weight: 600 !important; display: flex !important;
            flex-direction: row-reverse !important; align-items: center !important;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5) !important; border: 1px solid rgba(255,255,255,0.08) !important;
            height: 40px !important; box-sizing: border-box !important;
            transition: box-shadow 0.3s, border-color 0.3s !important; pointer-events: auto !important; user-select: none; overflow: hidden;
        }
        #senku-autonext-panel:hover { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.7) !important; border-color: rgba(255,255,255,0.15) !important; }

        #senku-trigger-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%; cursor: pointer; transition: background 0.2s; }
        #senku-trigger-btn:hover { background: rgba(255,255,255,0.1); }

        .senku-icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: 0.8; transition: opacity 0.2s, transform 0.3s; cursor: pointer; flex-shrink: 0; }
        #senku-trigger-btn:hover .senku-icon { opacity: 1; stroke: #ff3b47; }
        #senku-autonext-panel.collapsed #senku-trigger-btn .senku-icon { transform: rotate(180deg); }

        #senku-panel-content { display: flex; align-items: center; gap: 12px; max-width: 0; opacity: 0; overflow: hidden; transition: max-width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, margin 0.4s; margin-right: 0; }
        #senku-autonext-panel:not(.collapsed) #senku-panel-content { max-width: 600px; opacity: 1; margin-right: 8px; }

        #senku-status-text { color: rgba(255, 255, 255, 0.85) !important; font-size: 11px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: middle; letter-spacing: 0.02em; transition: color 0.3s; white-space: nowrap; }
        #senku-status-text.error { color: #ff3b47 !important; }
        #senku-status-text.active { color: #fff !important; }

        .senku-toggle { position: relative !important; width: 36px !important; height: 20px !important; flex: 0 0 36px !important; border-radius: 999px !important; background: rgba(255, 255, 255, .16) !important; transition: background-color .28s ease !important; border: none !important; cursor: pointer !important; padding: 0 !important; margin-left: 4px; }
        .senku-toggle::after { content: "" !important; position: absolute !important; top: 2px !important; left: 2px !important; width: 16px !important; height: 16px !important; border-radius: 50% !important; background: #fff !important; box-shadow: 0 1px 3px rgba(0, 0, 0, .4) !important; transition: transform .32s cubic-bezier(.34, 1.36, .64, 1), width .2s ease !important; }
        .senku-toggle:active::after { width: 19px !important; }
        .senku-toggle.active { background: #ff3b47 !important; }
        .senku-toggle.active::after { transform: translateX(16px) !important; }
        .senku-toggle.active:active::after { transform: translateX(13px) !important; }

        .senku-volume-wrap { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.06); padding: 4px 8px; border-radius: 8px; margin-left: 4px; flex-shrink: 0; }
        .senku-vol-icon { width: 14px; height: 14px; fill: rgba(255,255,255,0.6); flex-shrink: 0; }
        #senku-volume-slider { -webkit-appearance: none; width: 60px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.22); outline: none; cursor: pointer; background-image: linear-gradient(#ff3b47, #ff3b47); background-size: 100% 100%; background-repeat: no-repeat; flex-shrink: 0; }
        #senku-volume-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 10px; height: 10px; border-radius: 50%; background: #fff; cursor: pointer; box-shadow: 0 0 4px rgba(0, 0, 0, 0.5); transition: transform 0.1s; }
        #senku-volume-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }

        .senku-divider { width: 1px; height: 16px; background: rgba(255,255,255,0.1); margin: 0 2px; flex-shrink: 0; }

        .senku-speed-btn {
            background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.85); border: 1px solid transparent;
            border-radius: 8px; padding: 4px 8px; font-family: inherit; font-size: 11px; font-weight: 600;
            cursor: pointer; transition: all 0.2s; margin-left: 4px; flex-shrink: 0; min-width: 38px; text-align: center;
        }
        .senku-speed-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }

        .senku-queue-icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: 0.8; transition: opacity 0.2s; cursor: pointer; flex-shrink: 0; margin-left: 4px;}
        .senku-queue-icon:hover { opacity: 1; stroke: #ff3b47; }

        #senku-queue-modal {
            position: fixed !important; top: 65px !important; right: 15px !important; left: auto !important;
            transform: translateY(-10px) !important; opacity: 0; pointer-events: none;
            background: rgba(15, 15, 15, 0.98) !important; backdrop-filter: blur(25px) saturate(150%) !important;
            border: 1px solid rgba(255,255,255,0.08) !important; border-radius: 16px !important; padding: 20px !important;
            z-index: 2147483646 !important; color: #fff !important; font-family: "Unbounded", system-ui, sans-serif !important;
            font-size: 12px !important; width: 420px !important; max-width: 90vw !important; max-height: calc(100vh - 85px) !important;
            display: flex !important; flex-direction: column !important; gap: 15px !important; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8) !important;
            transition: opacity 0.3s ease, transform 0.3s ease !important;
        }
        #senku-queue-modal.visible { opacity: 1; transform: translateY(0) !important; pointer-events: auto; }

        .senku-queue-header { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 14px; }
        .senku-queue-close { cursor: pointer; color: rgba(255,255,255,0.5); font-size: 18px; transition: color 0.2s; }
        .senku-queue-close:hover { color: #ff3b47; }
        .senku-queue-input-wrap { display: flex; gap: 8px; }
        #senku-queue-input { flex: 1; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 10px; border-radius: 8px; font-family: inherit; font-size: 11px; outline: none; transition: border-color 0.2s; }
        #senku-queue-input:focus { border-color: #ff3b47; }
        .senku-btn { background: #ff3b47; color: #fff; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 700; font-size: 11px; transition: background 0.2s; }
        .senku-btn:hover { background: #e63540; }
        .senku-btn.secondary { background: rgba(255,255,255,0.1); }
        .senku-btn.secondary:hover { background: rgba(255,255,255,0.2); }
        #senku-queue-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; padding-right: 5px; }
        #senku-queue-list::-webkit-scrollbar { width: 4px; }
        #senku-queue-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
        .senku-queue-item { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.05); padding: 8px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); transition: background 0.2s; }
        .senku-queue-item:hover { background: rgba(255,255,255,0.08); }
        .senku-queue-img { width: 40px; height: 56px; border-radius: 6px; object-fit: cover; background: rgba(0,0,0,0.5); flex-shrink: 0; }
        .senku-queue-info { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
        .senku-queue-title { font-size: 11px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .senku-queue-ep { font-size: 9px; color: rgba(255,255,255,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .senku-queue-controls { display: flex; gap: 4px; flex-shrink: 0; }
        .senku-queue-btn { background: transparent; border: none; color: rgba(255,255,255,0.5); cursor: pointer; padding: 4px; font-size: 14px; transition: color 0.2s; display: flex; align-items: center; justify-content: center; }
        .senku-queue-btn:hover { color: #fff; }
        .senku-queue-btn.delete:hover { color: #ff3b47; }
    `;
    document.head.appendChild(style);

    // --- 2. ЭЛЕМЕНТЫ ПАНЕЛИ ---
    const panel = document.createElement('div');
    panel.id = 'senku-autonext-panel';
    const isPanelOpen = localStorage.getItem(PANEL_OPEN_KEY) !== 'false';
    if (!isPanelOpen) panel.classList.add('collapsed');

    const triggerBtn = document.createElement('div');
    triggerBtn.id = 'senku-trigger-btn';
    const iconPlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconPlay.setAttribute('class', 'senku-icon');
    iconPlay.setAttribute('viewBox', '0 0 24 24');
    iconPlay.innerHTML = '<polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line>';
    triggerBtn.appendChild(iconPlay);

    const contentWrap = document.createElement('div');
    contentWrap.id = 'senku-panel-content';

    const statusText = document.createElement('span');
    statusText.id = 'senku-status-text';
    statusText.innerText = t('waiting');

    const divider = document.createElement('div');
    divider.className = 'senku-divider';

    const volContainer = document.createElement('div');
    volContainer.className = 'senku-volume-wrap';
    const volIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    volIcon.setAttribute('class', 'senku-vol-icon');
    volIcon.setAttribute('viewBox', '0 0 24 24');
    volIcon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>';

    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.id = 'senku-volume-slider';
    volSlider.min = '0'; volSlider.max = '1'; volSlider.step = '0.05';
    volSlider.value = String(savedVolume);
    volSlider.style.backgroundSize = `${savedVolume * 100}% 100%`;

    volSlider.addEventListener('input', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        savedVolume = parseFloat(target.value);
        target.style.backgroundSize = `${savedVolume * 100}% 100%`;
        localStorage.setItem(VOLUME_KEY, String(savedVolume));

        const player = findPlayer();
        const video = player ? player.video : null;
        if (video) {
            video.dataset.senkuProgrammaticVol = 'true';
            video.volume = savedVolume;
            video.muted = (savedVolume === 0);
            setTimeout(() => { video.dataset.senkuProgrammaticVol = 'false'; }, 50);
        }
    });

    volContainer.appendChild(volIcon);
    volContainer.appendChild(volSlider);

    // КНОПКА СКОРОСТИ
    const speedBtn = document.createElement('button');
    speedBtn.className = 'senku-speed-btn';
    speedBtn.title = t('speed');

    function updateSpeedBtnText() {
        speedBtn.innerText = savedSpeed === 1 ? '1x' : `${savedSpeed}x`;
    }
    updateSpeedBtnText();

    speedBtn.addEventListener('click', () => {
        let idx = SPEEDS.indexOf(savedSpeed);
        if (idx === -1) idx = 0;
        idx = (idx + 1) % SPEEDS.length;
        savedSpeed = SPEEDS[idx];
        localStorage.setItem(SPEED_KEY, String(savedSpeed));
        updateSpeedBtnText();

        const player = findPlayer();
        if (player && player.video) {
            player.video.playbackRate = savedSpeed;
        }
    });

    const iconQueue = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconQueue.setAttribute('class', 'senku-queue-icon');
    iconQueue.setAttribute('viewBox', '0 0 24 24');
    iconQueue.innerHTML = '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>';
    iconQueue.title = t('queue');

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'senku-toggle';

    function updateButtonState() {
        const isEnabled = localStorage.getItem(STORAGE_KEY) !== 'false';
        if (isEnabled) {
            toggleBtn.classList.add('active');
            if (statusText.innerText === t('muted')) statusText.innerText = t('waiting');
        } else {
            toggleBtn.classList.remove('active');
            statusText.innerText = t('muted');
            statusText.className = '';
        }
    }

    toggleBtn.addEventListener('click', () => {
        const isEnabled = localStorage.getItem(STORAGE_KEY) !== 'false';
        localStorage.setItem(STORAGE_KEY, isEnabled ? 'false' : 'true');
        updateButtonState();
    });

    contentWrap.appendChild(statusText);
    contentWrap.appendChild(divider);
    contentWrap.appendChild(volContainer);
    contentWrap.appendChild(speedBtn);
    contentWrap.appendChild(iconQueue);
    contentWrap.appendChild(toggleBtn);

    panel.appendChild(triggerBtn);
    panel.appendChild(contentWrap);

    // --- 3. МОДАЛКА ОЧЕРЕДИ ---
    const queueModal = document.createElement('div');
    queueModal.id = 'senku-queue-modal';
    queueModal.innerHTML = `
        <div class="senku-queue-header"><span>${t('queue')}</span><span class="senku-queue-close">×</span></div>
        <div class="senku-queue-input-wrap">
            <input type="text" id="senku-queue-input" placeholder="${t('linkPlaceholder')}">
            <button class="senku-btn" id="senku-queue-add">${t('add')}</button>
        </div>
        <div id="senku-queue-list"></div>
        <div style="display:flex; justify-content:space-between; margin-top: 10px;">
             <button class="senku-btn secondary" id="senku-queue-reset" style="color:#ff3b47;">${t('reset')}</button>
             <button class="senku-btn secondary" id="senku-queue-clear">${t('clear')}</button>
        </div>
    `;

    const queueInput = /** @type {HTMLInputElement} */ (queueModal.querySelector('#senku-queue-input'));
    const queueList = /** @type {HTMLDivElement} */ (queueModal.querySelector('#senku-queue-list'));

    iconQueue.addEventListener('click', (e) => { e.stopPropagation(); queueModal.classList.toggle('visible'); });
    const queueCloseBtn = /** @type {HTMLSpanElement} */ (queueModal.querySelector('.senku-queue-close'));
    queueCloseBtn.addEventListener('click', () => queueModal.classList.remove('visible'));

    function saveQueue() {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        renderQueue();
    }

    // --- 4. ПАРСЕР НАЗВАНИЙ И СЕРИЙ ---
    async function fetchAnimeInfo(originalUrl) {
        let title = t('loading');
        let image = '';
        let id = '';
        let startEp = 1;
        let totalEps = '?';

        const idMatch = originalUrl.match(/\/anime\/(\d+)/) || originalUrl.match(/\/watch\/(\d+)/) || originalUrl.match(/[?&]id=(\d+)/);
        const epMatch = originalUrl.match(/episode=(\d+)/) || originalUrl.match(/\/watch\/\d+\/(\d+)/);

        if (idMatch) id = idMatch[1];
        if (epMatch) startEp = parseInt(epMatch[1], 10);

        let finalUrl = originalUrl;
        if (id) {
            finalUrl = `${window.location.origin}/watch/${id}?episode=${startEp}&season=1`;

            try {
                const res = await fetch(`${window.location.origin}/anime/${id}`);
                const text = await res.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');

                const pageTitle = doc.querySelector('title')?.textContent || '';
                title = pageTitle.replace(/ — Senku| \| Senku| смотреть онлайн.*$/gi, '').trim();

                if (!title || title.length < 3) {
                    const ogTitle = doc.querySelector('meta[property="og:title"]');
                    if (ogTitle) title = ogTitle.getAttribute('content') || title;
                }

                const pageText = doc.body.textContent || '';
                const totalMatch = pageText.match(/Серии\s*(\d+)/i) || pageText.match(/Серий:\s*(\d+)/i) || pageText.match(/Эпизодов:\s*(\d+)/i);
                if (totalMatch) totalEps = parseInt(totalMatch[1], 10);

                const ogImage = doc.querySelector('meta[property="og:image"]');
                if (ogImage) image = ogImage.getAttribute('content') || image;
            } catch (e) {
                title = `${t('animeId')} ${id})`;
            }
        } else {
            const parts = originalUrl.split('/').filter(Boolean);
            title = parts[parts.length - 1].split('?')[0] || t('linkText');
        }

        return { title, image, url: finalUrl, startEp, totalEps };
    }

    function renderQueue() {
        queueList.innerHTML = '';
        if (queue.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.cssText = 'text-align:center; color:rgba(255,255,255,0.4); font-size:10px; padding:10px;';
            emptyDiv.textContent = t('queueEmpty');
            queueList.appendChild(emptyDiv);
            return;
        }

        queue.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'senku-queue-item';

            const epText = `${t('episode')} ${item.startEp || 1}` + (item.totalEps && item.totalEps !== '?' ? ` (${t('total')}: ${item.totalEps})` : '');

            const img = document.createElement('img');
            img.className = 'senku-queue-img';
            img.src = item.image && typeof item.image === 'string' && (item.image.startsWith('http://') || item.image.startsWith('https://'))
                ? item.image
                : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            img.alt = 'poster';

            const info = document.createElement('div');
            info.className = 'senku-queue-info';

            const title = document.createElement('div');
            title.className = 'senku-queue-title';
            title.title = String(item.title || '');
            title.textContent = `${index + 1}. ${String(item.title || '')}`;

            const ep = document.createElement('div');
            ep.className = 'senku-queue-ep';
            ep.textContent = epText;

            info.appendChild(title);
            info.appendChild(ep);

            const controls = document.createElement('div');
            controls.className = 'senku-queue-controls';

            const upBtn = document.createElement('button');
            upBtn.className = 'senku-queue-btn up';
            upBtn.textContent = '▲';
            if (index === 0) { upBtn.disabled = true; upBtn.style.opacity = '0.2'; }

            const downBtn = document.createElement('button');
            downBtn.className = 'senku-queue-btn down';
            downBtn.textContent = '▼';
            if (index === queue.length - 1) { downBtn.disabled = true; downBtn.style.opacity = '0.2'; }

            const delBtn = document.createElement('button');
            delBtn.className = 'senku-queue-btn delete';
            delBtn.textContent = '🗑';

            upBtn.addEventListener('click', () => { if (index > 0) { [queue[index - 1], queue[index]] = [queue[index], queue[index - 1]]; saveQueue(); } });
            downBtn.addEventListener('click', () => { if (index < queue.length - 1) { [queue[index + 1], queue[index]] = [queue[index], queue[index + 1]]; saveQueue(); } });
            delBtn.addEventListener('click', () => { queue.splice(index, 1); saveQueue(); });

            controls.appendChild(upBtn);
            controls.appendChild(downBtn);
            controls.appendChild(delBtn);

            el.appendChild(img);
            el.appendChild(info);
            el.appendChild(controls);

            queueList.appendChild(el);
        });
    }

    const addBtn = /** @type {HTMLButtonElement} */ (queueModal.querySelector('#senku-queue-add'));
    addBtn.addEventListener('click', async () => {
        let rawUrl = queueInput.value.trim();
        if (!rawUrl) return;
        if (!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;
        try {
            new URL(rawUrl);
            queueInput.value = '';
            const newItem = { url: rawUrl, title: t('loading'), image: '', startEp: 1, totalEps: '?' };
            queue.push(newItem);
            saveQueue();

            fetchAnimeInfo(rawUrl).then(info => {
                const idx = queue.indexOf(newItem);
                if (idx !== -1) {
                    queue[idx] = info;
                    saveQueue();
                }
            }).catch(() => { newItem.title = t('errorLoading'); saveQueue(); });
        } catch (e) { alert(t('invalidLink')); }
    });

    const resetBtn = /** @type {HTMLButtonElement} */ (queueModal.querySelector('#senku-queue-reset'));
    resetBtn.addEventListener('click', () => {
        if (confirm(t('resetConfirm'))) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(VOLUME_KEY);
            localStorage.removeItem(QUEUE_KEY);
            localStorage.removeItem(PANEL_OPEN_KEY);
            localStorage.removeItem(SPEED_KEY);
            location.reload();
        }
    });

    const clearBtn = /** @type {HTMLButtonElement} */ (queueModal.querySelector('#senku-queue-clear'));
    clearBtn.addEventListener('click', () => {
        if (confirm(t('clearConfirm'))) { queue = []; saveQueue(); }
    });

    renderQueue();

    // --- 5. ДОБАВЛЕНИЕ НА СТРАНИЦУ ---
    function addPanel() {
        if (!onWatchPage()) {
            if (panel.isConnected) panel.remove();
            if (queueModal.isConnected) queueModal.remove();
            return;
        }
        if (!document.getElementById('senku-autonext-panel')) { document.body.appendChild(panel); updateButtonState(); }
        if (!document.getElementById('senku-queue-modal')) { document.body.appendChild(queueModal); }
    }
    const bodyObserver = new MutationObserver(addPanel);
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    addPanel();

    triggerBtn.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        const isNowOpen = !panel.classList.contains('collapsed');
        localStorage.setItem(PANEL_OPEN_KEY, String(isNowOpen));
    });

    // --- 6. ПОИСК ПЛЕЕРА И СЕРИЙ ---
    function parseWatchHref(href) {
        try {
            const u = new URL(href, window.location.origin);
            const path = u.pathname.match(/\/watch\/(\d+)(?:\/(\d+))?/);
            if (!path) return null;
            const ep = path[2] || u.searchParams.get('episode');
            if (!ep) return null;
            return { id: path[1], ep: parseInt(ep, 10) };
        } catch (e) { return null; }
    }

    function findPlayer() {
        let frames = Array.from(document.querySelectorAll('iframe[src*="senku_plyr"], iframe[src*="/embed"]'));
        if (frames.length === 0) {
            frames = Array.from(document.querySelectorAll('iframe'));
        }

        for (const frame of frames) {
            try {
                const doc = frame.contentDocument || frame.contentWindow?.document;
                const video = doc ? doc.querySelector('video') : null;
                if (doc && video) return { frame, doc, video };
            } catch (e) {}
        }

        const video = document.querySelector('video');
        if (video) return { frame: null, doc: document, video };

        return null;
    }

    function getCurrentEpisode(player) {
        const frame = player ? player.frame : null;
        if (frame) {
            try {
                const inner = frame.contentWindow?.location.search.match(/[?&]episode=(\d+)/);
                if (inner) return parseInt(inner[1], 10);
            } catch (e) {}
            const fromIframe = frame.src.match(/[?&]episode=(\d+)/) || frame.src.match(/[?&]ep=(\d+)/);
            if (fromIframe) return parseInt(fromIframe[1], 10);
        }
        const fromPage = parseWatchHref(window.location.href);
        return fromPage ? fromPage.ep : 1;
    }

    function isVisible(el, doc) {
        return el.offsetParent !== null || (!!doc.defaultView && doc.defaultView.getComputedStyle(el).display !== 'none');
    }

    function findResumeButton(doc) {
        const old = /** @type {HTMLElement|null} */ (doc.querySelector('.resume-continue'));
        if (old) return old;
        const buttons = /** @type {HTMLElement[]} */ (Array.from(doc.querySelectorAll('button')));
        return buttons.find(b => /^Продолжить с/.test((b.textContent || '').trim())) || null;
    }

    function findPlayButton(doc) {
        return /** @type {HTMLElement|null} */ (doc.querySelector('.plyr__control--overlaid, [data-plyr="play"], button[aria-label="Смотреть"]'));
    }

    function findNativeNextButton(player) {
        const doc = player ? player.doc : document;
        const candidates = Array.from(doc.querySelectorAll('button, a, div[role="button"], .vjs-next-button'));

        for (const btn of candidates) {
            const text = (btn.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
            // Узкий фильтр: короткие подписи, чтобы не нажать что-то лишнее
            if (text.length === 0 || text.length > 40) continue;
            if (!/следующая серия|новая серия|next episode/.test(text)) continue;
            if (isVisible(/** @type {HTMLElement} */ (btn), doc)) return btn;
        }
        return null;
    }

    function findEpisodeLink(ep) {
        const current = parseWatchHref(window.location.href);
        const links = Array.from(document.querySelectorAll('a[href*="/watch"]'));
        for (const a of links) {
            const info = parseWatchHref(/** @type {HTMLAnchorElement} */ (a).href);
            if (!info || info.ep !== ep) continue;
            if (current && info.id !== current.id) continue;
            return /** @type {HTMLAnchorElement} */ (a);
        }
        return null;
    }

    function getTotalEpisodes() {
        const heads = Array.from(document.querySelectorAll('h2, h3'));
        for (const h of heads) {
            const m = h.textContent?.match(/Серии\s*(\d+)/i);
            if (m) return parseInt(m[1], 10);
        }
        const nums = new Set();
        document.querySelectorAll('a[href*="/watch"]').forEach(a => {
            const info = parseWatchHref(/** @type {HTMLAnchorElement} */ (a).href);
            if (info) nums.add(info.ep);
        });
        return nums.size > 0 ? nums.size : '?';
    }

    function openEpisode(link, fromEp) {
        const target = link.href;
        clickElement(link);
        setTimeout(() => {
            const player = findPlayer();
            if (!player || getCurrentEpisode(player) === fromEp) window.location.href = target;
        }, 3000);
    }

    // --- 7. HEARTBEAT ---
    function getAnimeId() {
        const match = window.location.pathname.match(/\/watch\/(\d+)/);
        return match ? match[1] : '';
    }

    async function sendHeartbeat(video, animeId, episode) {
        try {
            const res = await fetch('/api/v2/watch/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    anime_id: animeId,
                    episode: episode,
                    time: Math.floor(video.currentTime) || 0,
                    duration: Number.isFinite(video.duration) ? Math.floor(video.duration) : 0
                })
            });
            if (res.status === 401) return;
        } catch (e) {}
    }

    function startHeartbeat(video, animeId, episode) {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        sendHeartbeat(video, animeId, episode);
        heartbeatTimer = setInterval(() => sendHeartbeat(video, animeId, episode), 15000);
    }

    function stopHeartbeat() {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    }

    // --- 8. ОТСЛЕЖИВАНИЕ ДЕЙСТВИЙ ПОЛЬЗОВАТЕЛЯ И СОБЫТИЙ ВИДЕО ---
    function markUserAction() {
        lastUserActionAt = Date.now();
    }

    function hookUserActions(doc) {
        if (!doc || hookedDocs.has(doc)) return;
        hookedDocs.add(doc);
        ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
            doc.addEventListener(ev, markUserAction, { capture: true, passive: true })
        );
    }

    /**
     * Пауза считается пользовательской, если она случилась сразу после действия
     * пользователя. Всё остальное (сон ноутбука, обрыв сети, сбой плеера) — не его пауза,
     * и скрипт будет пытаться продолжить воспроизведение.
     */
    function hookVideo(video) {
        if (video.dataset.senkuHooked === 'true') return;
        video.dataset.senkuHooked = 'true';

        video.addEventListener('play', () => { wantPlaying = true; });
        video.addEventListener('playing', () => { wantPlaying = true; });
        video.addEventListener('pause', () => {
            if (video.ended || video.seeking) return;
            if (Date.now() - lastUserActionAt < USER_ACTION_WINDOW) wantPlaying = false;
        });
        video.addEventListener('ended', () => { wantPlaying = false; });
    }

    function applyPauseFix(video) {
        if (video.dataset.senkuPauseFixed) return;
        video.dataset.senkuPauseFixed = 'true';

        let lastValidTime = 0;

        video.addEventListener('timeupdate', () => {
            if (!video.paused) lastValidTime = video.currentTime;
        });

        video.addEventListener('pause', () => {
            if (lastValidTime > 1 && !video.ended) {
                const timeToRestore = lastValidTime;
                const restore = () => {
                    if (video.paused && video.currentTime < 1) {
                        video.currentTime = timeToRestore;
                    }
                };
                setTimeout(restore, 10);
                setTimeout(restore, 100);
                setTimeout(restore, 500);
            }
        });
    }

    function applyVolumeSync(video) {
        if (video.dataset.senkuVolSynced) return;
        video.dataset.senkuVolSynced = 'true';

        video.addEventListener('volumechange', () => {
            if (video.dataset.senkuProgrammaticVol === 'true') return;

            const currentVol = video.muted ? 0 : video.volume;
            if (Math.abs(currentVol - savedVolume) > 0.05) {
                savedVolume = currentVol;
                localStorage.setItem(VOLUME_KEY, String(savedVolume));
                volSlider.value = String(savedVolume);
                volSlider.style.backgroundSize = `${savedVolume * 100}% 100%`;
            }
        });
    }

    function applySpeed(video) {
        if (video && Math.abs(video.playbackRate - savedSpeed) > 0.01) {
            video.playbackRate = savedSpeed;
        }
    }

    function tryPlay(video) {
        if (!video) return;

        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch((error) => {
                if (error.name === 'NotAllowedError') {
                    video.dataset.senkuProgrammaticVol = 'true';
                    video.muted = true;
                    video.play().then(() => {
                        needsUserClickToPlay = true;
                        updateStatus(t('clickSite'), 'error');
                    }).catch(() => {});
                    video.dataset.senkuProgrammaticVol = 'false';
                }
            });
        }
    }

    function updateStatus(text, type = 'normal') {
        if (!statusText) return;
        statusText.innerText = text;
        statusText.className = '';
        if (type === 'error') statusText.classList.add('error');
        else if (type === 'active') statusText.classList.add('active');
    }

    function clickElement(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
        return true;
    }

    document.addEventListener('click', () => {
        userInteracted = true;
        markUserAction();
        if (!needsUserClickToPlay) return;
        needsUserClickToPlay = false;

        const player = findPlayer();
        if (!player) return;
        try {
            const video = player.video;
            if (video) {
                if (video.paused) video.play().catch(() => {});
                if (video.muted) {
                    video.dataset.senkuProgrammaticVol = 'true';
                    video.muted = false;
                    video.volume = savedVolume;
                    video.dataset.senkuProgrammaticVol = 'false';
                }
                updateStatus(`▶️ ${t('startedClick')}`, 'active');
            }
        } catch (e) {}
    }, { capture: true });

    // --- 9. ПРОВЕРКА СЕТИ И ВОССТАНОВЛЕНИЕ ---

    /**
     * Пинг соединения: сначала адрес видео (если он не blob), затем сайт.
     * Запрос no-cors, поэтому ответ может быть непрозрачным — главное, что он дошёл.
     */
    async function probeNetwork(video) {
        if (!navigator.onLine) return false;

        const urls = [`${window.location.origin}/favicon.ico`];
        if (video && video.currentSrc && !video.currentSrc.startsWith('blob:')) {
            urls.unshift(video.currentSrc);
        }

        for (const base of urls) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            try {
                const sep = base.includes('?') ? '&' : '?';
                await fetch(`${base}${sep}_=${Date.now()}`, {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-store',
                    signal: controller.signal
                });
                clearTimeout(timer);
                return true;
            } catch (e) {
                clearTimeout(timer);
            }
        }
        return false;
    }

    /** Перезапуск источника: перезагрузка iframe плеера либо load() для нативного видео */
    function reloadSource(player) {
        const { video, frame } = player;
        if (frame && frame.src) {
            frame.src = frame.src;
            return;
        }
        const resumeAt = video.currentTime;
        video.addEventListener('loadedmetadata', () => {
            try { video.currentTime = resumeAt; } catch (e) {}
            tryPlay(video);
        }, { once: true });
        video.load();
    }

    async function recover(player) {
        recovering = true;
        const { video, doc } = player;
        try {
            updateStatus(t('checkingNet'), 'error');
            const online = await probeNetwork(video);

            if (!online) {
                updateStatus(t('noNet'), 'error');
                nextRecoverAt = Date.now() + 2000;
                return;
            }

            recoverAttempts++;
            const n = recoverAttempts;
            updateStatus(`${t('recovering')} #${n}`, 'active');

            // Жёсткий перезапуск: ошибка медиа или каждые 3 неудачные попытки после четвёртой
            if (video.error || (n >= 4 && n % 3 === 0)) {
                reloadSource(player);
                nextRecoverAt = Date.now() + 12000;
                return;
            }

            if (video.paused) {
                // Сначала "Продолжить с", если плеер его показал, иначе кнопка Play
                const resumeBtn = findResumeButton(doc);
                if (resumeBtn && isVisible(resumeBtn, doc)) {
                    clickElement(resumeBtn);
                } else {
                    const playBtn = findPlayButton(doc);
                    if (playBtn) clickElement(playBtn);
                }
                tryPlay(video);
            } else {
                // Играет, но данные не идут: небольшой сдвиг заставляет браузер заново запросить буфер
                try { video.currentTime = Math.max(0, video.currentTime - 0.05); } catch (e) {}
            }

            nextRecoverAt = Date.now() + Math.min(2500 + n * 1000, 10000);
        } catch (e) {
            logError('Recovery', /** @type {Error} */ (e));
            nextRecoverAt = Date.now() + 3000;
        } finally {
            recovering = false;
        }
    }

    // Возврат сети, пробуждение экрана и фокус — сразу пробуем восстановиться
    window.addEventListener('online', () => { nextRecoverAt = 0; });
    window.addEventListener('offline', () => updateStatus(t('noNet'), 'error'));
    window.addEventListener('focus', () => { nextRecoverAt = 0; });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) nextRecoverAt = 0;
    });

    // --- 10. КОНЕЦ СЕРИИ ---
    function unlockTransition(ms) {
        setTimeout(() => { transitionInProgress = false; }, ms);
    }

    function handleEnded(player, currentEp) {
        if (transitionInProgress) return;
        transitionInProgress = true;

        // 1. Нативная кнопка "Следующая серия"
        const nativeBtn = findNativeNextButton(player);
        if (nativeBtn) {
            updateStatus(t('nativeNext'), 'active');
            clickElement(nativeBtn);
            unlockTransition(8000);
            return;
        }

        // 2. Серия в боковом меню
        const nextLink = findEpisodeLink(currentEp + 1);
        if (nextLink) {
            updateStatus(`${t('nextEp')} ${currentEp + 1}...`, 'active');
            openEpisode(nextLink, currentEp);
            unlockTransition(8000);
            return;
        }

        // 3. Карточка "Сейчас смотришь" и следующая за ней
        const activeMarkers = Array.from(document.querySelectorAll('span, div, p'))
            .filter(el => el.textContent?.trim() === 'Сейчас смотришь' && el.children.length === 0);
        const card = activeMarkers.length > 0
            ? (activeMarkers[0].closest('a') || activeMarkers[0].closest('[role="button"]') || activeMarkers[0].parentElement?.parentElement)
            : null;
        const nextCard = card ? /** @type {HTMLElement|null} */ (card.nextElementSibling) : null;

        if (nextCard) {
            updateStatus(`${t('nextEp')} ${currentEp + 1}...`, 'active');
            clickElement(nextCard);
            unlockTransition(8000);
            return;
        }

        // 4. Очередь
        if (queue.length > 0) {
            const nextItem = queue.shift();
            if (nextItem) {
                saveQueue();
                updateStatus(`${t('transition')}: ${nextItem.title}`, 'active');
                setTimeout(() => { window.location.href = nextItem.url; }, 1500);
            }
            return;
        }

        // 5. Всё закончилось
        updateStatus(t('endSeason'), 'error');
        unlockTransition(5000);
    }

    // --- 11. ГЛАВНЫЙ ЦИКЛ ---
    function resetEpisodeState() {
        wantPlaying = true;          // на новой серии хотим автозапуск
        recoverAttempts = 0;
        nextRecoverAt = 0;
        lastProgressAt = Date.now();
        lastTime = 0;
        hasStartedCurrentVideo = false;
        transitionInProgress = false;
        stopHeartbeat();
    }

    function tick() {
        if (localStorage.getItem(STORAGE_KEY) === 'false') return;
        if (!onWatchPage()) return;

        const player = findPlayer();
        if (!player) {
            updateStatus(t('searching'), 'error');
            return;
        }

        try {
            const { video, doc } = player;
            const now = Date.now();
            const currentEp = getCurrentEpisode(player);
            const animeId = getAnimeId();
            const totalEps = getTotalEpisodes();
            const volText = savedVolume === 0 ? t('muted') : `${Math.round(savedVolume * 100)}%`;

            hookUserActions(doc);
            hookVideo(video);
            applyPauseFix(video);
            applyVolumeSync(video);
            applySpeed(video);

            // Смена серии — полный сброс
            const episodeKey = `${animeId}:${currentEp}`;
            if (episodeKey !== lastEpisodeKey) {
                lastEpisodeKey = episodeKey;
                resetEpisodeState();
            }

            // Смена элемента video (например, после перезагрузки плеера) — только локальный сброс
            if (video !== lastVideoEl) {
                lastVideoEl = video;
                lastTime = video.currentTime;
                lastProgressAt = now;
                nextRecoverAt = 0;
                stopHeartbeat();
            }

            if (video.currentTime > 2) hasStartedCurrentVideo = true;

            if (!video.paused && !video.ended && video.currentTime > 0 && animeId) {
                if (!heartbeatTimer) startHeartbeat(video, animeId, currentEp);
            } else {
                stopHeartbeat();
            }

            // Конец серии
            if (video.ended || (video.duration > 0 && video.currentTime >= video.duration - 1.5)) {
                handleEnded(player, currentEp);
                return;
            }

            // Фиксация прогресса
            if (!video.paused && Math.abs(video.currentTime - lastTime) > 0.05) {
                lastTime = video.currentTime;
                lastProgressAt = now;
                recoverAttempts = 0;
            }

            // Пользователь сам поставил паузу — ничего не делаем
            if (!wantPlaying) {
                recoverAttempts = 0;
                updateStatus(`${t('pause')} (${currentEp}/${totalEps})`, 'normal');
                return;
            }

            // Всё идёт нормально
            const stalledFor = now - lastProgressAt;
            if (!video.paused && !video.error && stalledFor < STALL_MS) {
                updateStatus(`${t('watching')} ${currentEp}/${totalEps} | ${volText}`, 'normal');
                return;
            }

            // Пауза не пользовательская / зависание / ошибка — восстанавливаем
            if (recovering) {
                updateStatus(`${t('recovering')} #${recoverAttempts}`, 'active');
                return;
            }

            if (now < nextRecoverAt) {
                const wait = Math.ceil((nextRecoverAt - now) / 1000);
                updateStatus(`${t('reconnecting')} ${wait}c...`, 'error');
                return;
            }

            recover(player);
        } catch (e) {
            logError('Main automation loop', /** @type {Error} */ (e));
        }
    }

    /**
     * Таймер в Web Worker: фоновые вкладки и спящий экран не душат его так,
     * как обычный setInterval. Если Worker заблокирован, используется setInterval.
     */
    function startTicker(fn, ms) {
        try {
            const src = `setInterval(function(){ postMessage(0); }, ${ms});`;
            const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
            const worker = new Worker(url);
            worker.onmessage = () => fn();
            return;
        } catch (e) {}
        setInterval(fn, ms);
    }

    startTicker(tick, 1000);
})();


