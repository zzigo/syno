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
		osc?: OscillatorNode;
		source?: AudioBufferSourceNode;
		gain: GainNode;
		pan?: StereoPannerNode;
		chop?: AudioNode;
		chopInterval?: number;
		reverb?: AudioNode;
		filter?: BiquadFilterNode;
	}[] = [];
	private buffers: { [key: string]: AudioBuffer } = {};

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
		this.buffers = {};

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node.type === "master") {
				if (node.volume !== undefined && this.masterGain) {
					this.masterGain.gain.value = node.volume / 9;
				}
				continue;
			}

			const synthNode = node as SynthNode;
			const now = ctx.currentTime;
			const startTime = synthNode.startTime ?? 0;

			let sourceNode: OscillatorNode | AudioBufferSourceNode;
			let gain = ctx.createGain();
			let chopInterval: number | undefined;
			let implicitBuffer: AudioBuffer | undefined;

			// Implicit buffer from previous node
			if (i > 0 && synthNode.recursion) {
				const prevNode = nodes[i - 1] as SynthNode;
				implicitBuffer = await this.recordNode(ctx, prevNode);
			}

			if (
				synthNode.type === "b" &&
				synthNode.buffer &&
				this.buffers[synthNode.buffer]
			) {
				sourceNode = ctx.createBufferSource();
				sourceNode.buffer = this.buffers[synthNode.buffer];
			} else if (implicitBuffer && synthNode.recursion) {
				sourceNode = ctx.createBufferSource();
				sourceNode.buffer = implicitBuffer;
			} else {
				sourceNode = this.nodeFactory.createNode(
					ctx,
					synthNode
				) as OscillatorNode;
				if (!sourceNode) continue;
			}

			sourceNode.connect(gain);
			let lastNode: AudioNode = gain;

			// Dynamic processor chain
			const processors = [
				{
					condition: synthNode.pan,
					create: () => ctx.createStereoPanner(),
					apply: (n: StereoPannerNode) => {
						if (typeof synthNode.pan === "number") {
							n.pan.value = synthNode.pan;
						} else {
							n.pan.setValueAtTime(
								synthNode.pan.start,
								now + startTime
							);
							n.pan.setTargetAtTime(
								synthNode.pan.end,
								now + startTime,
								synthNode.pan.duration / 4
							);
						}
					},
				},
				{
					condition: synthNode.chop,
					create: () =>
						AudioProcessors.applyChop(
							ctx,
							lastNode,
							synthNode.chop!,
							now + startTime
						),
					apply: (n: AudioNode) => {
						chopInterval = (AudioProcessors as any).chopInterval;
					},
				},
				{
					condition: synthNode.reverb,
					create: () =>
						AudioProcessors.applyReverb(
							ctx,
							lastNode,
							synthNode.reverb!
						),
					apply: () => {},
				},
				{
					condition: synthNode.filter,
					create: () => ctx.createBiquadFilter(),
					apply: (n: BiquadFilterNode) => {
						n.type = "lowpass";
						n.Q.value = 20;
						if (typeof synthNode.filter === "number") {
							n.frequency.value = Math.max(
								100,
								synthNode.filter * 500
							);
						} else {
							const startFreq = Math.max(
								100,
								synthNode.filter.start * 500
							);
							const endFreq = Math.max(
								100,
								synthNode.filter.end * 500
							);
							const timeConstant = synthNode.filter.duration / 4;
							n.frequency.setValueAtTime(
								startFreq,
								now + startTime
							);
							n.frequency.setTargetAtTime(
								endFreq,
								now + startTime,
								timeConstant
							);
						}
					},
				},
			];

			const nodesChain: AudioNode[] = [gain];
			for (const proc of processors) {
				if (proc.condition) {
					const newNode = proc.create();
					lastNode.connect(newNode);
					proc.apply(newNode as any);
					lastNode = newNode;
					nodesChain.push(newNode);
				}
			}

			// Volume
			const duration =
				typeof synthNode.volume === "object"
					? synthNode.volume.duration
					: 20;
			if (typeof synthNode.volume === "object") {
				const startVol = synthNode.volume.start / 9;
				const peakVol =
					synthNode.volume.middle !== undefined
						? synthNode.volume.middle / 9
						: synthNode.volume.end / 9;
				const endVol = synthNode.volume.end / 9;
				this.transitionManager.schedule(
					gain.gain,
					startVol,
					endVol,
					duration,
					now + startTime,
					synthNode.volume.middle !== undefined ? peakVol : undefined
				);
				console.log(
					`Volume: ${startVol} -> ${peakVol} -> ${endVol} over ${duration}s`
				);
			} else {
				gain.gain.value = (synthNode.volume ?? 5) / 9;
			}

			// Glissando
			if (
				synthNode.glissando &&
				sourceNode instanceof AudioBufferSourceNode
			) {
				const startRate = synthNode.glissando.start / 440;
				const endRate = synthNode.glissando.end / 440;
				sourceNode.playbackRate.setValueAtTime(
					startRate,
					now + startTime
				);
				sourceNode.playbackRate.linearRampToValueAtTime(
					endRate,
					now + startTime + duration
				);
			}

			// Recursion
			if (synthNode.recursion) {
				const modulatorNodes = synthNode.recursion;
				let carrierNode = sourceNode;

				for (const modNode of modulatorNodes) {
					if (
						modNode.type === "b" &&
						modNode.buffer &&
						this.buffers[modNode.buffer]
					) {
						carrierNode = ctx.createBufferSource();
						carrierNode.buffer = this.buffers[modNode.buffer];
						carrierNode.connect(gain);
						lastNode = gain;
					}

					const modProcessors = [
						{
							condition: modNode.reverb,
							create: () =>
								AudioProcessors.applyReverb(
									ctx,
									lastNode,
									modNode.reverb!
								),
							apply: () => {},
						},
						{
							condition: modNode.chop,
							create: () =>
								AudioProcessors.applyChop(
									ctx,
									lastNode,
									modNode.chop!,
									now + startTime
								),
							apply: (n: AudioNode) => {
								chopInterval = (AudioProcessors as any)
									.chopInterval;
							},
						},
						{
							condition: modNode.filter,
							create: () => ctx.createBiquadFilter(),
							apply: (n: BiquadFilterNode) => {
								n.type = "lowpass";
								n.Q.value = 20;
								if (typeof modNode.filter === "number")
									n.frequency.value = Math.max(
										100,
										modNode.filter * 500
									);
								else {
									const startFreq = Math.max(
										100,
										modNode.filter.start * 500
									);
									const endFreq = Math.max(
										100,
										modNode.filter.end * 500
									);
									const timeConstant =
										modNode.filter.duration / 4;
									n.frequency.setValueAtTime(
										startFreq,
										now + startTime
									);
									n.frequency.setTargetAtTime(
										endFreq,
										now + startTime,
										timeConstant
									);
								}
							},
						},
					];

					for (const proc of modProcessors) {
						if (proc.condition) {
							const newNode = proc.create();
							lastNode.connect(newNode);
							proc.apply(newNode as any);
							lastNode = newNode;
							nodesChain.push(newNode);
						}
					}

					if (["s", "q", "a", "t"].includes(modNode.type)) {
						const modGain = ctx.createGain();
						const modVolValue =
							typeof modNode.volume === "object"
								? modNode.volume.start
								: modNode.volume ?? 5;
						const modVol = modVolValue / 9; // Use modulator volume for depth
						modGain.gain.value = modVol * 100; // Scale for FM depth
						lastNode.connect(modGain);
						const modOsc = this.nodeFactory.createNode(
							ctx,
							modNode
						);
						if (modOsc) {
							modOsc.connect(modGain);
							if (carrierNode instanceof OscillatorNode) {
								modGain.connect(carrierNode.frequency); // FM modulation
							} else if (
								carrierNode instanceof AudioBufferSourceNode
							) {
								modGain.connect(carrierNode.playbackRate); // Pitch modulation for buffer
							}
							modOsc.start(now + startTime);
							modOsc.stop(now + startTime + duration);
						}
					}
				}
			}

			if (
				typeof synthNode.freq === "object" &&
				sourceNode instanceof OscillatorNode
			) {
				this.transitionManager.schedule(
					sourceNode.frequency,
					synthNode.freq.start,
					synthNode.freq.end,
					synthNode.freq.duration,
					now + startTime
				);
			}

			// Buffer recording
			if (synthNode.buffer) {
				const offlineCtx = new OfflineAudioContext(
					2,
					ctx.sampleRate * duration,
					ctx.sampleRate
				);
				const offlineSource =
					synthNode.type === "b" && this.buffers[synthNode.buffer]
						? offlineCtx.createBufferSource()
						: this.nodeFactory.createNode(offlineCtx, synthNode);
				if (!offlineSource) continue;

				if (
					offlineSource instanceof AudioBufferSourceNode &&
					synthNode.buffer &&
					this.buffers[synthNode.buffer]
				) {
					offlineSource.buffer = this.buffers[synthNode.buffer];
				}
				const offlineGain = offlineCtx.createGain();
				offlineSource.connect(offlineGain);
				offlineGain.connect(offlineCtx.destination);

				if (typeof synthNode.volume === "object") {
					const startVol = synthNode.volume.start / 9;
					const peakVol =
						synthNode.volume.middle !== undefined
							? synthNode.volume.middle / 9
							: synthNode.volume.end / 9;
					const endVol = synthNode.volume.end / 9;
					this.transitionManager.schedule(
						offlineGain.gain,
						startVol,
						endVol,
						duration,
						0,
						synthNode.volume.middle !== undefined
							? peakVol
							: undefined
					);
				} else {
					offlineGain.gain.value = (synthNode.volume ?? 5) / 9;
				}

				offlineSource.start(0);
				offlineSource.stop(duration);
				await offlineCtx.startRendering().then((buffer) => {
					this.buffers[synthNode.buffer!] = buffer;
				});
			}

			lastNode.connect(this.masterGain!);
			sourceNode.start(now + startTime);
			sourceNode.stop(now + startTime + duration);

			this.activeNodes.push({
				osc:
					sourceNode instanceof OscillatorNode
						? sourceNode
						: undefined,
				source:
					sourceNode instanceof AudioBufferSourceNode
						? sourceNode
						: undefined,
				gain,
				pan: nodesChain.find(
					(n) => n instanceof StereoPannerNode
				) as StereoPannerNode,
				chop: nodesChain.find(
					(n) => n === (AudioProcessors as any).chopNode
				),
				chopInterval,
				reverb: nodesChain.find(
					(n) => n === (AudioProcessors as any).reverbNode
				),
				filter: nodesChain.find(
					(n) => n instanceof BiquadFilterNode
				) as BiquadFilterNode,
			});
		}
	}

	async stop(): Promise<void> {
		if (!this.audioContext) return;
		const now = this.audioContext.currentTime;

		this.activeNodes.forEach(
			({
				osc,
				source,
				gain,
				pan,
				chop,
				chopInterval,
				reverb,
				filter,
			}) => {
				try {
					gain.gain.cancelScheduledValues(now);
					if (pan) pan.pan.cancelScheduledValues(now);
					if (filter) filter.frequency.cancelScheduledValues(now);
					if (osc) {
						osc.frequency.cancelScheduledValues(now);
						osc.stop(now);
						osc.disconnect();
					}
					if (source) {
						source.stop(now);
						source.disconnect();
					}
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
		this.buffers = {};
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
		if (!this.audioContext) return [];
		const currentTime = this.audioContext.currentTime;
		return this.transitionManager
			.getActiveTimers(currentTime)
			.filter((t) => t >= 0);
	}

	private async recordNode(
		ctx: AudioContext,
		node: SynthNode
	): Promise<AudioBuffer> {
		const duration =
			typeof node.volume === "object" ? node.volume.duration : 20;
		const offlineCtx = new OfflineAudioContext(
			2,
			ctx.sampleRate * duration,
			ctx.sampleRate
		);
		let offlineSource: OscillatorNode | AudioBufferSourceNode;

		if (node.type === "b" && node.buffer && this.buffers[node.buffer]) {
			offlineSource = offlineCtx.createBufferSource();
			offlineSource.buffer = this.buffers[node.buffer];
		} else {
			offlineSource = this.nodeFactory.createNode(offlineCtx, node);
			if (!offlineSource)
				throw new Error("Failed to create offline source");
		}

		const offlineGain = offlineCtx.createGain();
		offlineSource.connect(offlineGain);
		offlineGain.connect(offlineCtx.destination);

		if (typeof node.volume === "object") {
			const startVol = node.volume.start / 9;
			const peakVol =
				node.volume.middle !== undefined
					? node.volume.middle / 9
					: node.volume.end / 9;
			const endVol = node.volume.end / 9;
			this.transitionManager.schedule(
				offlineGain.gain,
				startVol,
				endVol,
				duration,
				0,
				peakVol
			);
		} else {
			offlineGain.gain.value = (node.volume ?? 5) / 9;
		}

		offlineSource.start(0);
		offlineSource.stop(duration);
		return await offlineCtx.startRendering();
	}
}
