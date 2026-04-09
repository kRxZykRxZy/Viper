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
        run: async (name, url, prompt) => {
            const provider = (name || '').toLowerCase();
            if (provider === 'openai') {
                const apiKey = Deno.env.get('OPENAI_API_KEY');
                if (!apiKey) throw new Error('OPENAI_API_KEY not set in environment');
                const body = {
                    model: url,
                    messages: [{ role: 'user', content: prompt }]
                };
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error('OpenAI request failed: ' + res.status);
                const j = await res.json();
                return j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
            }
            if (provider === 'ollama') {
                const endpoints = ['/api/generate','/generate','/v1/generate','/completions','/v1/completions'];
                for (const ep of endpoints) {
                    try {
                        const full = url.replace(/\/$/, '') + ep;
                        const res = await fetch(full, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt })
                        });
                        if (!res.ok) continue;
                        const txt = await res.text();
                        try { const j = JSON.parse(txt); return j && (j.output || j.result || JSON.stringify(j)); } catch (_) { return txt; }
                    } catch (e) {
                        // try next
                    }
                }
                throw new Error('Unable to call Ollama at ' + url);
            }
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
            if (!res.ok) throw new Error('AI host request failed: ' + res.status);
            return await res.text();
        },

        run_model: async (name, url, model, prompt) => {
            const provider = (name || '').toLowerCase();
            if (provider === 'openai') {
                const apiKey = Deno.env.get('OPENAI_API_KEY');
                if (!apiKey) throw new Error('OPENAI_API_KEY not set in environment');
                const body = {
                    model: model,
                    messages: [{ role: 'user', content: prompt }]
                };
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error('OpenAI request failed: ' + res.status);
                const j = await res.json();
                return j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
            }
            if (provider === 'ollama') {
                const endpoints = ['/api/generate','/generate','/v1/generate','/completions','/v1/completions'];
                for (const ep of endpoints) {
                    try {
                        const full = url.replace(/\/$/, '') + ep;
                        const res = await fetch(full, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ model, prompt })
                        });
                        if (!res.ok) continue;
                        const txt = await res.text();
                        try { const j = JSON.parse(txt); return j && (j.output || j.result || JSON.stringify(j)); } catch (_) { return txt; }
                    } catch (e) {
                        // try next
                    }
                }
                throw new Error('Unable to call Ollama at ' + url + ' with model ' + model);
            }
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt }) });
            if (!res.ok) throw new Error('AI host request failed: ' + res.status);
            return await res.text();
        }
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

    host.gpu = {
        isSupported: () => !!(globalThis.navigator && navigator.gpu),

        requestDevice: async (opts = {}) => {
            if (!globalThis.navigator || !navigator.gpu) throw new Error('WebGPU not supported');
            const adapter = await navigator.gpu.requestAdapter(opts.adapterOptions || {});
            if (!adapter) throw new Error('Failed to get GPU adapter');
            const device = await adapter.requestDevice(opts.deviceDescriptor || {});
            return device;
        },

        createBuffer: (device, data, usage = (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC)) => {
            const arr = (data instanceof ArrayBuffer) ? new Uint8Array(data) : (ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data));
            const buf = device.createBuffer({ size: arr.byteLength, usage, mappedAtCreation: true });
            const mapped = new Uint8Array(buf.getMappedRange());
            mapped.set(arr);
            buf.unmap();
            return buf;
        },

        readBuffer: async (device, buffer, size) => {
            const readBuf = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
            const enc = device.createCommandEncoder();
            enc.copyBufferToBuffer(buffer, 0, readBuf, 0, size);
            device.queue.submit([enc.finish()]);
            await readBuf.mapAsync(GPUMapMode.READ);
            const out = new Uint8Array(readBuf.getMappedRange()).slice();
            readBuf.unmap();
            return out;
        },

        // run a compute shader. inputs/outputs may be TypedArrays or GPUBuffer objects.
        run: async (shaderCode, inputBuffers = {}, outputBuffers = {}, opts = {}) => {
            const device = opts.device || await host.gpu.requestDevice();
            const shaderModule = device.createShaderModule({ code: shaderCode });

            const bindGroupLayoutEntries = [];
            const bindGroupEntries = [];
            const createdBuffers = [];
            let index = 0;

            const prepare = (obj, type) => {
                for (const [name, buf] of Object.entries(obj || {})) {
                    let gpuBuf = buf;
                    if (!(buf && buf.constructor && buf.constructor.name && buf.constructor.name.includes('GPUBuffer'))) {
                        // assume TypedArray or ArrayBuffer
                        gpuBuf = host.gpu.createBuffer(device, buf, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
                        createdBuffers.push({ name, buffer: gpuBuf, size: (ArrayBuffer.isView(buf) ? buf.byteLength : buf.byteLength || buf.length) });
                    }
                    const entry = { binding: index, visibility: GPUShaderStage.COMPUTE, buffer: { type: type === 'input' ? 'read-only-storage' : 'storage' } };
                    bindGroupLayoutEntries.push(entry);
                    bindGroupEntries.push({ binding: index, resource: { buffer: gpuBuf } });
                    index++;
                }
            };

            prepare(inputBuffers, 'input');
            prepare(outputBuffers, 'output');

            const bindGroupLayout = device.createBindGroupLayout({ entries: bindGroupLayoutEntries });
            const pipeline = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }), compute: { module: shaderModule, entryPoint: opts.entryPoint || 'main' } });
            const bindGroup = device.createBindGroup({ layout: bindGroupLayout, entries: bindGroupEntries });

            const commandEncoder = device.createCommandEncoder();
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            const wx = opts.workgroupsX || 1;
            const wy = opts.workgroupsY || 1;
            const wz = opts.workgroupsZ || 1;
            passEncoder.dispatchWorkgroups(wx, wy, wz);
            passEncoder.end();
            device.queue.submit([commandEncoder.finish()]);
            if (device.queue.onSubmittedWorkDone) await device.queue.onSubmittedWorkDone();

            // read back any created output buffers
            const results = {};
            for (const cb of createdBuffers) {
                // assume size tracked; if missing try to derive from buffer.size (not standard), skip if unknown
                const size = cb.size || 0;
                if (!size) continue;
                try {
                    const data = await host.gpu.readBuffer(device, cb.buffer, size);
                    results[cb.name] = data;
                } catch (e) {
                    // ignore read errors
                }
            }

            return results;
        }
    }


    return host;
}
