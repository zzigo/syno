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

		// Register Inline Processor
		this.registerMarkdownPostProcessor((el, ctx) => {
			this.processInlineSyno(el);
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
		const codeDisplay = el.createEl("pre", { text: `print("${cleanSource}")` });

		// Create Play Button
		const playButton = el.createEl("span", {
			text: "▷",
			cls: "syno-play-button",
		});
		playButton.style.cursor = "pointer";
		playButton.style.marginLeft = "10px";

		// Create ASCII VU Meter
		const vuMeter = el.createEl("pre", { text: "_".repeat(10) }); // Initial meter

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
				isRunning = false;
			}
		};

		el.appendChild(codeDisplay);
		el.appendChild(playButton);
		el.appendChild(vuMeter);
	}

	/** Process Inline Syno: &print("message")& */
	private processInlineSyno(el: HTMLElement) {
		const regex = /&print\("([^"]+)"\)&/g;
		let textContent = el.innerHTML;

		if (!textContent.match(regex)) return;

		el.innerHTML = textContent.replace(regex, (_match, message) => {
			console.log(`Inline Syno Detected: ${message}`);
			return `<span class="syno-inline" style="cursor:pointer; white-space:nowrap;">print("${message}") ▷</span>`;
		});
	}

	/** Play Sound using Audio Worklet */
	private async playSound(vuMeter: HTMLElement) {
		if (!this.audioContext) {
			this.audioContext = new AudioContext();
			await this.audioContext.audioWorklet.addModule(URL.createObjectURL(new Blob([`
				class ToneProcessor extends AudioWorkletProcessor {
					constructor() {
						super();
						this.frequency = 440;
					}
					process(inputs, outputs, parameters) {
						const output = outputs[0];
						const sampleRate = sampleRate;
						const freq = this.frequency;
						for (let channel = 0; channel < output.length; channel++) {
							const channelData = output[channel];
							for (let i = 0; i < channelData.length; i++) {
								channelData[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
							}
						}
						this.port.postMessage({ level: Math.random() * 10 }); // Fake VU meter update
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
			const level = Math.round(event.data.level);
			vuMeter.textContent = "_".repeat(10 - level) + "≡".repeat(level);
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
