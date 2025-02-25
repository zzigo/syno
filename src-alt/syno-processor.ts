// src/worklets/syno-processor.ts
class SynoProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: "frequency", defaultValue: 440, minValue: 20, maxValue: 20000, automationRate: "a-rate" },
            { name: "gain", defaultValue: 1.0, minValue: 0.0, maxValue: 1.0 },
            { name: "pan", defaultValue: 0.0, minValue: -1.0, maxValue: 1.0 },
            { name: "gliss", defaultValue: 440, minValue: 20, maxValue: 20000 },
            { name: "glissTime", defaultValue: 5.0, minValue: 0.01, maxValue: 10.0 }
        ];
    }

    constructor() {
        super();
        this.currentFrequency = 440;
        this.targetFrequency = 440;
        this.glissStartTime = 0;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const frequencyParam = parameters.frequency;
        const gainParam = parameters.gain;
        const panParam = parameters.pan;
        const glissParam = parameters.gliss;
        const glissTimeParam = parameters.glissTime;

        const sampleRate = sampleRate;
        const numSamples = output[0].length;

        for (let i = 0; i < numSamples; i++) {
            const time = i / sampleRate;

            if (glissParam.length > 0 && glissTimeParam.length > 0) {
                const elapsedTime = currentTime - this.glissStartTime;
                if (elapsedTime < glissTimeParam[0]) {
                    const progress = elapsedTime / glissTimeParam[0];
                    this.currentFrequency = this.lerp(this.currentFrequency, glissParam[0], progress);
                }
            }

            const freq = frequencyParam.length > 1 ? frequencyParam[i] : this.currentFrequency;
            const gain = gainParam.length > 1 ? gainParam[i] : gainParam[0];
            const pan = panParam.length > 1 ? panParam[i] : panParam[0];

            const sampleValue = Math.sin(2 * Math.PI * freq * (currentTime + time));
            
            // Stereo panning
            output[0][i] = sampleValue * gain * (1 - pan); // Left
            output[1][i] = sampleValue * gain * (1 + pan); // Right
        }

        return true;
    }

    lerp(start, end, progress) {
        return start + (end - start) * progress;
    }
}

registerProcessor("syno-processor", SynoProcessor);
