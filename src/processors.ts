// /src/processors.ts
// Strategy: Applies audio effects to nodes (e.g., chop, reverb)
// Design Pattern: Strategy - Pluggable effects processors

export class AudioProcessors {
  static applyChop(ctx: AudioContext, source: AudioNode, rate: number, startTime: number): AudioNode {
    const chopRate = 0.1 + (rate * 0.8) / 9; // 0.1-0.9s
    const gain = ctx.createGain();
    source.connect(gain);

    const toggle = (time: number) => {
      gain.gain.setValueAtTime(1, time);
      gain.gain.setValueAtTime(0, time + chopRate / 2);
      gain.gain.setValueAtTime(1, time + chopRate);
    };
    toggle(startTime);
    let nextTime = startTime + chopRate;
    const intervalId = setInterval(() => {
      toggle(nextTime);
      nextTime += chopRate;
    }, chopRate * 1000);
    (AudioProcessors as any).chopInterval = intervalId;

    return gain;
  }

  static applyReverb(ctx: AudioContext, source: AudioNode, decay: number): AudioNode {
    const reverbTime = decay;
    const convolver = ctx.createConvolver();
    const impulse = this.createImpulse(ctx, reverbTime);
    convolver.buffer = impulse;
    source.connect(convolver);
    return convolver;
  }

  private static createImpulse(ctx: AudioContext, decay: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * decay;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      left[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      right[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }

    return impulse;
  }
}