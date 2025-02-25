// /src/main.ts
// Facade: Entry point for the SYNO plugin, orchestrates lifecycle and delegates to modules
// Design Pattern: Facade - Simplifies interaction with parser, audio, and renderer

import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { Parser } from "./parser";
import { AudioManager } from "./audio";
import { Renderer } from "./renderer";

export default class SynoPlugin extends Plugin {
  private static readonly VERSION = "1.8.0";
  private parser: Parser = new Parser();
  private audio: AudioManager = new AudioManager();
  private renderer: Renderer = new Renderer();

  async onload() {
    console.log(`Syno Plugin: Loaded (v${SynoPlugin.VERSION})`);
    this.registerMarkdownCodeBlockProcessor(
      "syno",
      (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        this.processSynoBlock(source, el, ctx);
      }
    );
    this.registerMarkdownPostProcessor((el, ctx) => {
      this.renderer.processInlineSyno(el, ctx, this.audio, this.parser);
    });
  }

  onunload() {
    console.log(`Syno Plugin: Unloaded (v${SynoPlugin.VERSION})`);
    this.audio.cleanup();
  }

  private processSynoBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const nodes = this.parser.parse(source);
    if (nodes.length === 0) return;

    const { playButton, vuMeter, durationDisplay } = this.renderer.renderBlock(el, nodes);

    let isPlaying = false;
    playButton.onclick = async () => {
      if (isPlaying) {
        await this.audio.stop();
        playButton.textContent = "▶";
        vuMeter.textContent = "  ";
        durationDisplay.textContent = "";
        isPlaying = false;
      } else {
        await this.audio.play(nodes);
        playButton.textContent = "■";
        this.renderer.startUpdating(vuMeter, durationDisplay, this.audio);
        isPlaying = true;
      }
    };
  }
}
