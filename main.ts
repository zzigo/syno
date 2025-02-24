import { Plugin, MarkdownPostProcessorContext, MarkdownView } from "obsidian";
import { createSin } from "./components/sin";
import { createTri } from "./components/tri";
import { createSaw } from "./components/saw";
import { createSqr } from "./components/sqr";
import { createNoise } from "./components/noise"; // New component
import { applyVol } from "./components/vol";
import { applyPan } from "./components/pan";
import { applyChop } from "./components/chop";
import { applyReverb } from "./components/reverb";

const SYNOPLUGIN_VERSION = 1.5;

export interface AudioBuffer {
    node: AudioNode;
    gain: GainNode;
    pan?: StereoPannerNode;
    duration?: number;
}

export interface Ramp {
    end: number;
    duration: number;
    transition: string;
}

export interface VolRamp extends Ramp {
    start: number;
}

export interface PanRamp extends Ramp {
    start: number;
}

export default class SynoPlugin extends Plugin {
    private audioContext: AudioContext | null = null;
    private activeNodes: { osc: OscillatorNode; gain: GainNode; pan?: StereoPannerNode; interval?: NodeJS.Timeout; started?: boolean }[] = [];
    private masterGain: GainNode | null = null;
    private timers: { id: number; startTime: number; duration: number; interval: NodeJS.Timeout }[] = [];
    private nextTimerId = 1;

    async onload() {
        console.log(`Syno Plugin: Loaded (v${SYNOPLUGIN_VERSION})`);
        this.registerMarkdownCodeBlockProcessor("syno", (source, el, ctx) => {
            this.processSynoBlock(source, el, ctx);
        });

        this.register(() => {
            const style = document.createElement("style");
            style.textContent = `
                .language-syno code {
                    font-family: monospace;
                    color: #d4d4d4;
                }
                .language-syno code .syno-function {
                    color: #c792ea;
                }
                .language-syno code .syno-number {
                    color: #f78c6c;
                }
            `;
            document.head.appendChild(style);
        });
    }

    onunload() {
        console.log(`Syno Plugin: Unloaded (v${SYNOPLUGIN_VERSION})`);
        this.cleanupAudio();
    }

    private processSynoBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        console.log("Processing Syno Block:", source);

        const container = el.createDiv({ cls: "syno-container" });
        const codeBlock = container.createEl("pre", { cls: "language-syno" });
        const code = codeBlock.createEl("code", { cls: "language-syno", text: source });
        code.innerHTML = source
            .replace(/(sin|tri|saw|sqr|vol|pan|chop|reb|gliss|noise)/g, '<span class="syno-function">$1</span>')
            .replace(/(\d+(?:\.\d+)?)/g, '<span class="syno-number">$1</span>');

        const controlsDiv = container.createDiv({ cls: "syno-controls" });
        controlsDiv.style.display = "flex";
        controlsDiv.style.justifyContent = "flex-end";
        controlsDiv.style.alignItems = "center";
        controlsDiv.style.marginTop = "4px";

        const vuMeter = controlsDiv.createEl("span", { text: "", cls: "syno-vumeter" });
        vuMeter.style.marginRight = "6px";

        const playButton = controlsDiv.createEl("span", { text: "▷", cls: "syno-play-button" }) as HTMLElement;
        playButton.style.cursor = "pointer";

        let isPlaying = false;

        playButton.onclick = async () => {
            if (isPlaying) {
                await this.stopSound(vuMeter, playButton);
                isPlaying = false;
            } else {
                await this.playSound(source.trim(), vuMeter, playButton);
                isPlaying = true;
            }
        };
    }

    private async playSound(input: string, vuMeter: HTMLElement, playButton: HTMLElement) {
        if (!this.audioContext) {
            this.audioContext = new AudioContext();
            await this.audioContext.resume();
            console.log("AudioContext initialized, state:", this.audioContext.state);
        } else if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
            console.log("AudioContext resumed, state:", this.audioContext.state);
        }

        this.cleanupAudio();

        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.8;
        this.masterGain.connect(this.audioContext.destination);

        const lines = input.split("\n").map(line => line.trim()).filter(line => line.length > 0);
        let maxDuration = 0;

        for (const line of lines) {
            const parts = line.split(".");
            const waveType = parts[0].match(/(sin|tri|saw|sqr|noise)/)?.[0];
            const freqOrNoise = parseFloat(parts[0].match(/\d+(?:\.\d+)?/)![0] || "440");
            let osc: OscillatorNode;
            switch (waveType) {
                case "tri":
                    osc = createTri(freqOrNoise, this.audioContext);
                    break;
                case "saw":
                    osc = createSaw(freqOrNoise, this.audioContext);
                    break;
                case "sqr":
                    osc = createSqr(freqOrNoise, this.audioContext);
                    break;
                case "noise":
                    osc = createNoise(freqOrNoise, this.audioContext);
                    break;
                case "sin":
                default:
                    osc = createSin(freqOrNoise, this.audioContext);
                    break;
            }

            const gain = this.audioContext.createGain();
            gain.gain.setValueAtTime(0.5, this.audioContext.currentTime); // Default volume
            osc.connect(gain);
            let buffer: AudioBuffer = { node: gain, gain };
            let lineMaxDuration = 0;

            for (let i = 1; i < parts.length; i++) {
                const part = parts[i];
                if (part.startsWith("gliss")) {
                    const glissMatch = part.match(/gliss\((-?\d+(?:\.\d+)?),(\d+)s(?:,(linear|exp|target))?\)/);
                    if (glissMatch) {
                        const ramp: Ramp = {
                            end: parseFloat(glissMatch[1]),
                            duration: parseFloat(glissMatch[2]) ?? 1,
                            transition: glissMatch[3] || "linear"
                        };
                        console.log(`Applying gliss: ${JSON.stringify(ramp)}`);
                        osc.frequency.cancelScheduledValues(this.audioContext.currentTime);
                        osc.frequency.setValueAtTime(freqOrNoise, this.audioContext.currentTime);
                        const endTime = this.audioContext.currentTime + ramp.duration;
                        switch (ramp.transition) {
                            case "exp":
                                osc.frequency.exponentialRampToValueAtTime(Math.max(ramp.end, 0.001), endTime);
                                break;
                            case "target":
                                osc.frequency.setTargetAtTime(ramp.end, this.audioContext.currentTime, ramp.duration / 2);
                                break;
                            case "linear":
                            default:
                                osc.frequency.linearRampToValueAtTime(ramp.end, endTime);
                                break;
                        }
                        this.addTimer(ramp.duration, vuMeter);
                        if (ramp.duration > lineMaxDuration) lineMaxDuration = ramp.duration;
                    }
                } else if (part.startsWith("vol")) {
                    const volMatch = part.match(/vol\((?:(-?\d+(?:\.\d+)?)(?:(?:->|;)(-?\d+(?:\.\d+)?),(\d+)s(?:,(linear|exp|target))?)?)\)/);
                    if (volMatch) {
                        const vol = volMatch[2] ? {
                            start: parseFloat(volMatch[1]),
                            end: parseFloat(volMatch[2]),
                            duration: parseFloat(volMatch[3]) ?? 1,
                            transition: volMatch[4] || "linear"
                        } : parseFloat(volMatch[1]);
                        console.log(`Applying vol: ${JSON.stringify(vol)}`);
                        buffer = applyVol(buffer, this.audioContext, vol);
                        if (typeof vol !== "number") this.addTimer(vol.duration, vuMeter);
                        if (typeof vol !== "number" && vol.duration > lineMaxDuration) lineMaxDuration = vol.duration;
                    }
                } else if (part.startsWith("pan")) {
                    const panMatch = part.match(/pan\((?:(-?\d+(?:\.\d+)?)(?:(?:->|;)(-?\d+(?:\.\d+)?),(\d+)s(?:,(linear|exp|target))?)?)\)/);
                    if (panMatch) {
                        const pan = panMatch[2] ? {
                            start: parseFloat(panMatch[1]),
                            end: parseFloat(panMatch[2]),
                            duration: parseFloat(panMatch[3]) ?? 1,
                            transition: panMatch[4] || "linear"
                        } : parseFloat(panMatch[1]);
                        console.log(`Applying pan: ${JSON.stringify(pan)}`);
                        buffer = applyPan(buffer, this.audioContext, pan);
                        if (typeof pan !== "number") this.addTimer(pan.duration, vuMeter);
                        if (typeof pan !== "number" && pan.duration > lineMaxDuration) lineMaxDuration = pan.duration;
                    }
                } else if (part.startsWith("chop")) {
                    const ms = parseFloat(part.match(/\d+(?:\.\d+)?/)![0]);
                    const result = applyChop(buffer.node, this.audioContext, ms);
                    buffer.node = result.node;
                    this.activeNodes.push({ osc, gain: buffer.gain, pan: buffer.pan, interval: result.interval, started: false });
                } else if (part.startsWith("reb")) {
                    const timeMs = parseFloat(part.match(/\d+(?:\.\d+)?/)![0]) || 100;
                    buffer = applyReverb(buffer, this.audioContext, timeMs);
                }
            }

            buffer.node.connect(this.masterGain);
            const duration = lineMaxDuration > 0 ? lineMaxDuration + 1 : 10;
            const startTime = this.audioContext.currentTime;
            osc.start(startTime);
            const endTime = startTime + duration;
            osc.stop(endTime);
            const nodeIndex = this.activeNodes.length;
            this.activeNodes.push({ osc, gain: buffer.gain, pan: buffer.pan, started: true });
            console.log(`Node ${nodeIndex} started at ${startTime}, stopping at ${endTime}, duration ${duration}s`);
            if (duration > maxDuration) maxDuration = duration;
        }

        const chars = '▁▂▃▄▅▆▇█';
        const interval = setInterval(() => {
            if (!this.audioContext || this.activeNodes.length === 0) {
                clearInterval(interval);
                vuMeter.textContent = "";
                return;
            }

            let totalLeft = 0;
            let totalRight = 0;
            let nodeCount = 0;

            this.activeNodes.forEach((node, index) => {
                const gainValue = node.gain.gain.value;
                const panValue = node.pan ? node.pan.pan.value : 0;
                const leftGain = gainValue * Math.max(0, 1 - panValue);
                const rightGain = gainValue * Math.max(0, 1 + panValue);
                totalLeft += leftGain;
                totalRight += rightGain;
                nodeCount++;
                console.log(`Node ${index}: gain=${gainValue}, pan=${panValue}, left=${leftGain}, right=${rightGain}`);
            });

            const avgLeft = totalLeft / nodeCount;
            const avgRight = totalRight / nodeCount;

            const leftChar = avgLeft === 0 ? "" : chars[Math.floor(avgLeft * (chars.length - 1))];
            const rightChar = avgRight === 0 ? "" : chars[Math.floor(avgRight * (chars.length - 1))];

            const timerDisplay = this.timers
                .map(t => Math.floor((this.audioContext!.currentTime - t.startTime)))
                .reverse()
                .slice(0, 5)
                .join(" ");
            vuMeter.textContent = `${leftChar || ""} ${rightChar || ""} ${timerDisplay}`.trim();
        }, 100);

        playButton.textContent = "■";
    }

    private addTimer(duration: number, vuMeter: HTMLElement) {
        if (this.timers.length >= 5) return; // Max 5 timers
        const id = this.nextTimerId++;
        const startTime = this.audioContext!.currentTime;
        const interval = setTimeout(() => {
            this.timers = this.timers.filter(t => t.id !== id);
            clearInterval(interval);
        }, duration * 1000);
        this.timers.push({ id, startTime, duration, interval });
    }

    private async stopSound(vuMeter: HTMLElement, playButton: HTMLElement) {
        this.cleanupAudio();
        playButton.textContent = "▷";
        vuMeter.textContent = "";
    }

    private cleanupAudio() {
        this.activeNodes.forEach(({ osc, gain, pan, interval, started }) => {
            try {
                if (started) osc.stop();
                osc.disconnect();
                gain.disconnect();
                if (pan) pan.disconnect();
                if (interval) clearInterval(interval);
            } catch (e) {
                console.warn("Error during cleanup:", e);
            }
        });
        this.activeNodes = [];
        this.timers.forEach(t => clearInterval(t.interval));
        this.timers = [];
        if (this.masterGain) {
            this.masterGain.disconnect();
            this.masterGain = null;
        }
    }
}
