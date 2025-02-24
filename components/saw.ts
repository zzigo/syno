export function createSaw(freq: number, ctx: AudioContext): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    return osc;
}
