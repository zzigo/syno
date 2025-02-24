export function createTri(freq: number, ctx: AudioContext): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    return osc;
}
