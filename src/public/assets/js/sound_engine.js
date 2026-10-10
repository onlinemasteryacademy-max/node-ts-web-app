/**
 * Zlik Web Audio Notification Engine
 * Provides 4 synthesized procedural alert sounds and custom audio playback.
 * Guaranteed zero-latency, cross-browser compatible, zero external audio dependencies.
 */

let globalAudioCtx = null;
let audioUnlocked = false;

function getSharedAudioContext() {
    try {
        if (!globalAudioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                globalAudioCtx = new AudioCtx();
            }
        }
        if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
            globalAudioCtx.resume();
        }
        if (globalAudioCtx && globalAudioCtx.state === 'running') {
            audioUnlocked = true;
        }
    } catch (e) {
        console.warn('AudioContext init error:', e);
    }
    return globalAudioCtx;
}

// Automatically attach unlock listeners to user interactions
function initAudioAutoUnlock() {
    const unlockEvents = ['click', 'touchstart', 'touchend', 'keydown', 'mousedown'];
    const unlockHandler = () => {
        const ctx = getSharedAudioContext();
        if (ctx && ctx.state === 'running') {
            audioUnlocked = true;
            unlockEvents.forEach(ev => document.removeEventListener(ev, unlockHandler));
        }
    };
    unlockEvents.forEach(ev => document.addEventListener(ev, unlockHandler, { passive: true }));
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAudioAutoUnlock);
    } else {
        initAudioAutoUnlock();
    }
}

function playNotificationSound(soundType, customUrl) {
    soundType = soundType || 'chime';
    customUrl = customUrl || '';

    // If merchant chose custom audio file and a valid URL is provided
    if (soundType === 'custom' && customUrl && customUrl.trim().length > 0) {
        try {
            const audio = new Audio(customUrl.trim());
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn('Custom sound playback failed, falling back to chime:', err);
                    playSynthesizedSound('chime');
                });
            }
            return;
        } catch (e) {
            console.warn('Audio element error:', e);
            playSynthesizedSound('chime');
            return;
        }
    }

    playSynthesizedSound(soundType);
}

function playSynthesizedSound(type) {
    try {
        const ctx = getSharedAudioContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;

        switch (type) {
            case 'kaching': {
                // Sound 2: Cash Register / Ka-Ching
                const clickOsc = ctx.createOscillator();
                const clickGain = ctx.createGain();
                clickOsc.type = 'square';
                clickOsc.frequency.setValueAtTime(320, now);
                clickOsc.frequency.exponentialRampToValueAtTime(120, now + 0.05);
                clickGain.gain.setValueAtTime(0.35, now);
                clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                clickOsc.connect(clickGain);
                clickGain.connect(ctx.destination);
                clickOsc.start(now);
                clickOsc.stop(now + 0.06);

                const bell1 = ctx.createOscillator();
                const bell1Gain = ctx.createGain();
                bell1.type = 'triangle';
                bell1.frequency.setValueAtTime(1567.98, now + 0.08);
                bell1Gain.gain.setValueAtTime(0.45, now + 0.08);
                bell1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                bell1.connect(bell1Gain);
                bell1Gain.connect(ctx.destination);
                bell1.start(now + 0.08);
                bell1.stop(now + 0.5);

                const bell2 = ctx.createOscillator();
                const bell2Gain = ctx.createGain();
                bell2.type = 'sine';
                bell2.frequency.setValueAtTime(2093.00, now + 0.18);
                bell2Gain.gain.setValueAtTime(0.5, now + 0.18);
                bell2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
                bell2.connect(bell2Gain);
                bell2Gain.connect(ctx.destination);
                bell2.start(now + 0.18);
                bell2.stop(now + 0.7);
                break;
            }

            case 'digital': {
                // Sound 3: Digital Radar / Modern Tech Alert
                const p1 = ctx.createOscillator();
                const g1 = ctx.createGain();
                p1.type = 'sine';
                p1.frequency.setValueAtTime(880, now);
                g1.gain.setValueAtTime(0.4, now);
                g1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
                p1.connect(g1);
                g1.connect(ctx.destination);
                p1.start(now);
                p1.stop(now + 0.09);

                const p2 = ctx.createOscillator();
                const g2 = ctx.createGain();
                p2.type = 'sine';
                p2.frequency.setValueAtTime(1760, now + 0.11);
                g2.gain.setValueAtTime(0.45, now + 0.11);
                g2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                p2.connect(g2);
                g2.connect(ctx.destination);
                p2.start(now + 0.11);
                p2.stop(now + 0.3);
                break;
            }

            case 'marimba': {
                // Sound 4: Gentle Marimba / Warm Melody
                const notes = [
                    { freq: 523.25, time: 0, dur: 0.3 },
                    { freq: 659.25, time: 0.12, dur: 0.3 },
                    { freq: 783.99, time: 0.24, dur: 0.5 }
                ];
                notes.forEach(n => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(n.freq, now + n.time);
                    gain.gain.setValueAtTime(0.45, now + n.time);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + n.time);
                    osc.stop(now + n.time + n.dur);
                });
                break;
            }

            case 'chime':
            default: {
                // Sound 1: Classic Bell Chime (Rich, melodious two-tone)
                const osc1 = ctx.createOscillator();
                const gain1 = ctx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(587.33, now); // D5
                osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
                gain1.gain.setValueAtTime(0.4, now);
                gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc1.connect(gain1);
                gain1.connect(ctx.destination);
                osc1.start(now);
                osc1.stop(now + 0.45);

                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.type = 'triangle';
                osc2.frequency.setValueAtTime(1174.66, now + 0.16); // D6
                gain2.gain.setValueAtTime(0.5, now + 0.16);
                gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.start(now + 0.16);
                osc2.stop(now + 0.75);
                break;
            }
        }
    } catch (err) {
        console.warn('Synthesis error:', err);
    }
}
