// /src/audio.ts
import { SynthNode, MasterNode, AudioNodeType, Transition } from "./parser";
import { NodeFactory } from "./nodeFactory";
import { TransitionManager } from "./transitions";
import { AudioProcessors } from "./processors";
import { matdisp } from "./matdisp";

export class AudioManager {
	private audioContext: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private activeNodes: {
		osc: OscillatorNode;
		gain: GainNode;
		pan?: StereoPannerNode;
		chop?: AudioNode;
		chopInterval?: number;
		reverb?: AudioNode;
		filter?: BiquadFilterNode;
	}[] = [];

	private nodeFactory: NodeFactory = new NodeFactory();
	private transitionManager: TransitionManager = new TransitionManager();

	private async ensureContext(): Promise<AudioContext> {
		if (!this.audioContext || this.audioContext.state === "closed") {
			this.audioContext = new AudioContext();
			this.masterGain = this.audioContext.createGain();
			this.masterGain.gain.value = matdisp.master.volume / 9;
			this.masterGain.connect(this.audioContext.destination);
		}
		if (this.audioContext.state === "suspended") {
			await this.audioContext.resume();
		}
		return this.audioContext;
	}

	async play(nodes: AudioNodeType[]): Promise<void> {
		const ctx = await this.ensureContext();
		this.activeNodes = [];

		for (const node of nodes) {
			if (node.type === "master") {
				if (node.volume !== undefined && this.masterGain) {
					this.masterGain.gain.value = node.volume / 9;
				}
				continue;
			}

			const synthNode = node as SynthNode;
			const osc = this.nodeFactory.createNode(ctx, synthNode);
			if (!osc) continue;

			const gain = ctx.createGain();
			const now = ctx.currentTime;
			const startTime = synthNode.startTime ?? 0;

			if (typeof synthNode.volume === "object") {
				const startVol = synthNode.volume.start / 9;
				const peakVol =
					synthNode.volume.middle !== undefined
						? synthNode.volume.middle / 9
						: synthNode.volume.end / 9;
				const endVol = synthNode.volume.end / 9;
				const totalDuration = synthNode.volume.duration;

				this.transitionManager.schedule(
					gain.gain,
					startVol,
					endVol,
					totalDuration,
					now + startTime,
					synthNode.volume.middle !== undefined ? peakVol : undefined
				);
				console.log(
					`Volume: ${startVol} -> ${peakVol} -> ${endVol} over ${totalDuration}s`
				);
			} else if (synthNode.envelope) {
				const [a, d, s, r] = synthNode.envelope.split("").map(Number);
				const attack = a * 0.1;
				const decay = d * 0.1;
				const sustain = s / 9;
				const release = r * 0.1;
				const volume = (synthNode.volume ?? 5) / 9;

				gain.gain.setValueAtTime(0, now + startTime);
				gain.gain.linearRampToValueAtTime(
					volume,
					now + startTime + attack
				);
				gain.gain.linearRampToValueAtTime(
					volume * sustain,
					now + startTime + attack + decay
				);
				osc.onended = () => {
					gain.gain.cancelScheduledValues(now);
					gain.gain.setValueAtTime(gain.gain.value, now);
					gain.gain.linearRampToValueAtTime(0, now + release);
				};
			} else {
				gain.gain.value = (synthNode.volume ?? 5) / 9;
			}

			let lastNode: AudioNode = osc;
			osc.connect(gain);
			lastNode = gain;

			let panNode: StereoPannerNode | undefined;
			if (synthNode.pan !== undefined) {
				panNode = ctx.createStereoPanner();
				if (typeof synthNode.pan === "number") {
					panNode.pan.value = synthNode.pan;
				} else {
					const startPan = synthNode.pan.start;
					const endPan = synthNode.pan.end;
					const timeConstant = synthNode.pan.duration / 4;
					panNode.pan.setValueAtTime(startPan, now + startTime);
					panNode.pan.setTargetAtTime(
						endPan,
						now + startTime,
						timeConstant
					);
					console.log(
						`Panning: ${startPan} to ${endPan} over ${synthNode.pan.duration}s`
					);
				}
				lastNode.connect(panNode);
				lastNode = panNode;
			}

			let chopNode: AudioNode | undefined;
			let chopInterval: number | undefined;
			if (synthNode.chop !== undefined) {
				chopNode = AudioProcessors.applyChop(
					ctx,
					lastNode,
					synthNode.chop,
					now + startTime
				);
				chopInterval = (AudioProcessors as any).chopInterval;
				lastNode = chopNode;
			}

			let reverbNode: AudioNode | undefined;
			if (synthNode.reverb !== undefined) {
				reverbNode = AudioProcessors.applyReverb(
					ctx,
					lastNode,
					synthNode.reverb
				);
				lastNode = reverbNode;
			}

			let filterNode: BiquadFilterNode | undefined;
			if (synthNode.filter !== undefined) {
				filterNode = ctx.createBiquadFilter();
				filterNode.type = "lowpass";
				filterNode.Q.value = 20;
				console.log(
					`Filter: Q=${filterNode.Q.value}, data: ${JSON.stringify(
						synthNode.filter
					)}`
				);
				if (typeof synthNode.filter === "number") {
					filterNode.frequency.value = Math.max(
						100,
						synthNode.filter * 500
					);
					console.log(
						`Static cutoff: ${filterNode.frequency.value} Hz`
					);
				} else {
					const startFreq = Math.max(
						100,
						synthNode.filter.start * 500
					);
					const endFreq = Math.max(100, synthNode.filter.end * 500);
					const timeConstant = synthNode.filter.duration / 4;
					filterNode.frequency.setValueAtTime(
						startFreq,
						now + startTime
					);
					filterNode.frequency.setTargetAtTime(
						endFreq,
						now + startTime,
						timeConstant
					);
					console.log(
						`Filter sweep: ${startFreq} to ${endFreq} Hz, timeConstant ${timeConstant}s`
					);
				}
				lastNode.connect(filterNode);
				lastNode = filterNode;
			}

			if (typeof synthNode.freq === "object") {
				this.transitionManager.schedule(
					osc.frequency,
					synthNode.freq.start,
					synthNode.freq.end,
					synthNode.freq.duration,
					now + startTime
				);
			}

			lastNode.connect(this.masterGain!);
			osc.start(now + startTime);
			const duration =
				typeof synthNode.volume === "object"
					? synthNode.volume.duration
					: 20;
			osc.stop(now + startTime + duration);
			this.activeNodes.push({
				osc,
				gain,
				pan: panNode,
				chop: chopNode,
				chopInterval,
				reverb: reverbNode,
				filter: filterNode,
			});
		}
	}

	async stop(): Promise<void> {
		if (!this.audioContext) return;
		const now = this.audioContext.currentTime;

		this.activeNodes.forEach(
			({ osc, gain, pan, chop, chopInterval, reverb, filter }) => {
				try {
					gain.gain.cancelScheduledValues(now);
					if (pan) pan.pan.cancelScheduledValues(now);
					if (filter) filter.frequency.cancelScheduledValues(now);
					osc.frequency.cancelScheduledValues(now);

					gain.gain.setValueAtTime(0, now);
					osc.stop(now);
					osc.disconnect();
					gain.disconnect();
					if (pan) {
						pan.pan.setValueAtTime(0, now);
						pan.disconnect();
					}
					if (chop) {
						chop.disconnect();
						if (chopInterval) clearInterval(chopInterval);
					}
					if (reverb) reverb.disconnect();
					if (filter) {
						filter.frequency.setValueAtTime(1000, now);
						filter.disconnect();
					}
				} catch (e) {
					console.warn("Error stopping node:", e);
				}
			}
		);

		this.activeNodes = [];
		this.transitionManager.clear();
		await this.audioContext.suspend();
	}

	cleanup() {
		if (this.audioContext) {
			this.audioContext
				.close()
				.catch((e) => console.warn("Error closing context:", e));
			this.audioContext = null;
			this.masterGain = null;
		}
	}

	getVuLevels(): { left: number; right: number } {
		if (!this.masterGain || this.activeNodes.length === 0)
			return { left: 0, right: 0 };
		let totalLeft = 0,
			totalRight = 0,
			count = 0;
		this.activeNodes.forEach(({ gain, pan }) => {
			const vol = gain.gain.value * 18;
			const panValue = pan ? pan.pan.value : 0;
			totalLeft += vol * Math.max(0, 1 - panValue);
			totalRight += vol * Math.max(0, 1 + panValue);
			count++;
		});
		const masterVol = this.masterGain!.gain.value;
		return {
			left: (totalLeft / count) * masterVol,
			right: (totalRight / count) * masterVol,
		};
	}

	getTimers(): number[] {
		return this.transitionManager.getActiveTimers(
			this.audioContext?.currentTime || 0
		);
	}
}
