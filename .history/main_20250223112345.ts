import { Plugin, MarkdownPostProcessorContext } from "obsidian";

const SYNOPLUGIN_VERSION = 1.0;

export default class SynoPlugin extends Plugin {
	audioContext: AudioContext | null = null;
	audioNode: AudioWorkletNode | null = null;
	gainNode: GainNode | null = null;
	defaultVolume = 0.5; // Default volume if .vol() is not provided

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

	/** Process Syno Block */
	private async processSynoBlock(source: string, el: HTMLElement) {
		console.log("Processing Syno Block:", source);
		el.empty(); // Clear previous elements

		const cleanSource = source.trim();

		// Check if it is a print statement
		if (cleanSource.startsWith("print(")) {
			const printMessage = cleanSource.replace(/^print\(/, "").replace(/\)$/, "").trim();
			console.log(`Syno Print: ${printMessage}`);
			const printEl = el.createEl("pre", { text: `print("${printMessage}")`, cls: "syno-code-block" });
			printEl.style.color = "#00aa00"; // Green color to differentiate prints
			return;
		}

		// Create Code Display
		const codeDisplay = el.createEl("pre", { text: cleanSource, cls: "syno-code-block" });

		// Create Container for VU Meter + Play Button
		const controlsContainer = el.createEl("span", { cls: "syno-controls" });
		controlsContainer.style.display = "inline-flex";
		controlsContainer.style.alignItems = "center";
		controlsContainer.style.justifyContent = "right";
		controlsContainer.style.position = "absolute";
		controlsContainer.style.bottom = "2px";
		controlsContainer.style.right = "5px";

		// Create ASCII VU Meter
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

		// Parse Frequency and Volume from sin().vol()
		const match = cleanSource.match(/sin\((\d+)\)(?:\.vol\((\d*\.?\d+)\))?/);
		if (!match) {
			console.log("Invalid Syno Command.");
			return;
		}

		const frequency = parseFloat(match[1]);
		const volume = match[2] !== undefined ? parseFloat(match[2]) : this.defaultVolume;

		playButton.onclick = async () => {
			if (!isRunning) {
				console.log(`Playing: sin(${frequency}).vol(${volume})`);
				playButton.textContent = "■"; // Switch to stop symbol
				isRunning = true;
				await this.playSound(frequency, volume, vuMeter);
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
	private async playSound(frequency: number, volume: number, vuMeter: HTMLElement) {
		if (!this.audioContext) {
			this.audioContext = new AudioContext();
			await this.audioContext.audioWorklet.addModule(URL.createObjectURL(new Blob([`
				class ToneProcessor extends AudioWorkletProcessor {
					constructor() {
						super();
						this.sampleRate = sampleRate;
						this.frequency = 440;
						this.phase = 0;
					}
					static get parameterDescriptors() {
						return [{ name: "frequency", defaultValue: 440, minValue: 20, maxValue: 20000 }];
					}
					process(inputs, outputs, parameters) {
						const output = outputs[0];
						const freq = parameters.frequency.length > 0 ? parameters.frequency[0] : this.frequency;
						let level = 0;
						for (let channel = 0; channel < output.length; channel++) {
							const channelData = output[channel];
							for (let i = 0; i < channelData.length; i++) {
								this.phase += (2 * Math.PI * freq) / this.sampleRate;
								const sample = Math.sin(this.phase);
								channelData[i] = sample;
								level = Math.abs(sample);
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
		this.audioNode.parameters.get("frequency")?.setValueAtTime(frequency, this.audioContext.currentTime);
		this.gainNode = this.audioContext.createGain();
		this.gainNode.gain.value = volume;
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
