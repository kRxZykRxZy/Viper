// host.js - creates the host bridge exposed to Viper programs
export function createHost() {
    const host = {};

    host.console = {
        log: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args)
    };

    host.math = {
        PI: Math.PI,
        sin: (x) => Math.sin(x),
        sqrt: (x) => Math.sqrt(x),
        factorial: (n) => { if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
        cos: (x) => Math.cos(x),
        tan: (x) => Math.tan(x),
        pow: (x,y) => Math.pow(x,y),
        exp: (x) => Math.exp(x),
        log: (x) => Math.log(x),
        random: () => Math.random(),
        floor: (x) => Math.floor(x),
        ceil: (x) => Math.ceil(x),
        round: (x) => Math.round(x),
        abs: (x) => Math.abs(x),
        max: (...args) => Math.max(...args),
        min: (...args) => Math.min(...args),
    };

    host.io = {
        read: async (path) => await Deno.readTextFile(path),
        write: async (path, txt) => await Deno.writeTextFile(path, txt),
        input: (promptText='') => { try { return prompt(promptText); } catch (e) { return null; } },
        output: (txt) => { try { alert(txt); } catch (e) { console.log(txt); } }
    };

    // `host.fetch` mirrors the browser/deno fetch but returns a lightweight response
    // object with convenient methods that can be awaited from VPR code.
    host.fetch = async (url, opts = {}) => {
        const resp = await fetch(url, opts);
        const headers = {};
        for (const [k, v] of resp.headers.entries()) headers[k] = v;
        return {
            status: resp.status,
            ok: resp.ok,
            headers,
            text: async () => await resp.text(),
            json: async () => await resp.json(),
            arrayBuffer: async () => await resp.arrayBuffer(),
            raw: resp
        };
    };

    // host.http.serve starts a server and returns a handle with `stop()`.
    host.http = {
        serve: (portOrOptions, handler) => {
            const opts = typeof portOrOptions === 'number' ? { port: portOrOptions } : (portOrOptions || {});
            const controller = new AbortController();
            const signal = controller.signal;

            (async () => {
                try {
                    // Deno.serve will honor the AbortSignal when provided in options
                    opts.signal = signal;
                    await Deno.serve(opts, async (req) => {
                        const reqBody = await req.text();
                        const simpleReq = {
                            method: req.method,
                            url: req.url,
                            headers: Object.fromEntries(req.headers),
                            body: reqBody,
                            raw: req
                        };
                        try {
                            const result = await handler(simpleReq);
                            if (result instanceof Response) return result;
                            if (typeof result === 'string') return new Response(result, { status: 200 });
                            if (result && typeof result === 'object' && result.body !== undefined) {
                                const headers = result.headers || { 'content-type': 'application/json' };
                                const body = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
                                return new Response(body, { status: result.status || 200, headers });
                            }
                            return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } });
                        } catch (e) {
                            console.error('handler error', e);
                            return new Response('Internal Server Error', { status: 500 });
                        }
                    });
                } catch (e) {
                    if (e.name !== 'AbortError') console.error('HTTP serve failed', e);
                }
            })();

            const port = opts.port || 8000;
            return {
                stop: () => controller.abort(),
                url: `http://localhost:${port}`
            };
        }
    };

    host.ml = {
        add: (a,b) => a.map((v,i)=>v + b[i]),
        softmax: (arr) => { const ex=arr.map(Math.exp); const s=ex.reduce((x,y)=>x+y,0); return ex.map(v=>v/s); },
        relu: (arr) => arr.map(v=> v>0? v:0),
        sigmoid: (arr) => arr.map(v=> 1/(1+Math.exp(-v))),
        matmul: (a,b) => a.map(row => b[0].map((_,j) => row.reduce((sum, v, i) => sum + v * b[i][j], 0))),
        mean: (arr) => arr.reduce((a,b) => a+b, 0)/arr.length,
        std: (arr) => { const m = host.ml.mean(arr); return Math.sqrt(arr.reduce((s,v) => s + (v - m) ** 2, 0) / arr.length); }
    };

    host.ai = {
        run: async (name, url, prompt) => { return `coming soon`; },
        run_model: async (name, url, model, prompt) => { return "coming soon"; }
    };

    // Minimal FFI helpers for loading native shared libraries compiled from C/C++.
    // Usage from VPR:
    //   const lib = host.ffi.load('./mylib.so', { add: { parameters: ['i32','i32'], result: 'i32' } });
    //   const res = lib.add(1,2);
    host.ffi = {
        load: (path, symbols) => {
            try {
                const lib = Deno.dlopen(path, symbols);
                const wrapped = { _lib: lib };
                for (const name of Object.keys(symbols)) {
                    // lib.symbols[name] is a callable ForeignFunction
                    wrapped[name] = (...args) => {
                        try {
                            return lib.symbols[name](...args);
                        } catch (e) {
                            throw new Error(`FFI call ${name} failed: ${e.message}`);
                        }
                    };
                }
                wrapped.close = () => lib.close();
                return wrapped;
            } catch (e) {
                throw new Error('FFI load failed: ' + e.message);
            }
        },
        // convenience: call name on lib object
        call: (libObj, fnName, args = []) => {
            if (!libObj || !libObj[fnName]) throw new Error('FFI function not found');
            return libObj[fnName](...args);
        }
    };

    host.wasm = {
        instantiateFile: async (pathOrUrl, imports = {}) => {
            try {
                let bytes;
                if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
                    const r = await fetch(pathOrUrl);
                    if (!r.ok) throw new Error('wasm fetch failed');
                    bytes = new Uint8Array(await r.arrayBuffer());
                } else {
                    bytes = await Deno.readFile(pathOrUrl);
                }
                const mod = await WebAssembly.instantiate(bytes, imports);
                return mod.instance.exports;
            } catch (e) { throw new Error('WASM instantiate failed: ' + e.message); }
        }
    };

    host.os = {
        env: (key) => Deno.env.get(key),
        exec: async (cmd) => {
            const p = Deno.run({ cmd: ['sh', '-c', cmd], stdout: 'piped', stderr: 'piped' });
            const { code } = await p.status();
            const stdout = new TextDecoder().decode(await p.output());
            const stderr = new TextDecoder().decode(await p.stderrOutput());
            p.close();
            return { code, stdout, stderr };
        },
        readDir: async (path) => {
            const entries = [];
            for await (const entry of Deno.readDir(path)) {
                entries.push({ name: entry.name, isFile: entry.isFile, isDirectory: entry.isDirectory });
            }
            return entries;
        },
        readFile: async (path) => {
            try {
                const data = await Deno.readFile(path);
                return new TextDecoder().decode(data);
            } catch (e) {
                throw new Error('File read failed: ' + e.message);
            }
        },
        writeFile: async (path, content) => {
            try {
                const data = new TextEncoder().encode(content);
                await Deno.writeFile(path, data);
            } catch (e) {
                throw new Error('File write failed: ' + e.message);
            }
        },
        stat: async (path) => {
            try {
                const info = await Deno.stat(path);
                return { isFile: info.isFile, isDirectory: info.isDirectory, size: info.size, mtime: info.mtime };
            } catch (e) {
                throw new Error('File stat failed: ' + e.message);
            }
        },
        createDir: async (path) => {
            try {
                await Deno.mkdir(path, { recursive: true });
            } catch (e) {
                throw new Error('Directory creation failed: ' + e.message);
            }
        },
        deleteFile: async (path) => {
            try {
                await Deno.remove(path);
            } catch (e) {
                throw new Error('File deletion failed: ' + e.message);
            }
        },
        deleteDir: async (path) => {
            try {
                await Deno.remove(path, { recursive: true });
            } catch (e) {
                throw new Error('Directory deletion failed: ' + e.message);
            }
        }
    };


    return host;
}
