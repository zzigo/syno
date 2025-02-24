import { Plugin } from "obsidian";

const SYNOPLUGIN_VERSION = 1.4;

export default class SynoPlugin extends Plugin {
    private audioContext: AudioContext | null = null;
    private activeNodes: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; eqNodes?: BiquadFilterNode[] }[] = [];
    private masterGain: GainNode | null = null;
    private isFirstPlay = true;
    private masterSettings: { volume?: number; pan?: number; eq?: number[] } = {};

    async onload() {
        console.log(`Syno Plugin: Loaded (v${SYNOPLUGIN_VERSION})`);

        this.registerMarkdownCodeBlockProcessor("syno", (source, el) => {
            this.processSynoBlock(source, el);
        });

        this.registerMarkdownCodeBlockProcessor("syno-master", (source, el) => {
            this.processMasterBlock(source, el);
        });

        this.registerMarkdownPostProcessor((el) => {
            this.processInlineSyno(el);
        });
    }

    onunload() {
        console.log(`Syno Plugin: Unloaded (v${SYNOPLUGIN_VERSION})`);
        this.cleanupAudio();
    }

    /** Process Syno Block */
    private processSynoBlock(source: string, el: HTMLElement) {
        console.log("Processing Syno Block:", source);

        const container = el.createDiv({ cls: "syno-container" });

        if (source.trim().startsWith("print(")) {
            const match = source.match(/print\("([^"]+)"\)/);
            if (match) {
                const printMessage = container.createEl("pre", { text: match[1], cls: "syno-print" });
                printMessage.style.color = "green";
                printMessage.style.fontWeight = "bold";
                console.log(`Syno Print: ${match[1]}`);
            }
            return;
        }

        const codeBlock = container.createEl("pre", { text: source });
        codeBlock.style.fontSize = "12px";
        codeBlock.style.fontFamily = "monospace";

        const controlsDiv = container.createDiv({ cls: "syno-controls" });
        controlsDiv.style.display = "flex";
        controlsDiv.style.justifyContent = "flex-end";
        controlsDiv.style.alignItems = "center";
        controlsDiv.style.marginTop = "4px";

        const vuMeter = controlsDiv.createEl("span", { text: "_", cls: "syno-vumeter" });
        vuMeter.style.marginRight = "6px";

        const playButton = controlsDiv.createEl("span", { text: "▷", cls: "syno-play-button" });
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

    /** Process Master Block */
    private processMasterBlock(source: string, el: HTMLElement) {
        console.log("Processing Syno Master Block:", source);
        const lines = source.split("\n").map(line => line.trim()).filter(line => line.length > 0);

        for (const line of lines) {
            if (line.startsWith("vol(")) {
                const match = line.match(/vol\((\d+(\.\d+)?)\)/);
                if (match) this.masterSettings.volume = parseFloat(match[1]);
            } else if (line.startsWith("pan(")) {
                const match = line.match(/pan\((-?\d+(\.\d+)?)\)/);
                if (match) this.masterSettings.pan = parseFloat(match[1]);
            } else if (line.startsWith("eq(")) {
                const match = line.match(/eq\(([^)]+)\)/);
                if (match) {
                    this.masterSettings.eq = match[1].split(",").map(v => parseFloat(v.trim()));
                    if (this.masterSettings.eq.length !== 10) {
                        console.error("EQ must have exactly 10 bands");
                        delete this.masterSettings.eq;
                    }
                }
            }
        }

        el.createEl("pre", { text: "Master Settings Applied", cls: "syno-master" });
    }

    /** Process Inline Syno */
    private processInlineSyno(el: HTMLElement) {
        const textContent = el.innerHTML;
        const printRegex = /&print\("([^"]+)"\)&/g;
        const synthRegex = /&([^&]+)&/g;

        let updatedContent = textContent.replace(printRegex, (_match, message) => {
            console.log(`Syno Print: ${message}`);
            return `<span class="syno-inline" style="color:green; font-weight:bold;">${message}</span>`;
        });

        updatedContent = updatedContent.replace(synthRegex, (_match, synthCode) => {
            const parsed = this.parseInput(synthCode.trim());
            if (!parsed) {
                console.warn(`Invalid inline synth: ${synthCode}`);
                return synthCode;
            }
            const synthSpan = `<span class="syno-inline-synth">${synthCode}</span>`;
            const vuMeter = `<span class="syno-vumeter">_</span>`;
            const playButton = `<span class="syno-play-button" style="cursor:pointer;">▷</span>`;
            return `${synthSpan} ${vuMeter}${playButton}`;
        });

        el.innerHTML = updatedContent;

        el.querySelectorAll(".syno-play-button").forEach((btn) => {
            const synthSpan = btn.parentElement?.querySelector(".syno-inline-synth");
            const vuMeter = btn.parentElement?.querySelector(".syno-vumeter");
            if (!synthSpan || !vuMeter) return;

            const synthCode = synthSpan.textContent || "";
            let isPlaying = false;

            btn.addEventListener("click", async () => {
                if (isPlaying) {
                    await this.stopSound(vuMeter as HTMLElement, btn as HTMLElement);
                    isPlaying = false;
                } else {
                    await this.playSound(synthCode.trim(), vuMeter as HTMLElement, btn as HTMLElement);
                    isPlaying = true;
                }
            });
        });
    }

    /** Play Sound */
    private async playSound(input: string, vuMeter: HTMLElement, playButton: HTMLElement) {
        try {
            const normalizedInput = input.replace(/\n\s*/g, "\n").trim();
            const lines = normalizedInput.split("\n").filter(line => line.length > 0);
            if (lines.length === 0) {
                console.error("Invalid Syno input:", input);
                return;
            }

            if (!this.audioContext || this.audioContext.state === "closed") {
                this.audioContext = new AudioContext();
                await this.audioContext.resume();
                console.log("AudioContext initialized, state:", this.audioContext.state);
            } else if (this.audioContext.state === "suspended") {
                await this.audioContext.resume();
                console.log("AudioContext resumed, state:", this.audioContext.state);
            }
            if (!this.audioContext || this.audioContext.state !== "running") {
                throw new Error("AudioContext is not in a usable state: " + (this.audioContext?.state || "null"));
            }

            this.cleanupNodes();

            this.masterGain = this.audioContext.createGain();
            const masterVol = this.masterSettings.volume ?? 0.8;
            if (this.isFirstPlay) {
                this.masterGain.gain.value = 0;
                this.masterGain.gain.linearRampToValueAtTime(masterVol, this.audioContext.currentTime + 0.005);
                this.isFirstPlay = false;
            } else {
                this.masterGain.gain.value = masterVol;
            }
            this.masterGain.connect(this.audioContext.destination);

            const blockMatch = normalizedInput.match(/^\(([\s\S]+?)\)(\.vol\((?:-?\d+(?:\.\d+)?;-?\d+(?:\.\d+)?,\d+s|\d+(?:\.\d+)?)\))?(\.pan\((?:-?\d+(?:\.\d+)?;-?\d+(?:\.\d+)?,\d+s|-?\d+(?:\.\d+)?)\))?(\.eq\((?:-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?){9})\))?/m);
            if (blockMatch) {
                const blockLines = blockMatch[1].split("\n").map(line => line.trim()).filter(line => line.length > 0);
                const blockVolume = blockMatch[3] ? this.parseRampingParam(blockMatch[3], "vol") : null;
                const blockPan = blockMatch[5] ? this.parseRampingParam(blockMatch[5], "pan") : null;
                const blockEq = blockMatch[7] ? blockMatch[7].split(",").map(v => parseFloat(v.trim())) : null;

                for (const line of blockLines) {
                    if (line.startsWith("print(")) continue;
                    const parsed = this.parseInput(line);
                    if (!parsed) continue;

                    this.createAndStartNode(parsed, blockVolume, blockPan, blockEq);
                }
            } else {
                for (const line of lines) {
                    if (line.startsWith("print(")) continue;
                    if (line.startsWith(")") || line.match(/^\)\.vol/) || line.match(/^\)\.pan/) || line.match(/^\)\.eq/)) continue;
                    const parsed = this.parseInput(line);
                    if (!parsed) continue;

                    this.createAndStartNode(parsed);
                }
            }

            const interval = setInterval(() => {
                if (!this.audioContext || this.activeNodes.length === 0) {
                    clearInterval(interval);
                    vuMeter.textContent = "_";
                    return;
                }
                const avgVolume = this.activeNodes.reduce((sum, node) => sum + node.gain.gain.value, 0) / this.activeNodes.length;
                vuMeter.textContent = avgVolume <= 0.0001 ? "" : avgVolume < 0.32 ? "_" : avgVolume < 0.67 ? "=" : "≡";
            }, 100);

            playButton.textContent = "■";

        } catch (error) {
            console.error(`Error playing sound: ${error}`);
            this.cleanupAudio();
            playButton.textContent = "▷";
            vuMeter.textContent = "_";
        }
    }

    /** Create and Start Audio Node */
    private createAndStartNode(parsed: ReturnType<typeof this.parseInput>, blockVolume?: any, blockPan?: any, blockEq?: number[] | null) {
        if (!parsed || !this.audioContext || !this.masterGain) {
            console.error("Cannot create node: missing context or master gain");
            return;
        }

        const { waveType, frequency, volume, pan, rampTarget, eq } = parsed;

        const osc = this.audioContext.createOscillator();
        if (!osc) {
            console.error("Failed to create OscillatorNode, AudioContext state:", this.audioContext.state);
            return;
        }
        osc.type = waveType;

        const effectiveFreq = rampTarget || frequency;
        if (typeof effectiveFreq === "number") {
            osc.frequency.value = effectiveFreq;
        } else {
            osc.frequency.value = effectiveFreq.start;
            if (effectiveFreq.end !== undefined && effectiveFreq.duration) {
                console.log(`Ramping frequency from ${effectiveFreq.start}Hz to ${effectiveFreq.end}Hz over ${effectiveFreq.duration}s`);
                osc.frequency.linearRampToValueAtTime(effectiveFreq.end, this.audioContext.currentTime + effectiveFreq.duration);
            }
        }

        const gain = this.audioContext.createGain();
        const effectiveVolume = blockVolume !== null && blockVolume !== undefined ? blockVolume : volume;
        if (typeof effectiveVolume === "number") {
            gain.gain.value = effectiveVolume;
            gain.gain.linearRampToValueAtTime(effectiveVolume, this.audioContext.currentTime + 0.005);
        } else {
            gain.gain.value = effectiveVolume.start;
            if (effectiveVolume.end !== undefined && effectiveVolume.duration) {
                console.log(`Ramping volume from ${effectiveVolume.start} to ${effectiveVolume.end} over ${effectiveVolume.duration}s`);
                gain.gain.linearRampToValueAtTime(effectiveVolume.end, this.audioContext.currentTime + effectiveVolume.duration);
            } else {
                gain.gain.linearRampToValueAtTime(effectiveVolume.start, this.audioContext.currentTime + 0.005);
            }
        }

        const panNode = this.audioContext.createStereoPanner();
        const effectivePan = blockPan !== null && blockPan !== undefined ? blockPan : pan;
        if (typeof effectivePan === "number") {
            panNode.pan.value = effectivePan;
        } else {
            panNode.pan.value = effectivePan.start;
            if (effectivePan.end !== undefined && effectivePan.duration) {
                console.log(`Ramping pan from ${effectivePan.start} to ${effectivePan.end} over ${effectivePan.duration}s`);
                panNode.pan.linearRampToValueAtTime(effectivePan.end, this.audioContext.currentTime + effectivePan.duration);
            }
        }

        const eqNodes: BiquadFilterNode[] = [];
        const effectiveEq = blockEq || eq || this.masterSettings.eq;
        if (effectiveEq && effectiveEq.length === 10) {
            const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
            for (let i = 0; i < 10; i++) {
                const eqNode = this.audioContext.createBiquadFilter();
                eqNode.type = "peaking";
                eqNode.frequency.value = freqs[i];
                eqNode.gain.value = (effectiveEq[i] - 0.5) * 24;
                eqNode.Q.value = 1;
                eqNodes.push(eqNode);
            }
            for (let i = 0; i < eqNodes.length - 1; i++) {
                eqNodes[i].connect(eqNodes[i + 1]);
            }
        }

        osc.connect(gain);
        if (eqNodes.length > 0) {
            gain.connect(eqNodes[0]);
            eqNodes[eqNodes.length - 1].connect(panNode);
        } else {
            gain.connect(panNode);
        }
        panNode.connect(this.masterGain);

        this.activeNodes.push({ osc, gain, pan: panNode, eqNodes });

        osc.start();
    }

    /** Stop Sound */
    private async stopSound(vuMeter: HTMLElement, playButton: HTMLElement) {
        try {
            this.cleanupNodes();
            playButton.textContent = "▷";
            vuMeter.textContent = "_";
            if (this.audioContext && this.audioContext.state === "running") {
                await this.audioContext.suspend();
            }
        } catch (error) {
            console.error(`Error stopping sound: ${error}`);
        }
    }

    /** Clean Up Audio Nodes */
    private cleanupNodes() {
        this.activeNodes.forEach(({ osc, gain, pan, eqNodes }) => {
            osc.stop();
            osc.disconnect();
            gain.disconnect();
            pan.disconnect();
            eqNodes?.forEach(node => node.disconnect());
        });
        this.activeNodes = [];
        if (this.masterGain) {
            this.masterGain.disconnect();
            this.masterGain = null;
        }
    }

    /** Full Audio Cleanup */
    private cleanupAudio() {
        this.cleanupNodes();
        if (this.audioContext) {
            this.audioContext.close().catch(err => console.warn("AudioContext close error", err));
            this.audioContext = null;
        }
        this.isFirstPlay = true;
    }

    /** Parse Ramping Parameter */
    private parseRampingParam(input: string, type: "vol" | "pan" | "freq"): number | { start: number; end: number; duration: number } {
        const rampMatch = input.match(new RegExp(`${type}\\\((-?\\d+(?:\\.\\d+)?)(?:;(-?\\d+(?:\\.\\d+)?),(\\d+)s)?\\\)`));
        if (!rampMatch) {
            console.error(`Invalid ${type} parameter:`, input);
            return type === "vol" ? 0.5 : type === "pan" ? 0 : 440;
        }
        const start = parseFloat(rampMatch[1]);
        const end = rampMatch[2] ? parseFloat(rampMatch[2]) : undefined;
        const duration = rampMatch[3] ? parseFloat(rampMatch[3]) : undefined;

        if (end === undefined || duration === undefined) {
            return start;
        }

        if (type === "vol" && (start < 0 || start > 1 || end < 0 || end > 1)) {
            console.error(`Invalid ${type} range:`, input);
            return 0.5;
        }
        if (type === "pan" && (start < -1 || start > 1 || end < -1 || end > 1)) {
            console.error(`Invalid ${type} range:`, input);
            return 0;
        }
        if (type === "freq" && (start <= 0 || end <= 0)) {
            console.error(`Invalid ${type} range:`, input);
            return 440;
        }

        return { start, end, duration };
    }

    /** Parse Syno Input */
    private parseInput(input: string) {
        const match = input.match(/(sin|sqr|tri|saw)\((\d+)\)(?:\.freq\((-?\d+(?:\.\d+)?;-?\d+(?:\.\d+)?,\d+s|\d+(?:\.\d+)?)\))?(?:\.vol\((-?\d+(?:\.\d+)?;-?\d+(?:\.\d+)?,\d+s|\d+(?:\.\d+)?)\))?(\.pan\((-?\d+(?:\.\d+)?;-?\d+(?:\.\d+)?,\d+s|-?\d+(?:\.\d+)?)\))?(\.eq\((?:-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?){9})\))?/);
        if (!match) {
            console.error("Parsing failed for:", input);
            return null;
        }

        const waveTypeMap: Record<string, OscillatorType> = {
            sin: "sine",
            sqr: "square",
            tri: "triangle",
            saw: "sawtooth",
        };

        const frequency = parseFloat(match[2]);
        if (isNaN(frequency) || frequency <= 0) {
            console.error("Invalid frequency value:", match[2]);
            return null;
        }

        const freq = match[3] ? this.parseRampingParam(match[3], "freq") : frequency;
        const volume = match[4] ? this.parseRampingParam(match[4], "vol") : 0.5;
        const pan = match[6] ? this.parseRampingParam(match[6], "pan") : 0;
        const eq = match[8] ? match[8].split(",").map(v => parseFloat(v.trim())) : null;

        if (eq && eq.length !== 10) {
            console.error("EQ must have exactly 10 bands:", match[8]);
            return null;
        }

        return {
            waveType: waveTypeMap[match[1]] || "sine",
            frequency,
            rampTarget: freq,
            volume,
            pan,
            eq,
        };
    }
}
