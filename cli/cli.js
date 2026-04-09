#!/usr/bin/env -S deno run --allow-read --allow-net --allow-write --allow-env --allow-ffi
import { readTextFile } from "https://deno.land/std@0.201.0/fs/mod.ts";
import Interpreter from "../core/interpreter.js";

async function main() {
    const args = Deno.args;
    if (args.length === 0) {
        console.error('Usage: deno run --allow-read --allow-net --allow-write --allow-env --allow-ffi cli/cli.js <script.vpr>');
        Deno.exit(1);
    }
    const path = args[0];
    const txt = await readTextFile(path);
    const it = new Interpreter();
    await it.runSource(txt, path);
}

if (import.meta.main) {
    main();
}
