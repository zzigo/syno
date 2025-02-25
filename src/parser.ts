// /src/parser.ts
// Interpreter: Parses SYNO syntax into an Abstract Syntax Tree (AST) for audio execution
// Design Pattern: Interpreter - Converts live-coding syntax into executable commands

import { matdisp, GeneratorType } from "./matdisp";

export interface Transition {
	start: number;
	end: number;
	duration: number;
}

export interface SynthNode {
	type: GeneratorType;
	startTime?: number; // New: Scheduling in seconds
	freq?: number | Transition;
	volume?: number | Transition;
	pan?: number | Transition;
	envelope?: string;
	chop?: number;
	reverb?: number;
	filter?: number | Transition;
}

export interface MasterNode {
	type: "master";
	volume?: number;
}

export type AudioNodeType = SynthNode | MasterNode;

export class Parser {
	private defaults = matdisp;

	parse(input: string): AudioNodeType[] {
		const lines = input
			.split("\n")
			.map((line) => {
				const trimmed = line.trim();
				return trimmed.startsWith("#")
					? ""
					: trimmed.split("#")[0].trim();
			})
			.filter((line) => line.length > 0);

		const nodes: AudioNodeType[] = [];
		for (const line of lines) {
			const parts = line.split(/\s+/).filter((part) => part);
			for (const part of parts) {
				const node = this.parseLine(part);
				if (node) nodes.push(node);
			}
		}
		return nodes;
	}

	private parseLine(line: string): AudioNodeType | null {
		const masterMatch = line.match(/^master\s*v(\d)$/);
		if (masterMatch) {
			const volume = parseInt(masterMatch[1]);
			return { type: "master", volume };
		}

		// Fix: Fuzzy order—separate optional params
		const synthMatch = line.match(
			/^(?:(\d+))?([sqatn])(\d+)?(?:>(\d+)(?:'(\d+))?)?(?:v(\d)(?:>(\d)(?:'(\d+))?)?)?(?:p(-?1|0)(?:>(-?1|0)(?:'(\d+))?)?)?(?:h(\d))?(?:r(\d))?(?:f(\d)(?:>(\d)(?:'(\d+))?)?)?(?:e(\d{4}))?$/
		);
		if (!synthMatch) {
			console.error(`Invalid syntax: ${line}`);
			return null;
		}

		const startTime = synthMatch[1] ? parseInt(synthMatch[1]) : 0; // New: Start time
		const type = synthMatch[2] as GeneratorType;
		const freqStart = synthMatch[3] ? parseInt(synthMatch[3]) : undefined;
		const freqEnd = synthMatch[4] ? parseInt(synthMatch[4]) : undefined;
		const freqDuration = synthMatch[5]
			? parseInt(synthMatch[5])
			: this.defaults.transitions.defaultDuration;
		const volStart = synthMatch[6] ? parseInt(synthMatch[6]) : undefined;
		const volEnd = synthMatch[7] ? parseInt(synthMatch[7]) : undefined;
		const volDuration = synthMatch[8]
			? parseInt(synthMatch[8])
			: this.defaults.transitions.defaultDuration;
		const panStart = synthMatch[9] ? parseInt(synthMatch[9]) : undefined;
		const panEnd = synthMatch[10] ? parseInt(synthMatch[10]) : undefined;
		const panDuration = synthMatch[11]
			? parseInt(synthMatch[11])
			: this.defaults.transitions.defaultDuration;
		const chop = synthMatch[12] ? parseInt(synthMatch[12]) : undefined;
		const reverb = synthMatch[13] ? parseInt(synthMatch[13]) : undefined;
		const filterStart = synthMatch[14]
			? parseInt(synthMatch[14])
			: undefined;
		const filterEnd = synthMatch[15] ? parseInt(synthMatch[15]) : undefined;
		const filterDuration = synthMatch[16]
			? parseInt(synthMatch[16])
			: this.defaults.transitions.defaultDuration;
		const envelope = synthMatch[17];

		const node: SynthNode = { type, startTime };
		if (freqStart !== undefined) {
			if (freqEnd !== undefined) {
				node.freq = {
					start: freqStart,
					end: freqEnd,
					duration: freqDuration,
				};
			} else {
				node.freq = freqStart;
			}
		} else {
			node.freq = this.defaults.generators[type].freq;
		}
		if (volStart !== undefined) {
			if (volEnd !== undefined) {
				node.volume = {
					start: volStart,
					end: volEnd,
					duration: volDuration,
				};
			} else {
				node.volume = volStart;
			}
		} else {
			node.volume = this.defaults.generators[type].volume;
		}
		if (panStart !== undefined) {
			if (panEnd !== undefined) {
				node.pan = {
					start: panStart,
					end: panEnd,
					duration: panDuration,
				};
			} else {
				node.pan = panStart;
			}
		} else {
			node.pan = this.defaults.generators[type].pan;
		}
		if (filterStart !== undefined) {
			if (filterEnd !== undefined) {
				node.filter = {
					start: filterStart,
					end: filterEnd,
					duration: filterDuration,
				};
			} else {
				node.filter = filterStart;
			}
		}
		node.chop = chop;
		node.reverb = reverb;
		node.envelope =
			envelope !== undefined
				? envelope
				: this.defaults.generators[type].envelope;

		return node;
	}
}
