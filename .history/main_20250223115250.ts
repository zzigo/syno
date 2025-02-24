private async playSound(waveTypeStr: string, frequency: number, volume: number, pan: number, rampTarget: number | null, vuMeter: HTMLElement) {
	try {
		const waveType = this.getWaveType(waveTypeStr); // Convert "sin" → "sine"

		// Ensure AudioContext is initialized
		if (!this.audioContext || this.audioContext.state === "closed") {
			this.audioContext = new AudioContext();
		}

		// Reset previous audio
		this.cleanupAudio();

		this.audioNode = this.audioContext.createOscillator();
		this.audioNode.type = waveType;
		this.audioNode.frequency.value = frequency;

		this.gainNode = this.audioContext.createGain();
		this.gainNode.gain.value = volume;

		this.panNode = new StereoPannerNode(this.audioContext, { pan });

		this.audioNode.connect(this.gainNode);
		this.gainNode.connect(this.panNode);
		this.panNode.connect(this.audioContext.destination);

		// Handle ramping
		if (rampTarget !== null) {
			console.log(`Ramping from ${frequency}Hz to ${rampTarget}Hz`);
			this.audioNode.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
			this.audioNode.frequency.linearRampToValueAtTime(rampTarget, this.audioContext.currentTime + 2);

			// Clear old ramp intervals
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

		// Update VU Meter
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
	} catch (error) {
		console.error(`Error playing sound: ${error}`);
	}
}
