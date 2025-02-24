export function createNoise(x: number, ctx: AudioContext): AudioBufferSourceNode {
    const bufferSize = 2 * ctx.sampleRate; // 2 seconds of noise
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    // Generate white noise
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1; // -1 to 1
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // Apply spectral shaping based on x (0.0 = white, 0.5 = pink, 1.0 = brown)
    const filter = ctx.createBiquadFilter();
    noiseSource.connect(filter);

    if (x <= 0.0) {
        // White noise (flat spectrum)
        filter.type = "allpass"; // No filtering
        filter.frequency.value = 20000; // Max audible range
    } else if (x <= 0.5) {
        // Pink noise (0.5): -3dB/octave
        filter.type = "lowpass";
        filter.frequency.value = 1000 * (1 - x / 0.5); // Decrease from white to pink
        filter.Q.value = 0.7; // Gentle roll-off
    } else {
        // Brown noise (1.0): -6dB/octave
        filter.type = "lowpass";
        filter.frequency.value = 500 * (1 - (x - 0.5) / 0.5); // Further decrease to brown
        filter.Q.value = 1.0; // Steeper roll-off
    }

    filter.connect(ctx.destination); // Will be reconnected in main.ts
    return noiseSource; // Return the source for start/stop control
}
