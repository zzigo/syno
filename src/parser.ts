// /src/parser.ts
import { matdisp, GeneratorType } from "./matdisp";

export interface Transition {
	start: number;
	end: number;
	duration: number;
	middle?: number;
}

export interface SynthNode {
	type: GeneratorType;
	startTime?: number;
	freq?: number | Transition;
	volume?: number | Transition;
	pan?: number | Transition;
	envelope?: string;
	chop?: number;
	reverb?: number;
	filter?: number | Transition;
	glissando?: Transition;
	recursion?: SynthNode[];
	buffer?: string;
}

export interface MasterNode {
	type: "master";
	volume?: number;
	buffer?: string;
}

export type AudioNodeType = SynthNode | MasterNode;

export class Parser {
	private defaults = matdisp;

	parse(input: string): AudioNodeType[] {
		const lines = input
			.split("\n")
			.map((line) => line.trim().split("#")[0].trim())
			.filter((line) => line && !line.startsWith("#"));

		const nodes: AudioNodeType[] = [];
		let implicitBuffer = true;

		for (const line of lines) {
			const parts = line.split(/\s+/).filter((part) => part);
			for (const part of parts) {
				const node = this.parseLine(part);
				if (node) {
					if (
						implicitBuffer &&
						!part.startsWith("b") &&
						!part.startsWith("{")
					) {
						node.buffer = "b0"; // Assign b0 implicitly, but don’t render it
						implicitBuffer = false;
					}
					nodes.push(node);
				}
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

		const bufferMatch = line.match(/^b(\d+)=(.+)$/);
		if (bufferMatch) {
			const bufferId = `b${bufferMatch[1]}`;
			const subNode = this.parseLine(bufferMatch[2]);
			if (subNode) subNode.buffer = bufferId;
			return subNode;
		}

		// Updated regex: Handle {buffer} before generator
		const synthMatch = line.match(
			/^(?:(\d*\.?\d+))?((?:\{b(\d+)\})?([sqatn])(?:\?|(\d*\.?\d+)(?:>(\d*\.?\d+)(?:'(\d*\.?\d+))?)?)?(?:v(\d*\.?\d+)(?:>(\d*\.?\d+)(?:>(\d*\.?\d+))?)?(?:'(\d*\.?\d+))?)?(?:p(-?\d*\.?\d+)(?:>(-?\d*\.?\d+)(?:'(\d*\.?\d+))?)?)?(?:h(\d*\.?\d+))?(?:r(\d*\.?\d+))?(?:f(\d*\.?\d+)(?:>(\d*\.?\d+)(?:'(\d*\.?\d+))?)?)?(?:\\(\d*\.?\d+)(?:>(\d*\.?\d+)(?:'(\d*\.?\d+))?)?)?(?:e(\d{4}))?)$/
		);
		if (!synthMatch) {
			const bufferGlissMatch = line.match(
				/^b(\d+)(?:\\(\d*\.?\d+)(?:>(\d*\.?\d+)(?:'(\d*\.?\d+))?)?)?$/
			);
			if (bufferGlissMatch) {
				const bufferId = `b${bufferGlissMatch[1]}`;
				const glissStart = bufferGlissMatch[2]
					? parseFloat(bufferGlissMatch[2])
					: undefined;
				const glissEnd = bufferGlissMatch[3]
					? parseFloat(bufferGlissMatch[3])
					: undefined;
				const glissDuration = bufferGlissMatch[4]
					? parseFloat(bufferGlissMatch[4])
					: this.defaults.transitions.defaultDuration;
				const node: SynthNode = { type: "b", buffer: bufferId };
				if (glissStart !== undefined && glissEnd !== undefined) {
					node.glissando = {
						start: glissStart,
						end: glissEnd,
						duration: glissDuration,
					};
				}
				return node;
			}
			console.error(`Invalid syntax: ${line}`);
			return null;
		}

		const startTime = synthMatch[1] ? parseFloat(synthMatch[1]) : 0;
		const bufferInRecursion = synthMatch[3]
			? `b${synthMatch[3]}`
			: undefined;
		const type = synthMatch[4] as GeneratorType;
		const freqStart = synthMatch[5] ? parseFloat(synthMatch[5]) : undefined;
		const freqEnd = synthMatch[6] ? parseFloat(synthMatch[6]) : undefined;
		const freqDuration = synthMatch[7]
			? parseFloat(synthMatch[7])
			: this.defaults.transitions.defaultDuration;
		const volStart = synthMatch[8] ? parseFloat(synthMatch[8]) : undefined;
		const volMiddle = synthMatch[9] ? parseFloat(synthMatch[9]) : undefined;
		const volEnd = synthMatch[10] ? parseFloat(synthMatch[10]) : undefined;
		const volDuration = synthMatch[11]
			? parseFloat(synthMatch[11])
			: this.defaults.transitions.defaultDuration;
		const panStart = synthMatch[12]
			? parseFloat(synthMatch[12])
			: undefined;
		const panEnd = synthMatch[13] ? parseFloat(synthMatch[13]) : undefined;
		const panDuration = synthMatch[14]
			? parseFloat(synthMatch[14])
			: this.defaults.transitions.defaultDuration;
		const chop = synthMatch[15] ? parseFloat(synthMatch[15]) : undefined;
		const reverb = synthMatch[16] ? parseFloat(synthMatch[16]) : undefined;
		const filterStart = synthMatch[17]
			? parseFloat(synthMatch[17])
			: undefined;
		const filterEnd = synthMatch[18]
			? parseFloat(synthMatch[18])
			: undefined;
		const filterDuration = synthMatch[19]
			? parseFloat(synthMatch[19])
			: this.defaults.transitions.defaultDuration;
		const glissStart = synthMatch[20]
			? parseFloat(synthMatch[20])
			: undefined;
		const glissEnd = synthMatch[21]
			? parseFloat(synthMatch[21])
			: undefined;
		const glissDuration = synthMatch[22]
			? parseFloat(synthMatch[22])
			: this.defaults.transitions.defaultDuration;
		const envelope = synthMatch[23];

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
					end: volEnd !== undefined ? volEnd : 0,
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
		if (glissStart !== undefined && glissEnd !== undefined) {
			node.glissando = {
				start: glissStart,
				end: glissEnd,
				duration: glissDuration,
			};
		}
		node.chop = chop;
		node.reverb = reverb;
		node.envelope =
			envelope && envelope !== this.defaults.generators[type].envelope
				? envelope
				: undefined;

		if (bufferInRecursion) {
			const recursiveNode: SynthNode = {
				type: "b",
				buffer: bufferInRecursion,
			};
			node.recursion = [recursiveNode];
		}

		console.log(`Parsed: ${line} ->`, node);
		return node;
	}
}
