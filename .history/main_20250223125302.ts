import { Plugin } from "obsidian";

const SYNOPLUGIN_VERSION = 1.4;

export default class SynoPlugin extends Plugin {
    private audioContext: AudioContext | null = null;
    private activeNodes: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode }[] = [];
    private masterGain: GainNode | null = null;

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

        // Handle print command
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

        // Display text block
        const codeBlock = container.createEl("pre", { text: source });
        codeBlock.style.fontSize = "12px";
        codeBlock.style.fontFamily = "monospace";

        // Controls
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

        // Play/Stop toggle
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
        const regex = /&print\("([^"]+)"\)&/g;
        let textContent = el.innerHTML;

        if (!textContent.match(regex)) return;

        el.innerHTML = textContent.replace(regex, (_match, message) => {
            console.log(`Syno Print: ${message}`);
            return `<span class="syno-inline" style="color:green; font-weight:bold;">${message}</span>`;
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

            // Initialize or resume AudioContext
            if (!this.audioContext || this.audioContext.state === "closed") {
                this.audioContext = new AudioContext();
            }
            if (this.audioContext.state === "suspended") {
                await this.audioContext.resume();
            }

            // Clear any existing nodes
            this.cleanupNodes();

            // Master Gain (Limiter)
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.8; // Slightly higher default volume
            this.masterGain.connect(this.audioContext.destination);

            // Process each sound line
            for (const line of lines) {
                const parsed = this.parseInput(line);
                if (!parsed) {
                    console.error("Invalid Syno input:", line);
                    continue;
                }

                const { waveType, frequency, volume, pan, rampTarget } = parsed;

                // Create Nodes
                const osc = this.audioContext.createOscillator();
                osc.type = waveType;
                osc.frequency.value = frequency;

                const gain = this.audioContext.createGain();
                gain.gain.value = volume;

                const panNode = new StereoPannerNode(this.audioContext, { pan });

                // Connect Nodes
                osc.connect(gain);
                gain.connect(panNode);
                panNode.connect(this.masterGain);

                // Store active nodes
                this.activeNodes.push({ osc, gain, pan: panNode });

                // Start Sound
                osc.start();

                // Handle Ramp if needed
                if (rampTarget !== null) {
                    console.log(`Ramping ${waveType} from ${frequency}Hz to ${rampTarget}Hz`);
                    osc.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
                    osc.frequency.linearRampToValueAtTime(rampTarget, this.audioContext.currentTime + 2);
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

            // Update button state
            playButton.textContent = "■";

        } catch (error) {
            console.error(`Error playing sound: ${error}`);
            this.cleanupAudio(); // Reset on error
            playButton.textContent = "▷";
            vuMeter.textContent = "_";
        }
    }

    /** Stop Sound */
    private async stopSound(vuMeter: HTMLElement, playButton: HTMLElement) {
        try {
            this.cleanupNodes();
            playButton.textContent = "▷";
            vuMeter.textContent = "_";
            if (this.audioContext && this.audioContext.state === "running") {
                await this.audioContext.suspend(); // Suspend instead of closing
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
    }

    /** Parse Syno Input */
    private parseInput(input: string) {
        const match = input.match(/(sin|sqr|tri|saw)\((\d+)\)(\.ramp\((\d+)\))?(\.vol\((\d+(\.\d+)?)\))?(\.pan\((-?\d+(\.\d+)?)\))?/);
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

        const volume = match[6] ? parseFloat(match[6]) : 0.5;
        if (isNaN(volume) || volume < 0 || volume > 1) {
            console.error("Invalid volume value:", match[6]);
            return null;
        }

        const pan = match[9] ? parseFloat(match[9]) : 0;
        if (isNaN(pan) || pan < -1 || pan > 1) {
            console.error("Invalid pan value:", match[9]);
            return null;
        }

        return {
            waveType: waveTypeMap[match[1]] || "sine",
            frequency,
            rampTarget: match[4] ? parseFloat(match[4]) : null,
            volume,
            pan,
        };
    }
}
