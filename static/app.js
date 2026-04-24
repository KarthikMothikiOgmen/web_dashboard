/**
 * ORo Mission Control Dashboard
 * High-performance Vanilla JS ZMQ consumer
 */

class Dashboard {
    constructor() {
        this.socket = null;
        this.currentEndpoint = 'sensors';
        this.topicData = {}; // topic -> { sid, seq, ts, value, type, history }
        this.sparkLines = {}; // topic -> canvas context
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.connect();
        this.startClock();
    }

    setupEventListeners() {
        // Endpoint switching
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const endpoint = e.currentTarget.dataset.endpoint;
                this.switchEndpoint(endpoint);
            });
        });

        // Clear data
        document.getElementById('clear-data').addEventListener('click', () => {
            this.topicData = {};
            this.renderGrid();
            this.updateBadges();
        });
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        console.log(`[Connecting] ${wsUrl}`);
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            this.updateStatus(true);
            console.log('[Connected] ZMQ Bridge reachable');
        };

        this.socket.onclose = () => {
            this.updateStatus(false);
            setTimeout(() => this.connect(), 3000); // Auto-reconnect
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };
    }

    handleMessage(data) {
        const { topic, endpoint, value, type, ts } = data;
        
        // Initialize history/metadata for topic
        if (!this.topicData[topic]) {
            this.topicData[topic] = { 
                ...data, 
                history: [], 
                lastTs: ts,
                freq: 0 
            };
        } else {
            // Calculate Frequency (Hz) based on last arrival
            const deltaMs = ts - this.topicData[topic].lastTs;
            if (deltaMs > 0) {
                const instantFreq = 1000.0 / deltaMs;
                
                // If freq is 0 (first update), jump straight to instant value
                if (this.topicData[topic].freq === 0) {
                    this.topicData[topic].freq = instantFreq;
                } else {
                    // Smooth subsequent updates (alpha = 0.3)
                    this.topicData[topic].freq = (this.topicData[topic].freq * 0.7) + (instantFreq * 0.3);
                }
            }
            
            // Update existing with new values
            Object.assign(this.topicData[topic], data);
            this.topicData[topic].lastTs = ts;
        }

        // Only update UI if we are on the correct endpoint
        if (endpoint === this.currentEndpoint) {
            this.updateTopicCard(topic);
        }

        // Special handling for dedicated thermal view
        if (topic === '/sensors/thermal/ir_array' && this.currentEndpoint === 'thermal') {
            this.updateThermalAnalysis(this.topicData[topic]);
        }

        // Update control feedback if visible
        if (this.currentEndpoint === 'commands') {
            const feedbackCards = document.querySelectorAll(`[data-feedback="${topic}"]`);
            feedbackCards.forEach(card => {
                const posEl = card.querySelector('.current-pos');
                if (posEl) {
                    posEl.innerText = typeof value === 'number' ? value.toFixed(1) : value;
                    posEl.classList.add('pulse-glow');
                    setTimeout(() => posEl.classList.remove('pulse-glow'), 500);
                }
            });
        }

        this.updateBadges();
    }

    switchEndpoint(endpoint) {
        this.currentEndpoint = endpoint;
        
        // UI Updates
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        const navItem = document.querySelector(`[data-endpoint="${endpoint}"]`);
        if (navItem) navItem.classList.add('active');
        
        const titleEl = document.getElementById('current-endpoint-title');
        const descEl = document.getElementById('current-endpoint-desc');
        
        if (endpoint === 'commands') {
            titleEl.innerText = 'Command Center';
            descEl.innerText = 'Active hardware and processor-side service control';
            document.getElementById('topic-grid').classList.remove('hidden');
            document.getElementById('thermal-container').classList.add('hidden');
            this.renderControls();
        } else if (endpoint === 'thermal') {
            titleEl.innerText = 'Thermal IR Analysis';
            descEl.innerText = 'High-resolution frame analysis and raw numerical matrix';
            document.getElementById('topic-grid').classList.add('hidden');
            document.getElementById('thermal-container').classList.remove('hidden');
            this.initThermalAnalysis();
        } else {
            titleEl.innerText = endpoint.charAt(0).toUpperCase() + endpoint.slice(1) + ' Telemetry';
            descEl.innerText = 'Live data from local IPC and UART OroPackets';
            document.getElementById('topic-grid').classList.remove('hidden');
            document.getElementById('thermal-container').classList.add('hidden');
            this.renderGrid();
        }
    }

    initThermalAnalysis() {
        const heatmap = document.getElementById('thermal-heatmap-large');
        const matrix = document.getElementById('thermal-data-matrix');
        
        heatmap.innerHTML = '';
        matrix.innerHTML = '';
        
        for (let i = 0; i < 64; i++) {
            const pixel = document.createElement('div');
            pixel.className = 'pixel';
            heatmap.appendChild(pixel);
            
            const cell = document.createElement('div');
            cell.className = 'matrix-cell';
            cell.innerText = '--';
            matrix.appendChild(cell);
        }
    }

    updateThermalAnalysis(data) {
        const pixels = document.querySelectorAll('#thermal-heatmap-large .pixel');
        const cells = document.querySelectorAll('#thermal-data-matrix .matrix-cell');
        
        const floor = data.min;
        const ceil = data.max;
        const range = ceil - floor > 0.1 ? ceil - floor : 1.0;
        
        data.pixels.forEach((val, i) => {
            if (pixels[i]) {
                const percent = (val - floor) / range;
                let hue = 240 - (percent * 240);
                hue = Math.max(0, Math.min(240, hue));
                pixels[i].style.backgroundColor = 'hsl(' + hue + ', 85%, 45%)';
            }
            if (cells[i]) {
                cells[i].innerText = val.toFixed(1);
                // Heat color for text if above threshold
                if (val > (floor + range * 0.7)) cells[i].style.color = '#ff6b6b';
                else cells[i].style.color = 'var(--text-muted)';
            }
        });

        document.getElementById('ta-min').innerText = data.min.toFixed(2) + '\u00b0C';
        document.getElementById('ta-max').innerText = data.max.toFixed(2) + '\u00b0C';
        document.getElementById('ta-amb').innerText = data.ambient.toFixed(2) + '\u00b0C';
        document.getElementById('ta-freq').innerText = data.freq.toFixed(1) + ' Hz';
    }

    renderControls() {
        const grid = document.getElementById('topic-grid');
        grid.innerHTML = '';
        
        this.COMMAND_REGISTRY = [
            { 
                topic: '/commands/camera_rotation', 
                name: 'Camera Rotation', 
                type: 'range', 
                min: -90, max: 90, step: 1, unit: '°', valLabel: 'Set Angle',
                feedbackTopic: '/sensors/camera_rotation/optical_encoder',
                desc: 'Precision stepper motor control for panoramic rotation.',
                source: 'MCU'
            },
            { 
                topic: '/commands/feed', 
                name: 'Feed System', 
                type: 'range', 
                min: 0, max: 500, step: 10, unit: 'g', valLabel: 'Amount',
                desc: 'Dispense dry food from the internal reservoir.',
                source: 'HOST'
            },
            { 
                topic: '/commands/treat/dispense', 
                name: 'Treat Dispense', 
                type: 'range', 
                min: 1, max: 5, step: 1, unit: ' count', valLabel: 'Quantity',
                desc: 'Launch individual treats for positive reinforcement.',
                source: 'HOST'
            },
            { 
                topic: '/commands/photo_capture', 
                name: 'Capture Photo', 
                type: 'trigger', 
                desc: 'Capture a high-resolution frame from the primary camera.',
                btnLabel: 'TAKE PHOTO',
                source: 'HOST'
            },
            { 
                topic: '/commands/live_session/start', 
                topicEnd: '/commands/live_session/end',
                name: 'Live Stream', 
                type: 'dual', 
                desc: 'Initialize or terminate low-latency WebRTC broadcast.',
                btnOn: 'START',
                btnOff: 'STOP',
                source: 'HOST'
            },
            { 
                topic: '/commands/camera/ir_control', 
                name: 'Night Vision', 
                type: 'dual', 
                desc: 'Switch between color mode and infra-red night mode.',
                btnOn: 'TURN ON',
                btnOff: 'TURN OFF',
                valOn: 1,
                valOff: 0,
                source: 'HOST'
            },
            { 
                topic: '/commands/audio/speakers', 
                name: 'Speaker System', 
                type: 'audio', 
                desc: 'Manage host-side audio playback and track selection.',
                source: 'HOST'
            },
            { 
                topic: '/commands/settings/apply', 
                name: 'Apply Settings', 
                type: 'trigger', 
                desc: 'Sync latest configuration payload to device.',
                btnLabel: 'APPLY NOW',
                source: 'HOST'
            },
            { 
                topic: '/commands/firmware/update', 
                name: 'Firmware Update', 
                type: 'trigger', 
                desc: 'Trigger over-the-air (OTA) update sequence.',
                btnLabel: 'CHECK UPDATE',
                source: 'HOST'
            }
        ];

        this.COMMAND_REGISTRY.forEach(cfg => {
            const templateId = `control-${cfg.type}-template`;
            const template = document.getElementById(templateId);
            if (!template) {
                console.error(`[Dashboard] Template not found: ${templateId}`);
                return;
            }
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.control-card');
            
            card.id = `ctrl-${cfg.topic.replace(/\//g, '-')}`;
            if (cfg.feedbackTopic) {
                card.dataset.feedback = cfg.feedbackTopic;
            }
            card.querySelector('.control-name').innerText = cfg.name;
            card.querySelector('.topic-label').innerText = cfg.source;
            
            if (cfg.type === 'range') {
                const slider = card.querySelector('.slider');
                const valDisplay = card.querySelector('.current-val');
                slider.min = cfg.min;
                slider.max = cfg.max;
                slider.step = cfg.step;
                slider.value = (cfg.min + cfg.max) / 2;
                valDisplay.innerText = slider.value;
                card.querySelector('.unit').innerText = cfg.unit;
                card.querySelector('.val-label').innerText = cfg.valLabel;
                
                slider.addEventListener('input', (e) => valDisplay.innerText = e.target.value);
                card.querySelector('.btn-submit').addEventListener('click', () => {
                    this.sendCommand(cfg.topic, parseFloat(slider.value), card.id);
                });

                // Add Current Position placeholder for range controls with feedback
                if (cfg.feedbackTopic) {
                    const footer = card.querySelector('.card-footer');
                    const span = document.createElement('span');
                    span.className = 'stat feedback-val';
                    span.innerHTML = `Current: <span class="current-pos">--</span>${cfg.unit}`;
                    footer.prepend(span);
                }
            } else if (cfg.type === 'trigger') {
                card.querySelector('.control-desc').innerText = cfg.desc;
                const btn = card.querySelector('.btn-submit');
                btn.innerText = cfg.btnLabel;
                btn.addEventListener('click', () => {
                    this.sendCommand(cfg.topic, 1.0, card.id);
                });
            } else if (cfg.type === 'dual') {
                card.querySelector('.control-desc').innerText = cfg.desc;
                const btnOn = card.querySelector('.btn-on');
                const btnOff = card.querySelector('.btn-off');
                
                btnOn.innerText = cfg.btnOn;
                btnOff.innerText = cfg.btnOff;
                
                btnOn.addEventListener('click', () => {
                    this.sendCommand(cfg.topic, cfg.valOn ?? 1.0, card.id);
                });
                btnOff.addEventListener('click', () => {
                    this.sendCommand(cfg.topicEnd ?? cfg.topic, cfg.valOff ?? 0.0, card.id);
                });
            } else if (cfg.type === 'audio') {
                const trackBtns = card.querySelectorAll('.track-btn');
                const playBtn = card.querySelector('.media-btn.play');
                const pauseBtn = card.querySelector('.media-btn.pause');
                const stopBtn = card.querySelector('.media-btn.stop');
                
                let selectedTrack = 1; // Default
                card.querySelector('.current-track').innerText = selectedTrack;
                trackBtns[0].classList.add('active');

                trackBtns.forEach(btn => {
                   btn.addEventListener('click', () => {
                       selectedTrack = parseInt(btn.dataset.track);
                       trackBtns.forEach(b => b.classList.remove('active'));
                       btn.classList.add('active');
                       card.querySelector('.current-track').innerText = selectedTrack;
                       
                       // Selection also implies play for this specific logic
                       this.sendCommand(cfg.topic, selectedTrack, card.id);
                       card.querySelector('.playback-state').innerText = 'PLAYING (LOADED)';
                   });
                });

                playBtn.addEventListener('click', () => {
                    this.sendCommand(cfg.topic, 99, card.id);
                    card.querySelector('.playback-state').innerText = 'PLAYING';
                });

                pauseBtn.addEventListener('click', () => {
                    this.sendCommand(cfg.topic, 97, card.id);
                    card.querySelector('.playback-state').innerText = 'PAUSED';
                });

                stopBtn.addEventListener('click', () => {
                    this.sendCommand(cfg.topic, 0, card.id);
                    card.querySelector('.playback-state').innerText = 'STOPPED';
                    card.querySelector('.current-track').innerText = '--';
                    trackBtns.forEach(b => b.classList.remove('active'));
                });
            }

            grid.appendChild(clone);
        });
    }

    async sendCommand(topic, value, cardId) {
        const card = document.getElementById(cardId);
        const statusEl = card.querySelector('.status-indicator');
        const buttons = card.querySelectorAll('button');
        
        statusEl.innerText = 'PROCESSING...';
        statusEl.className = 'status-indicator processing';
        buttons.forEach(b => b.disabled = true);

        try {
            const response = await fetch('/api/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, value })
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                statusEl.innerText = 'SUCCESS';
                statusEl.className = 'status-indicator';

                // Display firmware version if available
                if (topic.includes('firmware/update') && result.version) {
                    statusEl.innerText = `UP TO DATE (${result.version})`;
                }
                
                // Update footer stats
                const lastValEl = card.querySelector('.last-val');
                if (lastValEl) lastValEl.innerText = value;
                
                const lastLatEl = card.querySelector('.last-latency');
                if (lastLatEl) lastLatEl.innerText = result.latency_ms || '--';
                
                const lastTimeEl = card.querySelector('.last-time');
                if (lastTimeEl) lastTimeEl.innerText = new Date().toLocaleTimeString();

                const lastActionEl = card.querySelector('.last-action');
                if (lastActionEl) {
                    const actionName = topic.split('/').pop().toUpperCase();
                    let displayVal = value;
                    
                    // Specific label mapping for audio
                    if (topic.includes('audio')) {
                        if (value == 0) displayVal = "STOP";
                        else if (value == 99) displayVal = "PLAY";
                        else if (value == 97) displayVal = "PAUSE";
                        else if (value >= 1 && value <= 3) displayVal = `LOAD TRACK ${value}`;
                    }

                    lastActionEl.innerText = `${actionName} (${displayVal})`;
                    lastActionEl.classList.add('pulse-glow');
                    setTimeout(() => lastActionEl.classList.remove('pulse-glow'), 500);
                }

                // Update current state for dual switches
                const stateEl = card.querySelector('.current-state');
                if (stateEl) {
                    const cfg = this.getControlConfigByTopic(topic);
                    if (cfg && cfg.type === 'dual') {
                         const isOn = (value === (cfg.valOn ?? 1.0));
                         stateEl.innerText = isOn ? 'ON' : 'OFF';
                         stateEl.className = `stat current-state ${isOn ? 'active' : ''}`;
                    }
                }
                
                const lastStatusEl = card.querySelector('.last-status');
                if (lastStatusEl) lastStatusEl.innerText = 'OK';

            } else {
                statusEl.innerText = 'ERROR';
                statusEl.className = 'status-indicator error';
                console.error('[Command] Failed:', result.message);
            }
        } catch (e) {
            statusEl.innerText = 'FAIL';
            statusEl.className = 'status-indicator error';
            console.error('[Command] error:', e);
        } finally {
            buttons.forEach(b => b.disabled = false);
        }
    }

    getControlConfigByTopic(topic) {
        if (!this.COMMAND_REGISTRY) return null;
        return this.COMMAND_REGISTRY.find(c => c.topic === topic || c.topicEnd === topic);
    }

    renderGrid() {
        const grid = document.getElementById('topic-grid');
        grid.innerHTML = '';
        
        if (this.currentEndpoint === 'commands') {
            this.renderControls();
            return;
        }

        const topics = Object.keys(this.topicData).filter(t => this.topicData[t].endpoint === this.currentEndpoint);
        
        if (topics.length === 0) {
            grid.innerHTML = '<div class="empty-state"><p>Waiting for data from ZMQ Bridge...</p></div>';
            return;
        }

        topics.sort().forEach(topic => this.createTopicCard(topic));
    }

    createTopicCard(topic) {
        const data = this.topicData[topic];
        const templateId = data.type === 'THERMAL' ? 'topic-thermal-template' : 'topic-card-template';
        const template = document.getElementById(templateId);
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.card');
        
        card.id = `card-${topic.replace(/\//g, '-')}`;
        
        if (data.type === 'THERMAL') {
            this.initHeatmap(card);
        } else {
            card.querySelector('.topic-name').innerText = topic;
        }
        
        document.getElementById('topic-grid').appendChild(clone);
        this.updateTopicCard(topic);
    }

    initHeatmap(card) {
        const grid = card.querySelector('#pixel-grid');
        grid.innerHTML = '';
        for (let i = 0; i < 64; i++) {
            const pixel = document.createElement('div');
            pixel.className = 'pixel';
            grid.appendChild(pixel);
        }
    }

    updateHeatmap(card, data) {
        const pixels = card.querySelectorAll('.pixel');
        
        // Dynamic scaling for better contrast
        const floor = data.min;
        const ceil = data.max;
        const range = ceil - floor > 0.1 ? ceil - floor : 1.0;
        
        data.pixels.forEach((val, i) => {
            if (pixels[i]) {
                // Map temp to HSL color (Blue at min to Red at max)
                // HSL Hue: 240 (Blue) -> 0 (Red)
                let percent = (val - floor) / range;
                let hue = 240 - (percent * 240);
                hue = Math.max(0, Math.min(240, hue));
                
                pixels[i].style.backgroundColor = `hsl(${hue}, 85%, 45%)`;
                pixels[i].title = `${val.toFixed(1)}°C`;
            }
        });

        card.querySelector('.thermal-min').innerText = `${data.min.toFixed(1)}°C`;
        card.querySelector('.thermal-max').innerText = `${data.max.toFixed(1)}°C`;
        card.querySelector('.thermal-amb').innerText = `${data.ambient.toFixed(1)}°C`;
    }

    updateTopicCard(topic) {
        const id = `card-${topic.replace(/\//g, '-')}`;
        let card = document.getElementById(id);
        
        // Create if missing
        if (!card) {
            this.createTopicCard(topic);
            card = document.getElementById(id);
        }

        const data = this.topicData[topic];
        const valueEl = card.querySelector('.main-value');
        
        // Update type badge
        card.querySelector('.type-badge').innerText = data.type;
        card.className = `card glass ${data.type.toLowerCase()}`;

        // Update value formatting
        if (data.type === 'THERMAL') {
            this.updateHeatmap(card, data);
        } else if (data.type === 'DIGITAL') {
            const isFullActive = data.value === 1 || data.value === 2 || data.value === true;
            const isWarning = data.value === 1 && topic.includes('connectivity');
            
            valueEl.innerText = data.label || (isFullActive ? 'ACTIVE' : 'INACTIVE');
            
            // Clear previous state classes
            valueEl.classList.remove('active', 'warning');
            card.classList.remove('active', 'warning');
            
            if (isWarning) {
                valueEl.classList.add('warning');
                card.classList.add('warning');
            } else if (isFullActive) {
                valueEl.classList.add('active');
                card.classList.add('active');
            }
        } else if (data.type === 'ANALOG') {
            if (data.label) {
                valueEl.innerText = data.label;
            } else {
                valueEl.innerText = data.value.toFixed(2);
            }
        } else {
            valueEl.innerText = data.value;
        }

        // Update stats
        card.querySelector('.val-freq').innerText = data.freq.toFixed(1);
        card.querySelector('.val-seq').innerText = data.seq;
        card.querySelector('.val-sid').innerText = data.sid;
        card.querySelector('.stat-time').innerText = new Date(data.ts).toLocaleTimeString();
    }

    updateStatus(online) {
        const dot = document.getElementById('ws-status-dot');
        const text = document.getElementById('ws-status-text');
        dot.className = `status-dot ${online ? 'online' : 'offline'}`;
        text.innerText = online ? 'Bridge Online' : 'Bridge Offline';
    }

    updateBadges() {
        const counts = { sensors: 0, system: 0, status: 0, commands: 0 };
        Object.values(this.topicData).forEach(d => {
            if (counts[d.endpoint] !== undefined) counts[d.endpoint]++;
        });

        // Command count comes from registry
        if (this.COMMAND_REGISTRY) {
            counts.commands = this.COMMAND_REGISTRY.length;
        }

        document.getElementById('badge-sensors').innerText = counts.sensors;
        document.getElementById('badge-system').innerText = counts.system;
        document.getElementById('badge-status').innerText = counts.status;
        document.getElementById('badge-commands').innerText = counts.commands;
    }

    startClock() {
        // Just for visual effect in header or logs if needed
    }
}

// Global instance
window.dashboard = new Dashboard();
