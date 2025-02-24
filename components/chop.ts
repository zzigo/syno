export function applyChop(node: AudioNode, ctx: AudioContext, ms: number): { node: AudioNode; interval: NodeJS.Timeout } {
    const gain = ctx.createGain();
    node.connect(gain);
    let isOn = true;
    const interval = setInterval(() => {
        isOn = !isOn;
        gain.gain.setValueAtTime(isOn ? 1 : 0, ctx.currentTime);
    }, ms);
    return { node: gain, interval };
}
