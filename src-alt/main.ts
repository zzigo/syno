// src/main.ts - Entry point for the Obsidian plugin

import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { setupAudioWorklet } from "./audio-context";

const SYNOPLUGIN_VERSION = 2.0;

export default class SynoPlugin extends Plugin {
    private audioContext: AudioContext | null = null;
    private synoNode: AudioWorkletNode | null = null;

    async onload() {
        console.log(`Syno Plugin: Loaded (v${SYNOPLUGIN_VERSION})`);
        this.registerMarkdownCodeBlockProcessor("syno", (source, el, ctx) => {
            this.processSynoBlock(source, el, ctx);
        });
    }

    onunload() {
        console.log("Syno Plugin: Unloaded");
        this.cleanupAudio();
    }

    private async processSynoBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        console.log("Processing Syno Block:", source);
        
        // Create syntax-highlighted block
        const codeBlock = el.createEl("pre", { cls: "language-syno" });
        const code = codeBlock.createEl("code", { cls: "language-syno" });
        
        // Preserve comments and syntax highlight
        code.innerHTML = source
            .replace(/#.*/g, '<span class="syno-comment">$&</span>')
            .replace(/(sin|tri|saw|sqr|noise|vol|pan|chop|reb|gliss|cmp|lim)/g, '<span class="syno-function">$1</span>')
            .replace(/(\d+(?:\.\d+)?)/g, '<span class="syno-number">$1</span>');
        
        el.appendChild(codeBlock);
    }

    private async setupAudio() {
        if (!this.audioContext) {
            this.audioContext = new AudioContext();
            await this.audioContext.resume();
            this.synoNode = await setupAudioWorklet(this.audioContext);
        }
    }

    private cleanupAudio() {
        if (this.synoNode) {
            this.synoNode.disconnect();
            this.synoNode = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}
