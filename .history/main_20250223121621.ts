import { Plugin } from "obsidian";

const SYNOPLUGIN_VERSION = 1.0;

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

		// Display text block
		const codeBlock = container.createEl("pre", { text: source });
		codeBlock.style.fontSize = "12px";
		codeBlock.style.fontFamily = "monospace";

		// Controls at bottom-right
		const controlsDiv = container.createDiv({ cls: "syno-controls" });
		controlsDiv.style.display = "flex";
		controlsDiv.style.justifyContent = "flex-end";
		controlsDiv.style.alignItems = "center";
		controlsDiv.style.marginTop = "4px";

		// VU Meter
		const vuMeter = controlsDiv.createEl("span", { text: "_", cls: "syno-vumeter" });
		vuMeter.style.marginRight = "6px";

		// Play button
		const playButton = controlsDiv.createEl("span", { text: "▷", cls: "syno-play-button" });
		playButton.style.cursor = "pointer";

		// Play button behavior
		playButton.onclick = () => {
			if (this.activeNodes.length > 0) {
				this.cleanupAudio();
				playButton.textContent = "▷";
			} else {
				this.playSound(source.trim(), vuMeter, playButton);
				playButton.textContent = "■";
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
			return `<span class="syno-inline">[Printed to Console]</span>`;
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

			// Reset audio context
			if (!this.audioContext || this.audioContext.state === "closed") {
				this.audioContext = new AudioContext();
			}
			this.cleanupAudio();

			// Create Master Gain (Limiter to prevent clipping)
			this.masterGain = this.audioContext.createGain();
			this.masterGain.gain.value = 0.5; // Default volume (Limiter)
			this.masterGain.connect(this.audioContext.destination);

			// Process multiple lines (Parallel Sounds)
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

				// Connect Nodes (Now routed through Master Gain)
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
					osc.frequency.linearRampToValueAtTime(rampTarget, this.audioContext.currentTime + 2);
					setTimeout(() => {
						osc.frequency.linearRampToValueAtTime(frequency, this.audioContext!.currentTime + 2);
					}, 2000);
				}
			}

			// VU Meter Update
			const interval = setInterval(() => {
				if (this.activeNodes.length === 0) {
					clearInterval(interval);
					return;
				}
				const avgVolume = this.activeNodes.reduce((sum, node) => sum + node.gain.gain.value, 0) / this.activeNodes.length;
				vuMeter.textContent = avgVolume < 0.34 ? "_" : avgVolume < 0.67 ? "=" : "≡";
			}, 100);

			// Stop Handling
			playButton.onclick = () => {
				this.cleanupAudio();
				playButton.textContent = "▷";
			};
		} catch (error) {
			console.error(`Error playing sound: ${error}`);
		}
	}

	/** Clean Up Audio */
	private cleanupAudio() {
		if (this.masterGain) {
			this.masterGain.disconnect();
			this.masterGain = null;
		}
		this.activeNodes.forEach(({ osc, gain, pan }) => {
			osc.stop();
			osc.disconnect();
			gain.disconnect();
			pan.disconnect();
		});
		this.activeNodes = [];
	}

	/** Parse Syno Input */
	private parseInput(input: string) {
		if (input.startsWith("print(")) {
			const match = input.match(/print\("([^"]+)"\)/);
			if (match) {
				console.log(`Syno Print: ${match[1]}`);
			}
			return null;
		}

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

		const waveType = waveTypeMap[match[1]] || "sine";
		const frequency = parseFloat(match[2]);
		const rampTarget = match[4] ? parseFloat(match[4]) : null;
		const volume = match[6] ? parseFloat(match[6]) : 0.5;
		const pan = match[9] ? parseFloat(match[9]) : 0;

		return { waveType, frequency, volume, pan, rampTarget };
	}
}
