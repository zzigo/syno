import { Plugin } from "obsidian";

const SYNOPLUGIN_VERSION = 1.0; // Static version number

export default class SynoPlugin extends Plugin {
	private audioContext: AudioContext | null = null;
	private audioNode: OscillatorNode | null = null;
	private gainNode: GainNode | null = null;
	private panNode: StereoPannerNode | null = null;
	private isPlaying = false;

	async onload() {
		console.log(`Syno Plugin: Loaded (v${SYNOPLUGIN_VERSION})`);

		// Register Block Processor (```syno)
		this.registerMarkdownCodeBlockProcessor("syno", (source, el) => {
			this.processSynoBlock(source, el);
		});

		// Register Inline Processor (&print("message")&)
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

		// Keep the command visible in Live Preview
		const codeBlock = container.createEl("pre", { text: source });
		codeBlock.style.fontSize = "12px";
		codeBlock.style.fontFamily = "monospace";

		// Create play button
		const playButton = container.createEl("span", { text: "▷", cls: "syno-play-button" });
		playButton.style.cursor = "pointer";

		// Create vumeter (single character)
		const vuMeter = container.createEl("span", { text: "_", cls: "syno-vumeter" });

		// Play button action
		playButton.onclick = () => {
			if (this.isPlaying) {
				this.cleanupAudio();
				playButton.textContent = "▷";
			} else {
				this.playSound(source.trim(), vuMeter, playButton);
				playButton.textContent = "■";
			}
		};
	}

	/** Process Inline Syno: &print("message")& */
	private processInlineSyno(el: HTMLElement) {
		const regex = /&print$begin:math:text$"([^"]+)"$end:math:text$&/g;
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
			// Parse function chain
			const parsed = this.parseInput(input);
			if (!parsed) {
				console.error("Invalid Syno input:", input);
				return;
			}

			const { waveType, frequency, volume, pan, rampTarget } = parsed;

			// Reset Audio Context
			if (!this.audioContext || this.audioContext.state === "closed") {
				this.audioContext = new AudioContext();
			}
			this.cleanupAudio();

			// Create Nodes
			this.audioNode = this.audioContext.createOscillator();
			this.audioNode.type = waveType;
			this.audioNode.frequency.value = frequency;

			this.gainNode = this.audioContext.createGain();
			this.gainNode.gain.value = volume;

			this.panNode = new StereoPannerNode(this.audioContext, { pan });

			// Connect Nodes
			this.audioNode.connect(this.gainNode);
			this.gainNode.connect(this.panNode);
			this.panNode.connect(this.audioContext.destination);

			// Start Sound
			this.audioNode.start();
			this.isPlaying = true;

			// Handle Ramp if needed
			if (rampTarget !== null) {
				console.log(`Ramping from ${frequency}Hz to ${rampTarget}Hz`);
				this.audioNode.frequency.linearRampToValueAtTime(rampTarget, this.audioContext.currentTime + 2);
				setTimeout(() => {
					this.audioNode!.frequency.linearRampToValueAtTime(frequency, this.audioContext!.currentTime + 2);
				}, 2000);
			}

			// VU Meter Update
			const interval = setInterval(() => {
				if (!this.gainNode) {
					clearInterval(interval);
					return;
				}
				const volumeLevel = this.gainNode.gain.value;
				vuMeter.textContent = volumeLevel < 0.34 ? "_" : volumeLevel < 0.67 ? "=" : "≡";
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
		if (this.audioNode) {
			this.audioNode.stop();
			this.audioNode.disconnect();
		}
		if (this.gainNode) {
			this.gainNode.disconnect();
		}
		if (this.panNode) {
			this.panNode.disconnect();
		}
		this.audioNode = null;
		this.gainNode = null;
		this.panNode = null;
		this.isPlaying = false;
	}

	/** Parse Syno Input */
	private parseInput(input: string) {
		const match = input.match(/(sin|sqr|tri|saw)$begin:math:text$(\\d+)$end:math:text$(\.ramp$begin:math:text$(\\d+)$end:math:text$)?(\.vol$begin:math:text$(\\d+(\\.\\d+)?)$end:math:text$)?(\.pan$begin:math:text$(-?\\d+(\\.\\d+)?)$end:math:text$)?/);
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
