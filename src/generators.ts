// /src/generators.ts
export function createOscillator(
	ctx: AudioContext | OfflineAudioContext,
	type: OscillatorType,
	freq: number
): OscillatorNode {
	const osc = ctx.createOscillator();
	osc.type = type;
	osc.frequency.value = freq;
	return osc;
}
