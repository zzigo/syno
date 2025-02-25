// /src/esbuild.config.mjs
// Build Configuration: Bundles SYNO plugin for Obsidian using ESBuild
// Design Pattern: N/A - Build tool configuration
// Currently bundles only main.ts - KISS minimal setup

import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "module";

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the GitHub repository of this plugin
*/
`;

const prod = process.argv.includes("production");

const mainConfig = {
  banner: {
    js: banner,
  },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    "tone",
    ...builtinModules,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
};

async function build() {
  console.log("Starting build process...");
  try {
    if (prod) {
      console.log("Production mode: Building main.js...");
      await esbuild.build(mainConfig);
      console.log("Build completed successfully");
      process.exit(0);
    } else {
      console.log("Dev mode: Starting watch...");
      const mainCtx = await esbuild.context(mainConfig);
      await mainCtx.watch();
      console.log("Watching for changes...");
    }
  } catch (err) {
    console.error("Build failed:", err);
    process.exit(1);
  }
}

build();
