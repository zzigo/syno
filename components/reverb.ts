import { AudioBuffer } from "../main";

export function applyReverb(buffer: AudioBuffer, ctx: AudioContext, timeMs: number): AudioBuffer {
    const reverb = ctx.createConvolver();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();

    const sampleRate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * (timeMs / 1000))); // Min 1 frame
    const impulse = ctx.createBuffer(2, length, sampleRate);
    for (let i = 0; i < length; i++) {
        const decay = Math.exp(-i / (sampleRate * (timeMs / 2000)));
        impulse.getChannelData(0)[i] = (Math.random() * 2 - 1) * decay;
        impulse.getChannelData(1)[i] = (Math.random() * 2 - 1) * decay;
    }
    reverb.buffer = impulse;

    buffer.node.connect(dryGain);
    buffer.node.connect(reverb);
    reverb.connect(wetGain);

    const output = ctx.createGain();
    dryGain.connect(output);
    wetGain.connect(output);

    dryGain.gain.value = 0.7;
    wetGain.gain.value = 0.3;

    buffer.node = output;
    return buffer;
}
