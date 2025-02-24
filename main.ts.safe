import { Plugin } from "obsidian";

const SYNOPLUGIN_VERSION = 1.0;

export default class SynoPlugin extends Plugin {
	audioContext: AudioContext | null = null;
	audioNode: OscillatorNode | null = null;
	gainNode: GainNode | null = null;
	panNode: StereoPannerNode | null = null;
	defaultVolume = 0.5;
	defaultPan = 0;

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
		}

		this.audioNode = this.audioContext.createOscillator();
		this.audioNode.type = waveType as OscillatorType;
		this.audioNode.frequency.value = frequency;

		this.gainNode = this.audioContext.createGain();
		this.gainNode.gain.value = volume;

		this.panNode = new StereoPannerNode(this.audioContext, { pan: pan });

		this.audioNode.connect(this.gainNode);
		this.gainNode.connect(this.panNode);
		this.panNode.connect(this.audioContext.destination);

		if (rampTarget !== null) {
			console.log(`Ramping from ${frequency}Hz to ${rampTarget}Hz`);
			this.audioNode.frequency.setTargetAtTime(rampTarget, this.audioContext.currentTime, 1);
			setInterval(() => {
				const currentFreq = this.audioNode!.frequency.value;
				const newFreq = currentFreq === frequency ? rampTarget : frequency;
				this.audioNode!.frequency.setTargetAtTime(newFreq, this.audioContext!.currentTime, 1);
			}, 2000);
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
		if (this.audioNode) this.audioNode.stop();
		if (this.audioNode) this.audioNode.disconnect();
		if (this.gainNode) this.gainNode.disconnect();
		if (this.panNode) this.panNode.disconnect();
		if (this.audioContext) this.audioContext.close();
		this.audioNode = this.gainNode = this.panNode = this.audioContext = null;
	}
}
