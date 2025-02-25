// /src/renderer.ts
// Observer: Renders and updates UI (play/stop, VU meters, timers)
// Design Pattern: Observer - Reacts to audio state changes for real-time feedback

import { MarkdownPostProcessorContext } from "obsidian";
import { SynthNode, MasterNode, AudioNodeType, Parser } from "./parser";
import { AudioManager } from "./audio";

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
					return `master v${
						(n as MasterNode).volume !== undefined
							? (n as MasterNode).volume
							: ""
					}`;
				}
				const synth = n as SynthNode;
				return `${synth.type}${
					typeof synth.freq === "object"
						? `${synth.freq.start}>${synth.freq.end}'${synth.freq.duration}`
						: synth.freq || ""
				}${
					typeof synth.volume === "object"
						? `v${synth.volume.start}>${synth.volume.end}'${synth.volume.duration}`
						: synth.volume !== undefined
						? `v${synth.volume}`
						: ""
				}${
					typeof synth.pan === "object"
						? `p${synth.pan.start}>${synth.pan.end}'${synth.pan.duration}`
						: synth.pan !== undefined
						? `p${synth.pan}`
						: ""
				}${synth.chop !== undefined ? `h${synth.chop}` : ""}${
					synth.reverb !== undefined ? `r${synth.reverb}` : ""
				}${
					typeof synth.filter === "object"
						? `f${synth.filter.start}>${synth.filter.end}'${synth.filter.duration}`
						: synth.filter !== undefined
						? `f${synth.filter}`
						: ""
				}${synth.envelope !== undefined ? `e${synth.envelope}` : ""}`;
			})
			.join(" ");

		const codeSpan = document.createElement("span");
		codeSpan.textContent = codeText;
		codeSpan.style.flexGrow = "1";

		const durationDisplay = document.createElement("span");
		durationDisplay.textContent = "";
		durationDisplay.className = "syno-duration";
		durationDisplay.style.color = "rgba(128, 128, 128, 0.5)";
		durationDisplay.style.marginRight = "8px";
		durationDisplay.style.minWidth = "40px";

		const vuMeter = document.createElement("span");
		vuMeter.textContent = "  ";
		vuMeter.className = "syno-vumeter";
		vuMeter.style.marginRight = "15px";

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
}
