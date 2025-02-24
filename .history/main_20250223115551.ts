import { Plugin } from "obsidian";

const SYNOPLUGIN_VERSION = 1.0;

export default class SynoPlugin extends Plugin {
	audioContext: AudioContext | null = null;
	audioNode: OscillatorNode | null = null;
	gainNode: GainNode | null = null;
	panNode: StereoPannerNode | null = null;
	defaultVolume = 0.5;
	defaultPan = 0;
	rampInterval: number | null = null; // Store ramping interval

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

		// Handle print() separately (only logs to console)
		if (cleanSource.startsWith("print(")) {
			const printMessage = cleanSource.replace(/^print\(/, "").replace(/\)$/, "").trim();
			console.log(`Syno Print: ${printMessage}`);
			el.createEl("pre", { text: `print("${printMessage}")`, cls: "syno-code-block" });
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
		const match = cleanSource.match(/(sin|tri|saw|sqr)\((\d+)\)(?:\.ramp\((\d+)\))?(?:\.vol\((\d*\.?\d+)\))?(?:\.pan\((-?\d*\.?\d+)\))?/);
		if (!match) {
			console.log("Invalid Syno Command.");
			return;
		}

		const waveType = this.getWaveType(match[1]);
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

	private getWaveType(type: string): OscillatorType {
	switch (type) {
		case "sin": return "sine";
		case "tri": return "triangle";
		case "saw": return "sawtooth";
		case "sqr": return "square";
		default: throw new Error(`Invalid waveform type: ${type}`);
	}
}

	private async playSound(waveType: OscillatorType, frequency: number, volume: number, pan: number, rampTarget: number | null, vuMeter: HTMLElement) {
		// **🔧 Ensure AudioContext is always initialized**
		if (!this.audioContext || this.audioContext.state === "closed") {
			this.audioContext = new AudioContext();
		}

		// Reset existing audio to ensure a fresh start
		this.cleanupAudio();

		this.audioNode = this.audioContext.createOscillator();
		this.audioNode.type = waveType;
		this.audioNode.frequency.value = frequency;

		this.gainNode = this.audioContext.createGain();
		this.gainNode.gain.value = volume;

		this.panNode = new StereoPannerNode(this.audioContext, { pan: pan });

		this.audioNode.connect(this.gainNode);
		this.gainNode.connect(this.panNode);
		this.panNode.connect(this.audioContext.destination);

		if (rampTarget !== null) {
			console.log(`Ramping from ${frequency}Hz to ${rampTarget}Hz`);
			this.audioNode.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
			this.audioNode.frequency.linearRampToValueAtTime(rampTarget, this.audioContext.currentTime + 2);

			// Clear any existing interval before starting a new one
			if (this.rampInterval) clearInterval(this.rampInterval);

			this.rampInterval = window.setInterval(() => {
				if (this.audioNode) {
					const currentFreq = this.audioNode.frequency.value;
					const newFreq = currentFreq === frequency ? rampTarget : frequency;
					this.audioNode.frequency.linearRampToValueAtTime(newFreq, this.audioContext!.currentTime + 2);
				}
			}, 4000);
		}

		this.audioNode.start();

		// Monitor amplitude for VU Meter
		const analyser = this.audioContext.createAnalyser();
		this.gainNode.connect(analyser);
		const dataArray = new Uint8Array(analyser.frequencyBinCount);
		const updateVuMeter = () => {
			analyser.getByteFrequencyData(dataArray);
			const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
			vuMeter.textContent = avg < 0.34 ? "_" : avg < 0.67 ? "=" : "≡";
			if (this.audioNode) requestAnimationFrame(updateVuMeter);
		};
		updateVuMeter();
	}

	private cleanupAudio() {
		if (this.audioNode) {
			this.audioNode.stop();
			this.audioNode.disconnect();
		}
		if (this.gainNode) this.gainNode.disconnect();
		if (this.panNode) this.panNode.disconnect();

		// **🔧 Do NOT close the AudioContext**
		this.audioNode = this.gainNode = this.panNode = null;

		// Clear ramp interval if active
		if (this.rampInterval) {
			clearInterval(this.rampInterval);
			this.rampInterval = null;
		}
	}
}
