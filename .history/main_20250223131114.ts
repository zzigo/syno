import { Plugin } from "obsidian";

const SYNOPLUGIN_VERSION = 1.4;

export default class SynoPlugin extends Plugin {
    private audioContext: AudioContext | null = null;
    private activeNodes: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode }[] = [];
    private masterGain: GainNode | null = null;
    private isFirstPlay = true;

    async onload() {
        console.log(`Syno Plugin: Loaded (v${SYNOPLUGIN_VERSION})`);

        this.registerMarkdownCodeBlockProcessor("syno", (source, el) => {
            this.processSynoBlock(source, el);
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

    /** Process Inline Syno */
    private processInlineSyno(el: HTMLElement) {
        const textContent = el.innerHTML;
        const printRegex = /&print\("([^"]+)"\)&/g;
        const synthRegex = /&((sin|sqr|tri|saw)\(\d+\)(?:\.(?:ramp|vol|pan)\(-?\d+(?:\.\d+)?\))*)/g;

        // Handle print commands
        let updatedContent = textContent.replace(printRegex, (_match, message) => {
            console.log(`Syno Print: ${message}`);
            return `<span class="syno-inline" style="color:green; font-weight:bold;">${message}</span>`;
        });

        // Handle inline synths
        updatedContent = updatedContent.replace(synthRegex, (_match, synthCode) => {
            const synthSpan = `<span class="syno-inline-synth">${synthCode}</span>`;
            const vuMeter = `<span class="syno-vumeter">_</span>`;
            const playButton = `<span class="syno-play-button" style="cursor:pointer;">▷</span>`;
            return `${synthSpan} ${vuMeter}${playButton}`;
        });

        el.innerHTML = updatedContent;

        // Attach play button handlers
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
            const lines = input.split("\n").map(line => line.trim()).filter(line => line.length > 0);
            if (lines.length === 0) {
                console.error("Invalid Syno input:", input);
                return;
            }

            // Ensure AudioContext is valid
            if (!this.audioContext || this.audioContext.state === "closed") {
                this.audioContext = new AudioContext();
                await this.audioContext.resume(); // Ensure it starts running
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
            if (this.isFirstPlay) {
                this.masterGain.gain.value = 0;
                this.masterGain.gain.linearRampToValueAtTime(0.8, this.audioContext.currentTime + 0.005);
                this.isFirstPlay = false;
            } else {
                this.masterGain.gain.value = 0.8;
            }
            this.masterGain.connect(this.audioContext.destination);

            // Handle block-level syntax (supporting nested placeholders)
            const blockMatch = input.match(/^\(([\s\S]+?)\)(\.vol\((\d+(\.\d+)?)\))?(\.pan\((-?\d+(\.\d+)?)\))?$/m);
            if (blockMatch) {
                const blockLines = blockMatch[1].split("\n").map(line => line.trim()).filter(line => line.length > 0);
                const blockVolume = blockMatch[3] ? parseFloat(blockMatch[3]) : null;
                const blockPan = blockMatch[6] ? parseFloat(blockMatch[6]) : null;

                for (const line of blockLines) {
                    if (line.startsWith("print(")) continue; // Skip print in blocks
                    const parsed = this.parseInput(line);
                    if (!parsed) continue;

                    this.createAndStartNode(parsed, blockVolume, blockPan);
                }
            } else {
                for (const line of lines) {
                    if (line.startsWith("print(")) continue; // Skip print commands
                    if (line.startsWith(")") || line.includes(").vol") || line.includes(").pan")) continue; // Skip block effects
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
    private createAndStartNode(parsed: ReturnType<typeof this.parseInput>, blockVolume?: number | null, blockPan?: number | null) {
        if (!parsed || !this.audioContext || !this.masterGain) {
            console.error("Cannot create node: missing context or master gain");
            return;
        }

        const { waveType, frequency, volume, pan, rampTarget } = parsed;

        const osc = this.audioContext.createOscillator();
        if (!osc) {
            console.error("Failed to create OscillatorNode, AudioContext state:", this.audioContext.state);
            return;
        }
        osc.type = waveType;
        osc.frequency.value = frequency; // Line ~127 where TypeError occurs

        const gain = this.audioContext.createGain();
        const effectiveVolume = blockVolume !== null && blockVolume !== undefined ? blockVolume : volume;
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(effectiveVolume, this.audioContext.currentTime + 0.005);

        const effectivePan = blockPan !== null && blockPan !== undefined ? blockPan : pan;
        const panNode = new StereoPannerNode(this.audioContext, { pan: effectivePan });

        osc.connect(gain);
        gain.connect(panNode);
        panNode.connect(this.masterGain);

        this.activeNodes.push({ osc, gain, pan: panNode });

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
        this.activeNodes.forEach(({ osc, gain, pan }) => {
            osc.stop();
            osc.disconnect();
            gain.disconnect();
            pan.disconnect();
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

    /** Parse Syno Input */
    private parseInput(input: string) {
        const match = input.match(/(sin|sqr|tri|saw)\((\d+)\)(?:\.ramp\((\d+)\))?(?:\.vol\((\d+(\.\d+)?)\))?(?:\.pan\((-?\d+(\.\d+)?)\))?(?:\.vol\((\d+(\.\d+)?)\))?(?:\.pan\((-?\d+(\.\d+)?)\))?/);
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

        const volume1 = match[4] ? parseFloat(match[4]) : null;
        const volume2 = match[8] ? parseFloat(match[8]) : null;
        const volume = volume2 !== null ? volume2 : volume1 !== null ? volume1 : 0.5;
        if (isNaN(volume) || volume < 0 || volume > 1) {
            console.error("Invalid volume value:", volume);
            return null;
        }

        const pan1 = match[6] ? parseFloat(match[6]) : null;
        const pan2 = match[10] ? parseFloat(match[10]) : null;
        const pan = pan2 !== null ? pan2 : pan1 !== null ? pan1 : 0;
        if (isNaN(pan) || pan < -1 || pan > 1) {
            console.error("Invalid pan value:", pan);
            return null;
        }

        return {
            waveType: waveTypeMap[match[1]] || "sine",
            frequency,
            rampTarget: match[3] ? parseFloat(match[3]) : null,
            volume,
            pan,
        };
    }
}
