import { Plugin } from "obsidian";

const SYNOPLUGIN_VERSION = 1.0;

export default class SynoPlugin extends Plugin {
	audioContext: AudioContext | null = null;
	audioNode: AudioWorkletNode | null = null;
	gainNode: GainNode | null = null;
	panNode: StereoPannerNode | null = null;
	defaultVolume = 0.5;
	defaultPan = 0;
	isRamping = false;

	async onload() {
		console.log(`Syno Plugin: Loaded (v${SYNOPLUGIN_VERSION})`);

		this.registerMarkdownCodeBlockProcessor("syno", (source, el, ctx) => {
			this.processSynoBlock(source, el);
		});
	}

	onunload() {
		console.log(`Syno Plugin: Unloaded (v${SYNOPLUGIN_VERSION})`);
		this.cleanupAudio();
	}

	private async processSynoBlock(source: string, el: HTMLElement) {
		console.log("Processing Syno Block:", source);
		el.empty();

		const cleanSource = source.trim();

		// Handle print() separately
		if (cleanSource.startsWith("print(")) {
			const printMessage = cleanSource.replace(/^print\(/, "").replace(/\)$/, "").trim();
			console.log(`Syno Print: ${printMessage}`);
			const printEl = el.createEl("pre", { text: `print("${printMessage}")`, cls: "syno-code-block" });
			printEl.style.color = "#00aa00";
			return;
		}

		// Create Code Display
		const codeDisplay = el.createEl("pre", { text: cleanSource, cls: "syno-code-block" });

		// Create Container for Controls
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

		// Parse Command
		const match = cleanSource.match(/(sin|tri|saw)\((\d+)\)(?:\.ramp\((\d+)\))?(?:\.vol\((\d*\.?\d+)\))?(?:\.pan\((-?\d*\.?\d+)\))?/);
		if (!match) {
			console.log("Invalid Syno Command.");
			return;
		}

		const waveType = match[1];
		const frequency = parseFloat(match[2]);
		const rampTarget = match[3] ? parseFloat(match[3]) : null;
		const volume = match[4] !== undefined ? parseFloat(match[4]) : this.defaultVolume;
		const pan = match[5] !== undefined ? parseFloat(match[5]) : this.defaultPan;

		playButton.onclick = async () => {
			if (!isRunning) {
				console.log(`Playing: ${cleanSource}`);
				playButton.textContent = "■";
				isRunning = true;
				await this.playSound(waveType, frequency, volume, pan, rampTarget, vuMeter);
			} else {
				console.log(`Stopping execution`);
				playButton.textContent = "▷";
				this.cleanupAudio();
				vuMeter.textContent = "_";
				isRunning = false;
			}
		};
	}

	private async playSound(waveType: string, frequency: number, volume: number, pan: number, rampTarget: number | null, vuMeter: HTMLElement) {
		if (!this.audioContext) {
			this.audioContext = new AudioContext();
			await this.audioContext.audioWorklet.addModule(URL.createObjectURL(new Blob([`
				class ToneProcessor extends AudioWorkletProcessor {
					constructor() {
						super();
						this.sampleRate = sampleRate;
						this.frequency = 440;
						this.phase = 0;
						this.waveType = "sine";
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
								let sample;
								if (this.waveType === "sine") sample = Math.sin(this.phase);
								else if (this.waveType === "triangle") sample = Math.abs((this.phase / Math.PI) - 1) * 2 - 1;
								else if (this.waveType === "sawtooth") sample = ((this.phase / Math.PI) % 2) - 1;
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

		this.panNode = new StereoPannerNode(this.audioContext, { pan: pan });

		this.audioNode.connect(this.gainNode);
		this.gainNode.connect(this.panNode);
		this.panNode.connect(this.audioContext.destination);

		if (rampTarget !== null) {
			this.isRamping = true;
			setInterval(() => {
				const newFreq = this.audioNode!.parameters.get("frequency")!.value === frequency ? rampTarget : frequency;
				this.audioNode!.parameters.get("frequency")!.setValueAtTime(newFreq, this.audioContext!.currentTime);
			}, 1000);
		}

		this.audioNode.port.onmessage = (event) => {
			const level = event.data.level;
			vuMeter.textContent = level < 0.34 ? "_" : level < 0.67 ? "=" : "≡";
		};
	}

	private cleanupAudio() {
		this.isRamping = false;
		if (this.audioNode) this.audioNode.disconnect();
		if (this.gainNode) this.gainNode.disconnect();
		if (this.panNode) this.panNode.disconnect();
		if (this.audioContext) this.audioContext.close();
		this.audioNode = this.gainNode = this.panNode = this.audioContext = null;
	}
}
