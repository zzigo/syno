// /src/parser.ts
// Interpreter: Parses SYNO syntax into an Abstract Syntax Tree (AST) for audio execution
// Design Pattern: Interpreter - Converts live-coding syntax into executable commands

import { matdisp, GeneratorType } from "./matdisp";

export interface Transition {
	start: number;
	end: number;
	duration: number;
	middle?: number; // Optional for triple transitions like v0>5>0
}

export interface SynthNode {
	type: GeneratorType;
	startTime?: number; // Scheduling in seconds, supports decimals
	freq?: number | Transition;
	volume?: number | Transition;
	pan?: number | Transition;
	envelope?: string;
	chop?: number; // Supports decimals
	reverb?: number; // Supports decimals
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
		const masterMatch = line.match(/^master\s*v(\d*\.?\d+)/);
		if (masterMatch) {
			const volume = parseFloat(masterMatch[1]);
			return { type: "master", volume };
		}

		// Updated regex: Supports decimals and negatives where applicable
		const synthMatch = line.match(
			/^(?:(\d*\.?\d+))?([sqatn])(?:\?|(\d*\.?\d+)(?:>(\d*\.?\d+)(?:'(\d*\.?\d+))?)?)?(?:v(\d*\.?\d+)(?:>(\d*\.?\d+)(?:>(\d*\.?\d+))?)?(?:'(\d*\.?\d+))?)?(?:p(-?\d*\.?\d+)(?:>(-?\d*\.?\d+)(?:'(\d*\.?\d+))?)?)?(?:h(\d*\.?\d+))?(?:r(\d*\.?\d+))?(?:f(\d*\.?\d+)(?:>(\d*\.?\d+)(?:'(\d*\.?\d+))?)?)?(?:e(\d{4}))?$/
		);
		if (!synthMatch) {
			console.error(`Invalid syntax: ${line}`);
			return null;
		}

		const startTime = synthMatch[1] ? parseFloat(synthMatch[1]) : 0;
		const type = synthMatch[2] as GeneratorType;
		const freqStart = synthMatch[3] ? parseFloat(synthMatch[3]) : undefined;
		const freqEnd = synthMatch[4] ? parseFloat(synthMatch[4]) : undefined;
		const freqDuration = synthMatch[5]
			? parseFloat(synthMatch[5])
			: this.defaults.transitions.defaultDuration;
		const volStart = synthMatch[6] ? parseFloat(synthMatch[6]) : undefined;
		const volMiddle = synthMatch[7] ? parseFloat(synthMatch[7]) : undefined;
		const volEnd = synthMatch[8] ? parseFloat(synthMatch[8]) : undefined;
		const volDuration = synthMatch[9]
			? parseFloat(synthMatch[9])
			: this.defaults.transitions.defaultDuration;
		const panStart = synthMatch[10]
			? parseFloat(synthMatch[10])
			: undefined;
		const panEnd = synthMatch[11] ? parseFloat(synthMatch[11]) : undefined;
		const panDuration = synthMatch[12]
			? parseFloat(synthMatch[12])
			: this.defaults.transitions.defaultDuration;
		const chop = synthMatch[13] ? parseFloat(synthMatch[13]) : undefined;
		const reverb = synthMatch[14] ? parseFloat(synthMatch[14]) : undefined;
		const filterStart = synthMatch[15]
			? parseFloat(synthMatch[15])
			: undefined;
		const filterEnd = synthMatch[16]
			? parseFloat(synthMatch[16])
			: undefined;
		const filterDuration = synthMatch[17]
			? parseFloat(synthMatch[17])
			: this.defaults.transitions.defaultDuration;
		const envelope = synthMatch[18];

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
			if (volMiddle !== undefined) {
				node.volume = {
					start: volStart,
					middle: volMiddle,
					end: volEnd !== undefined ? volEnd : 0, // Default end to 0 if omitted
					duration: volDuration,
				};
			} else if (volEnd !== undefined) {
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

		console.log(`Parsed: ${line} ->`, node);
		return node;
	}
}
