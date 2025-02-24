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
        const synthRegex = /&((sin|sqr|tri|saw)\(\d+\)(?:\.(ramp|vol|pan|eq)\((?:-?\d+(?:\.\d+)?(?:->-?\d+(?:\.\d+)?,\d+s)?|-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?){9})\))*)/g;

        let updatedContent = textContent.replace(printRegex, (_match, message) => {
            console.log(`Syno Print: ${message}`);
            return `<span class="syno-inline" style="color:green; font-weight:bold;">${message}</span>`;
        });

        updatedContent = updatedContent.replace(synthRegex, (_match, synthCode) => {
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
            // Normalize input to handle multi-line blocks
            const normalizedInput = input.replace(/\n\s*/g, "\n").trim();
            const lines = normalizedInput.split("\n").filter(line => line.length > 0);
            if (lines.length === 0) {
                console.error("Invalid Syno input:", input);
                return;
            }

            // Ensure AudioContext is valid
            if (!this.audioContext || this.audioContext.state === "closed") {
                this.audioContext = new AudioContext();
                await this.audioContext.resume();
            }
            if (this.audioContext.state === "suspended") {
                await this.audioContext.resume();
            }
            if (!this.audioContext) {
                throw new Error("AudioContext failed to initialize");
            }

            this.cleanupNodes();

            // Master Gain with ramp-in on first play
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

            // Handle block-level syntax
            const blockMatch = normalizedInput.match(/^\(([\s\S]+?)\)(\.vol\((?:-?\d+(?:\.\d+)?(?:->-?\d+(?:\.\d+)?,\d+s)?|\d+(\.\d+)?)\))?(\.pan\((-?\d+(\.\d+)?)\))?(\.eq\((?:-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?){9})\))?/m);
            if (blockMatch) {
                const blockLines = blockMatch[1].split("\n").map(line => line.trim()).filter(line => line.length > 0);
                const blockVolume = blockMatch[3] ? this.parseDynamicParam(blockMatch[3]) : null;
                const blockPan = blockMatch[5] ? parseFloat(blockMatch[5]) : null;
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

            // VU Meter Update
            const interval = setInterval(() => {
                if (!this.audioContext || this.activeNodes.length === 0) {
                    clearInterval(interval);
                    vuMeter.textContent = "_";
                    return;
                }
                const avgVolume = this.activeNodes.reduce((sum, node) => sum + node.gain.gain.value, 0) / this.activeNodes.length;
                vuMeter.textContent = avgVolume < 0.34 ? "_" : avgVolume < 0.67 ? "=" : "≡";
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
    private createAndStartNode(parsed: ReturnType<typeof this.parseInput>, blockVolume?: { start: number; end?: number; duration?: number } | null, blockPan?: number | null, blockEq?: number[] | null) {
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
        osc.frequency.value = frequency;

        const gain = this.audioContext.createGain();
        const effectiveVolume = blockVolume !== null && blockVolume !== undefined ? blockVolume : volume;
        gain.gain.value = effectiveVolume.start;
        if (effectiveVolume.end !== undefined && effectiveVolume.duration) {
            gain.gain.linearRampToValueAtTime(effectiveVolume.end, this.audioContext.currentTime + effectiveVolume.duration);
        } else {
            gain.gain.linearRampToValueAtTime(effectiveVolume.start, this.audioContext.currentTime + 0.005);
        }

        const effectivePan = blockPan !== null && blockPan !== undefined ? blockPan : pan;
        const panNode = new StereoPannerNode(this.audioContext, { pan: effectivePan });

        // EQ Setup
        const eqNodes: BiquadFilterNode[] = [];
        const effectiveEq = blockEq || eq || this.masterSettings.eq;
        if (effectiveEq && effectiveEq.length === 10) {
            const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]; // 10-band EQ centered around 1000 Hz
            for (let i = 0; i < 10; i++) {
                const eqNode = this.audioContext.createBiquadFilter();
                eqNode.type = "peaking";
                eqNode.frequency.value = freqs[i];
                eqNode.gain.value = (effectiveEq[i] - 0.5) * 24; // Scale 0-1 to -12dB to +12dB
                eqNode.Q.value = 1; // Moderate bandwidth
                eqNodes.push(eqNode);
            }
            // Chain EQ nodes
            for (let i = 0; i < eqNodes.length - 1; i++) {
                eqNodes[i].connect(eqNodes[i + 1]);
            }
        }

        // Connect nodes
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

        if (rampTarget !== null) {
            console.log(`Ramping ${waveType} from ${frequency}Hz to ${rampTarget}Hz`);
            osc.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            osc.frequency.linearRampToValueAtTime(rampTarget, this.audioContext.currentTime + 2);
        }
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

    /** Parse Dynamic Parameter (e.g., vol(0.3->0.7, 2s)) */
    private parseDynamicParam(input: string): { start: number; end?: number; duration?: number } {
        const dynamicMatch = input.match(/vol\((-?\d+(\.\d+)?)(?:->(-?\d+(\.\d+)?),(\d+)s)?\)/);
        if (!dynamicMatch) {
            console.error("Invalid dynamic parameter:", input);
            return { start: 0.5 };
        }
        const start = parseFloat(dynamicMatch[1]);
        const end = dynamicMatch[3] ? parseFloat(dynamicMatch[3]) : undefined;
        const duration = dynamicMatch[5] ? parseFloat(dynamicMatch[5]) : undefined;
        return { start, end, duration };
    }

    /** Parse Syno Input */
    private parseInput(input: string) {
        const match = input.match(/(sin|sqr|tri|saw)\((\d+)\)(?:\.ramp\((\d+)\))?(?:\.vol\((?:-?\d+(?:\.\d+)?(?:->-?\d+(?:\.\d+)?,\d+s)?|\d+(\.\d+)?)\))?(\.pan\((-?\d+(\.\d+)?)\))?(\.eq\((?:-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?){9})\))?/);
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

        const volume = match[4] ? this.parseDynamicParam(`vol(${match[4]})`) : { start: 0.5 };
        if (volume.start < 0 || volume.start > 1 || (volume.end !== undefined && (volume.end < 0 || volume.end > 1))) {
            console.error("Invalid volume value:", match[4]);
            return null;
        }

        const pan = match[6] ? parseFloat(match[6]) : 0;
        if (isNaN(pan) || pan < -1 || pan > 1) {
            console.error("Invalid pan value:", pan);
            return null;
        }

        const eq = match[8] ? match[8].split(",").map(v => parseFloat(v.trim())) : null;
        if (eq && eq.length !== 10) {
            console.error("EQ must have exactly 10 bands:", match[8]);
            return null;
        }

        return {
            waveType: waveTypeMap[match[1]] || "sine",
            frequency,
            rampTarget: match[3] ? parseFloat(match[3]) : null,
            volume,
            pan,
            eq,
        };
    }
}
