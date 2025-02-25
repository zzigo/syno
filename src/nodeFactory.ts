// /src/nodeFactory.ts
import { SynthNode } from "./parser";
import { createOscillator } from "./generators";

export class NodeFactory {
	createNode(
		ctx: AudioContext | OfflineAudioContext,
		node: SynthNode
	): OscillatorNode | null {
		const freq =
			typeof node.freq === "number"
				? node.freq
				: typeof node.freq === "object"
				? node.freq.start
				: 440;
		switch (node.type) {
			case "s":
				return createOscillator(ctx, "sine", freq);
			case "t":
				return createOscillator(ctx, "triangle", freq);
			case "a":
				return createOscillator(ctx, "sawtooth", freq);
			case "q":
				return createOscillator(ctx, "square", freq);
			case "b": // Buffer type, no oscillator needed
				return null;
			default:
				console.error(`Unknown generator type: ${node.type}`);
				return null;
		}
	}
}
