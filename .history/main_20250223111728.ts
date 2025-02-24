import { Plugin, MarkdownPostProcessorContext } from "obsidian";

const SYNOPLUGIN_VERSION = 1.0;

export default class SynoPlugin extends Plugin {
	audioContext: AudioContext | null = null;
	audioNode: AudioWorkletNode | null = null;
	gainNode: GainNode | null = null;

	async onload() {
		console.log(`Syno Plugin: Loaded (v${SYNOPLUGIN_VERSION})`);

		// Register Block Processor
		this.registerMarkdownCodeBlockProcessor("syno", (source, el, ctx) => {
			this.processSynoBlock(source, el);
		});
	}

	onunload() {
		console.log(`Syno Plugin: Unloaded (v${SYNOPLUGIN_VERSION})`);
		this.cleanupAudio();
	}

	/** Process Syno Block ```syno print("hello syno")``` */
	private async processSynoBlock(source: string, el: HTMLElement) {
		console.log("Processing Syno Block:", source);
		el.empty(); // Clear previous elements

		// Trim Source
		const cleanSource = source.trim().replace(/^print\(/, "").replace(/\)$/, "");

		// Create Code Display
		const codeDisplay = el.createEl("pre", { text: `print("${cleanSource}")`, cls: "syno-code-block" });

		// Create Container for VU Meter + Play Button
		const controlsContainer = el.createEl("span", { cls: "syno-controls" });
		controlsContainer.style.display = "inline-flex";
		controlsContainer.style.alignItems = "center";
		controlsContainer.style.justifyContent = "right";
		controlsContainer.style.position = "absolute";
		controlsContainer.style.bottom = "2px";
		controlsContainer.style.right = "5px";

		// Create ASCII VU Meter (One Character, before Play Button)
		const vuMeter = controlsContainer.createEl("span", { text: "_", cls: "syno-vumeter" });
		vuMeter.style.marginRight = "5px";

		// Create Play Button
		const playButton = controlsContainer.createEl("span", {
			text: "▷",
			cls: "syno-play-button",
		});
		playButton.style.cursor = "pointer";

		// Append to Block
		el.appendChild(codeDisplay);
		el.appendChild(controlsContainer);
		controlsContainer.prepend(vuMeter, playButton);

		// Execution State
		let isRunning = false;

		playButton.onclick = async () => {
			if (!isRunning) {
				console.log(`Executing: ${cleanSource}`);
				playButton.textContent = "■"; // Switch to stop symbol
				isRunning = true;
				await this.playSound(vuMeter);
			} else {
				console.log(`Stopping execution`);
				playButton.textContent = "▷"; // Reset to Play symbol
				this.cleanupAudio();
				vuMeter.textContent = "_"; // Reset VU meter
				isRunning = false;
			}
		};
	}

	/** Play Sound using Audio Worklet */
	private async playSound(vuMeter: HTMLElement) {
		if (!this.audioContext) {
			this.audioContext = new AudioContext();
			await this.audioContext.audioWorklet.addModule(URL.createObjectURL(new Blob([`
				class ToneProcessor extends AudioWorkletProcessor {
					constructor() {
						super();
						this.sampleRate = sampleRate; // Fix the undefined error
						this.frequency = 440;
						this.phase = 0;
					}
					process(inputs, outputs, parameters) {
						const output = outputs[0];
						const freq = this.frequency;
						let level = 0;
						for (let channel = 0; channel < output.length; channel++) {
							const channelData = output[channel];
							for (let i = 0; i < channelData.length; i++) {
								this.phase += (2 * Math.PI * freq) / this.sampleRate;
								const sample = Math.sin(this.phase);
								channelData[i] = sample;
								level = Math.abs(sample); // Get volume level
								if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
							}
						}
						this.port.postMessage({ level: level });
						return true;
					}
				}
				registerProcessor('tone-processor', ToneProcessor);
			`], { type: "application/javascript" })));
		}

		this.audioNode = new AudioWorkletNode(this.audioContext, "tone-processor");
		this.gainNode = this.audioContext.createGain();
		this.audioNode.connect(this.gainNode);
		this.gainNode.connect(this.audioContext.destination);

		// Listen to Worklet messages for VU meter update
		this.audioNode.port.onmessage = (event) => {
			const level = event.data.level;
			if (level < 0.34) vuMeter.textContent = "_"; // Low Volume
			else if (level < 0.67) vuMeter.textContent = "="; // Medium Volume
			else vuMeter.textContent = "≡"; // High Volume
		};
	}

	/** Cleanup Audio */
	private cleanupAudio() {
		if (this.audioNode) {
			this.audioNode.disconnect();
			this.audioNode = null;
		}
		if (this.gainNode) {
			this.gainNode.disconnect();
			this.gainNode = null;
		}
		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}
	}
}
