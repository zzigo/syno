export function createSin(freq: number, ctx: AudioContext): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    return osc;
}
