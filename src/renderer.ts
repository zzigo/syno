// /src/renderer.ts
import { MarkdownPostProcessorContext } from "obsidian";
import { SynthNode, MasterNode, AudioNodeType, Parser } from "./parser";
import { AudioManager } from "./audio";
import { matdisp } from "./matdisp";

export class Renderer {
	renderBlock(
		el: HTMLElement,
		nodes: AudioNodeType[]
	): {
		playButton: HTMLElement;
		vuMeter: HTMLElement;
		durationDisplay: HTMLElement;
	} {
		const container = el.createDiv({ cls: "syno-container" });
		const codeBlock = container.createEl("pre", { cls: "language-python" });
		const code = codeBlock.createEl("code", { cls: "language-python" });
		code.style.display = "flex";
		code.style.alignItems = "center";
		code.style.justifyContent = "space-between";

		const playButton = document.createElement("span");
		playButton.textContent = "▶";
		playButton.className = "syno-play-button";
		playButton.style.cursor = "pointer";
		playButton.style.color = "#00FFFF";
		playButton.style.marginRight = "8px";

		const codeText = nodes
			.map((n) => {
				if (n.type === "master") {
					return `master <span style="color: violet">v</span>${
						(n as MasterNode).volume !== undefined
							? (n as MasterNode).volume
							: ""
					}`;
				}
				const synth = n as SynthNode;
				console.log(
					`Rendering node: ${JSON.stringify(synth, null, 2)}`
				);
				const startTimeStr =
					synth.startTime !== undefined && synth.startTime > 0
						? `<span style="color: orange">${synth.startTime}</span>`
						: "";
				const bufferStr =
					synth.buffer && (synth.glissando || synth.type === "b")
						? `${synth.buffer}`
						: "";
				const typeStr =
					synth.type !== "b"
						? `<span style="color: LightCoral">${synth.type}</span>`
						: "";
				const freqStr =
					typeof synth.freq === "object"
						? `${synth.freq.start}<span style="color: yellow">></span>${synth.freq.end}<span style="color: lime">'${synth.freq.duration}</span>`
						: synth.freq || "";
				const volStr =
					typeof synth.volume === "object"
						? `<span style="color: violet">v</span>${
								synth.volume.start
						  }<span style="color: yellow">></span>${
								synth.volume.middle !== undefined
									? synth.volume.middle
									: synth.volume.end
						  }${
								synth.volume.middle !== undefined
									? '<span style="color: yellow">></span>' +
									  synth.volume.end
									: ""
						  }<span style="color: lime">'${
								synth.volume.duration
						  }</span>`
						: synth.volume !== undefined
						? `<span style="color: violet">v</span>${synth.volume}`
						: "";
				const panStr =
					typeof synth.pan === "object"
						? `<span style="color: violet">p</span>${synth.pan.start}<span style="color: yellow">></span>${synth.pan.end}<span style="color: lime">'${synth.pan.duration}</span>`
						: synth.pan !== undefined
						? `<span style="color: violet">p</span>${synth.pan}`
						: "";
				const chopStr =
					synth.chop !== undefined
						? `<span style="color: violet">h</span>${synth.chop}`
						: "";
				const reverbStr =
					synth.reverb !== undefined
						? `<span style="color: violet">r</span>${synth.reverb}`
						: "";
				const filterStr =
					typeof synth.filter === "object"
						? `<span style="color: violet">f</span>${synth.filter.start}<span style="color: yellow">></span>${synth.filter.end}<span style="color: lime">'${synth.filter.duration}</span>`
						: synth.filter !== undefined
						? `<span style="color: violet">f</span>${synth.filter}`
						: "";
				const glissStr = synth.glissando
					? `<span style="color: violet">\\</span>${synth.glissando.start}<span style="color: yellow">></span>${synth.glissando.end}<span style="color: lime">'${synth.glissando.duration}</span>`
					: "";
				const envelopeStr = synth.envelope
					? `<span style="color: violet">e</span>${synth.envelope}`
					: "";
				const recursionStr = synth.recursion
					? `{${synth.recursion
							.map((r) => this.renderNode(r))
							.join(
								""
							)}}${typeStr}${freqStr}${volStr}${panStr}${chopStr}${reverbStr}${filterStr}${glissStr}${envelopeStr}`
					: `${typeStr}${freqStr}${volStr}${panStr}${chopStr}${reverbStr}${filterStr}${glissStr}${envelopeStr}`;
				return synth.buffer && synth.type === "b"
					? `${bufferStr}${glissStr}`
					: `${startTimeStr}${bufferStr}${recursionStr}`;
			})
			.join(matdisp.renderWithLinefeed ? "\n" : " "); // Toggle linefeed or whitespace

		const codeSpan = document.createElement("span");
		codeSpan.innerHTML = codeText;
		codeSpan.style.flexGrow = "1";

		const durationDisplay = document.createElement("span");
		durationDisplay.textContent = "";
		durationDisplay.className = "syno-duration";
		durationDisplay.style.color = "rgb(148, 205, 160)";
		durationDisplay.style.marginRight = "8px";
		durationDisplay.style.minWidth = "40px";

		const vuMeter = document.createElement("span");
		vuMeter.textContent = "  ";
		vuMeter.className = "syno-vumeter";
		vuMeter.style.marginRight = "30px";

		code.appendChild(playButton);
		code.appendChild(codeSpan);
		code.appendChild(durationDisplay);
		code.appendChild(vuMeter);
		codeBlock.appendChild(code);

		return { playButton, vuMeter, durationDisplay };
	}

	startUpdating(
		vuMeter: HTMLElement,
		durationDisplay: HTMLElement,
		audio: AudioManager
	) {
		const chars = "▉▆▅▄▃▂▁█";
		let rafId: number | null = null;

		const update = () => {
			const vu = audio.getVuLevels();
			const timers = audio.getTimers();
			console.log(`Timers: ${timers}`);

			if (vu.left <= 0 && vu.right <= 0 && timers.length === 0) {
				vuMeter.textContent = "  ";
				durationDisplay.textContent = "";
				if (rafId !== null) cancelAnimationFrame(rafId);
				return;
			}

			const leftChar =
				vu.left <= 0
					? " "
					: chars[Math.floor((vu.left * (chars.length - 1)) / 9)] ||
					  "▁";
			const rightChar =
				vu.right <= 0
					? " "
					: chars[Math.floor((vu.right * (chars.length - 1)) / 9)] ||
					  "▁";
			vuMeter.textContent = `${leftChar}${rightChar}`;

			durationDisplay.textContent =
				timers.length > 0 ? timers.slice(0, 6).join(" ") : "";

			rafId = requestAnimationFrame(update);
		};
		rafId = requestAnimationFrame(update);

		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			vuMeter.textContent = "  ";
			durationDisplay.textContent = "";
		};
	}

	processInlineSyno(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		audio: AudioManager,
		parser: Parser
	) {
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		let node;
		while ((node = walker.nextNode())) {
			const text = node.textContent || "";
			if (text.includes("&") && text.includes("&")) {
				const div = document.createElement("div");
				div.innerHTML = text
					.replace(/&/g, "&")
					.replace(/</g, "<")
					.replace(/>/g, ">");
				const synthRegex = /&([^&]+)&/g;

				let updatedContent = div.innerHTML;
				updatedContent = updatedContent.replace(
					synthRegex,
					(_match, synthCode) => {
						const nodes = parser.parse(synthCode.trim());
						if (nodes.length === 0) return synthCode;
						return `<span class="syno-inline-synth language-python">${synthCode}</span><span class="syno-vumeter">  </span><span class="syno-duration"></span><span class="syno-play-button" style="cursor:pointer;">▶</span>`;
					}
				);

				node.parentNode?.replaceChild(
					document
						.createRange()
						.createContextualFragment(updatedContent),
					node
				);
				walker.nextNode();
			}
		}

		el.querySelectorAll(".syno-play-button").forEach((btn) => {
			const btnElement = btn as HTMLElement;
			const synthSpan = btn.previousElementSibling
				?.previousElementSibling as HTMLElement;
			const vuMeter = btn.previousElementSibling
				?.previousElementSibling as HTMLElement;
			const durationDisplay = btn.previousElementSibling as HTMLElement;
			if (
				!synthSpan ||
				!vuMeter ||
				!durationDisplay ||
				!synthSpan.classList.contains("syno-inline-synth")
			)
				return;

			const synthCode = synthSpan.textContent || "";
			let isPlaying = false;
			let stopUpdating: (() => void) | null = null;

			btnElement.onclick = async () => {
				const nodes = parser.parse(synthCode);
				if (nodes.length === 0) return;

				if (isPlaying) {
					await audio.stop();
					btnElement.textContent = "▶";
					if (stopUpdating) stopUpdating();
					isPlaying = false;
				} else {
					await audio.play(nodes);
					btnElement.textContent = "■";
					stopUpdating = this.startUpdating(
						vuMeter,
						durationDisplay,
						audio
					);
					isPlaying = true;
				}
			};
		});
	}

	private renderNode(node: AudioNodeType): string {
		if (node.type === "master") {
			return `master <span style="color: violet">v</span>${
				(node as MasterNode).volume !== undefined
					? (node as MasterNode).volume
					: ""
			}`;
		}
		const synth = node as SynthNode;
		console.log(
			`Rendering recursive node: ${JSON.stringify(synth, null, 2)}`
		);
		const startTimeStr =
			synth.startTime !== undefined && synth.startTime > 0
				? `<span style="color: orange">${synth.startTime}</span>`
				: "";
		const bufferStr =
			synth.buffer && (synth.glissando || synth.type === "b")
				? `${synth.buffer}`
				: "";
		const typeStr =
			synth.type !== "b"
				? `<span style="color: LightCoral">${synth.type}</span>`
				: "";
		const freqStr =
			typeof synth.freq === "object"
				? `${synth.freq.start}<span style="color: yellow">></span>${synth.freq.end}<span style="color: lime">'${synth.freq.duration}</span>`
				: synth.freq || "";
		const volStr =
			typeof synth.volume === "object"
				? `<span style="color: violet">v</span>${
						synth.volume.start
				  }<span style="color: yellow">></span>${
						synth.volume.middle !== undefined
							? synth.volume.middle
							: synth.volume.end
				  }${
						synth.volume.middle !== undefined
							? '<span style="color: yellow">></span>' +
							  synth.volume.end
							: ""
				  }<span style="color: lime">'${synth.volume.duration}</span>`
				: synth.volume !== undefined
				? `<span style="color: violet">v</span>${synth.volume}`
				: "";
		const panStr =
			typeof synth.pan === "object"
				? `<span style="color: violet">p</span>${synth.pan.start}<span style="color: yellow">></span>${synth.pan.end}<span style="color: lime">'${synth.pan.duration}</span>`
				: synth.pan !== undefined
				? `<span style="color: violet">p</span>${synth.pan}`
				: "";
		const chopStr =
			synth.chop !== undefined
				? `<span style="color: violet">h</span>${synth.chop}`
				: "";
		const reverbStr =
			synth.reverb !== undefined
				? `<span style="color: violet">r</span>${synth.reverb}`
				: "";
		const filterStr =
			typeof synth.filter === "object"
				? `<span style="color: violet">f</span>${synth.filter.start}<span style="color: yellow">></span>${synth.filter.end}<span style="color: lime">'${synth.filter.duration}</span>`
				: synth.filter !== undefined
				? `<span style="color: violet">f</span>${synth.filter}`
				: "";
		const glissStr = synth.glissando
			? `<span style="color: violet">\\</span>${synth.glissando.start}<span style="color: yellow">></span>${synth.glissando.end}<span style="color: lime">'${synth.glissando.duration}</span>`
			: "";
		const envelopeStr = synth.envelope
			? `<span style="color: violet">e</span>${synth.envelope}`
			: "";
		const recursionStr = synth.recursion
			? `{${synth.recursion
					.map((r) => this.renderNode(r))
					.join(
						""
					)}}${typeStr}${freqStr}${volStr}${panStr}${chopStr}${reverbStr}${filterStr}${glissStr}${envelopeStr}`
			: `${typeStr}${freqStr}${volStr}${panStr}${chopStr}${reverbStr}${filterStr}${glissStr}${envelopeStr}`;
		return synth.buffer && synth.type === "b"
			? `${bufferStr}${glissStr}`
			: `${startTimeStr}${bufferStr}${recursionStr}`;
	}
}
