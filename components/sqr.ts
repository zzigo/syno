export function createSqr(freq: number, ctx: AudioContext): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    return osc;
}
