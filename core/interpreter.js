import Parser from "./parser/parser.js";
import { createHost } from "./runtime/host.js";

export default class Interpreter {
    constructor() {
        this.globals = Object.create(null);
        this.modules = Object.create(null);
        this.exports = new Set();
        // minimal host bridge available to Viper code (pure VPR modules can delegate to host)
        this.globals.host = createHost();
    }

    // internal return signal for early returns
    ReturnSignal(value) {
        return { __return__: true, value };
    }

    // simple cache directory for fetched modules
    cacheDir() {
        return ".viper_modules";
    }

    async runSource(source, filename = '<stdin>') {
        const parser = new Parser(source);
        const ast = parser.parse();
        return await this.evaluateProgram(ast, filename);
    }

    async evaluateProgram(program, filename) {
        let last = undefined;
        try {
            for (const stmt of program.body) {
                last = await this.evaluate(stmt);
            }
            return last;
        } catch (e) {
            if (e && e.__return__) return e.value;
            throw e;
        }
    }

    async evaluate(node) {
        switch (node.type) {
            case 'ExportDeclaration':
                return this.handleExport(node);
            case 'BlockStatement':
                return this.evaluateProgram({ type: 'Program', body: node.body });
            case 'IfStatement':
                return this.handleIf(node);
            case 'WhileStatement':
                return this.handleWhile(node);
            case 'Program':
                return this.evaluateProgram(node);
            case 'UseStatement':
                return this.handleUse(node);
            case 'Assignment':
                return this.handleAssignment(node);
            case 'Declare':
                return this.handleDeclare(node);
            case 'ExpressionStatement':
                return this.evaluate(node.expression);
            case 'Literal':
                return node.value;
            case 'Identifier':
                return this.lookupVariable(node.name);
            case 'MemberExpression':
                return this.handleMember(node);
            case 'CallExpression':
                return this.handleCall(node);
            case 'BinaryExpression':
                return this.handleBinary(node);
            case 'FunctionDeclaration':
                return this.handleFunction(node);
            case 'ReturnStatement':
                throw this.ReturnSignal(await this.evaluate(node.argument));
            case 'AwaitExpression':
                return await this.evaluate(node.argument);
            default:
                throw new Error('Unhandled node type: ' + node.type);
        }
    }

    async handleDeclare(node) {
        const name = node.id;
        let value = undefined;
        if (node.init) value = await this.evaluate(node.init);
        else {
            if (node.varType === 'str') value = '';
            else if (node.varType === 'int') value = 0;
            else if (node.varType === 'dict') value = Object.create(null);
            else value = null;
        }
        this.globals[name] = value;
        return value;
    }

    async handleUse(node) {
        // support node of form { imports: [ {kind, value}, ... ] }
        const imports = node.imports;
        if (!imports || !Array.isArray(imports) || imports.length === 0) throw new Error('Invalid use statement');
        for (const it of imports) {
            if (it.kind === 'ident') {
                const id = it.value;
                // if ident matches a host bridge name, bind it
                if (id in this.globals.host) {
                    this.globals[id] = this.globals.host[id];
                    continue;
                }
                // common host helpers
                if (id === 'console') { this.globals.console = this.globals.host.console; continue; }
                if (id === 'fetch') { this.globals.fetch = this.globals.host.fetch; continue; }
                if (id === 'http') { this.globals.http = this.globals.host.http; continue; }
                // fallback: try to load std/<id>.vpr
                const modPath = `std/${id}.vpr`;
                try {
                    const txt = await Deno.readTextFile(modPath);
                    const parser = new Parser(txt);
                    const ast = parser.parse();
                    const moduleInterpreter = new Interpreter();
                    moduleInterpreter.globals.host = this.globals.host;
                    await moduleInterpreter.evaluateProgram(ast, modPath);
                    const exportsObj = Object.create(null);
                    if (moduleInterpreter.exports && moduleInterpreter.exports.size > 0) {
                        for (const k of moduleInterpreter.exports) if (k in moduleInterpreter.globals) exportsObj[k] = moduleInterpreter.globals[k];
                    } else {
                        for (const k of Object.keys(moduleInterpreter.globals)) if (k !== 'host') exportsObj[k] = moduleInterpreter.globals[k];
                    }
                    this.globals[id] = exportsObj;
                    continue;
                } catch (e) {
                    throw new Error(`Unable to resolve import ${id}: ${e.message}`);
                }
            }

            if (it.kind === 'string') {
                const path = it.value;
                let modPath = path;
                if (!modPath.startsWith('http://') && !modPath.startsWith('https://') && !modPath.includes('github.com') && !modPath.includes('/')) {
                    // treat bare name as std/<name>.vpr
                    modPath = `std/${modPath}`;
                }
                // if not ending in .vpr and is local path without extension, add .vpr
                if (!modPath.endsWith('.vpr') && !modPath.startsWith('http')) modPath = modPath + '.vpr';
                let code = null;
                if (modPath.startsWith('http://') || modPath.startsWith('https://') || modPath.includes('github.com')) {
                    code = await this.fetchRemoteModule(modPath);
                } else {
                    try { code = await Deno.readTextFile(modPath); } catch (e) { throw new Error(`Unable to load module ${modPath}: ${e.message}`); }
                }
                const parser = new Parser(code);
                const ast = parser.parse();
                const moduleInterpreter = new Interpreter();
                moduleInterpreter.globals.host = this.globals.host;
                await moduleInterpreter.evaluateProgram(ast, modPath);
                const base = modPath.split('/').pop().replace('.vpr','');
                const exportsObj = Object.create(null);
                if (moduleInterpreter.exports && moduleInterpreter.exports.size > 0) {
                    for (const k of moduleInterpreter.exports) if (k in moduleInterpreter.globals) exportsObj[k] = moduleInterpreter.globals[k];
                } else {
                    for (const k of Object.keys(moduleInterpreter.globals)) if (k !== 'host') exportsObj[k] = moduleInterpreter.globals[k];
                }
                this.globals[base] = exportsObj;
                continue;
            }
        }
        return undefined;
    }

    async handleExport(node) {
        const decl = node.declaration;
        if (!decl) return;
        // if it's an ExportName, just mark name
        if (decl.type === 'ExportName') {
            this.exports.add(decl.name);
            return;
        }
        // evaluate the declaration (function/declare/assignment) so it binds in module scope
        await this.evaluate(decl);
        // determine exported name(s)
        if (decl.type === 'FunctionDeclaration') {
            this.exports.add(decl.name);
            return;
        }
        if (decl.type === 'Declare') {
            this.exports.add(decl.id);
            return;
        }
        if (decl.type === 'Assignment' && decl.left.type === 'Identifier') {
            this.exports.add(decl.left.name);
            return;
        }
        return;
    }

    async handleIf(node) {
        const test = await this.evaluate(node.test);
        if (test) {
            return await this.evaluate(node.consequent);
        }
        if (node.alternate) return await this.evaluate(node.alternate);
        return undefined;
    }

    async handleWhile(node) {
        let last = undefined;
        while (await this.evaluate(node.test)) {
            last = await this.evaluate(node.body);
        }
        return last;
    }

    async fetchRemoteModule(modPath) {
        // allow full http(s) URLs
        if (modPath.startsWith('http://') || modPath.startsWith('https://')) {
            const res = await fetch(modPath);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            return await res.text();
        }

        // support github.com/user/repo/path/to/file.vpr with caching
        if (modPath.includes('github.com')) {
            const parts = modPath.split('github.com/')[1].split('/');
            const user = parts[0];
            const repo = parts[1];
            const rest = parts.slice(2).join('/');
            const cacheBase = `${this.cacheDir()}/${user}_${repo}`;
            try {
                await Deno.stat(cacheBase);
            } catch (_) {
                try { await Deno.mkdir(cacheBase, { recursive: true }); } catch (e) {}
            }
            const cachePath = `${cacheBase}/${rest}`;
            // if cached, return
            try {
                const txt = await Deno.readTextFile(cachePath);
                return txt;
            } catch (e) {
                // fetch and cache
            }

            const tryBranches = ['main', 'master'];
            for (const br of tryBranches) {
                const raw = `https://raw.githubusercontent.com/${user}/${repo}/${br}/${rest}`;
                try {
                    const r = await fetch(raw);
                    if (r.ok) {
                        const txt = await r.text();
                        // write cache (ignore failures)
                        try {
                            // ensure directory exists
                            const idx = cachePath.lastIndexOf('/');
                            if (idx !== -1) {
                                const dir = cachePath.slice(0, idx);
                                try { await Deno.mkdir(dir, { recursive: true }); } catch (e) {}
                            }
                            await Deno.writeTextFile(cachePath, txt);
                        } catch (e) {}
                        return txt;
                    }
                } catch (e) {
                    // try next
                }
            }
            throw new Error('Unable to fetch github module ' + modPath);
        }

        throw new Error('Unsupported remote module path: ' + modPath);
    }

    lookupVariable(name) {
        if (name in this.globals) return this.globals[name];
        return undefined;
    }

    async handleAssignment(node) {
        const value = await this.evaluate(node.right);
        if (node.left.type === 'Identifier') {
            const name = node.left.name;
            this.globals[name] = value;
            return value;
        }
        if (node.left.type === 'MemberExpression') {
            const obj = await this.evaluate(node.left.object);
            const prop = node.left.property.name;
            if (obj && typeof obj === 'object') {
                obj[prop] = value;
                return value;
            }
            throw new Error('Cannot assign to member of non-object');
        }
        throw new Error('Invalid assignment target');
    }

    async handleMember(node) {
        const obj = await this.evaluate(node.object);
        const prop = node.property.name;
        if (obj && prop in obj) return obj[prop];
        // allow accessing host.* via shorthand when object is 'host' name
        return undefined;
    }

    async handleCall(node) {
        // Special-case member calls to support string/array methods (.upper, .lower, .includes)
        if (node.callee.type === 'MemberExpression') {
            const objNode = node.callee.object;
            const propName = node.callee.property.name;
            const obj = await this.evaluate(objNode);
            const args = [];
            for (const a of node.arguments) args.push(await this.evaluate(a));

            if (typeof obj === 'string') {
                if (propName === 'upper') return obj.toUpperCase();
                if (propName === 'lower') return obj.toLowerCase();
                if (propName === 'includes') return obj.includes(args[0]);
            }
            if (Array.isArray(obj)) {
                if (propName === 'includes') return obj.includes(args[0]);
            }
            // otherwise try to resolve property and call it
            const fn = await this.handleMember(node.callee);
            if (typeof fn === 'function') return fn(...args);
            return undefined;
        }

        const callee = await this.evaluate(node.callee);
        const args = [];
        for (const a of node.arguments) args.push(await this.evaluate(a));
        if (typeof callee === 'function') return callee(...args);
        return undefined;
    }

    async handleBinary(node) {
        const l = await this.evaluate(node.left);
        const r = await this.evaluate(node.right);
        switch (node.operator) {
            case '+': return l + r;
            case '-': return l - r;
            case '*': return l * r;
            case '/': return l / r;
            case '%': return l % r;
            case '==': return l == r;
            case '!=': return l != r;
            case '<': return l < r;
            case '>': return l > r;
            case '<=': return l <= r;
            case '>=': return l >= r;
            case '||': return l || r;
            case '^': return l ^ r;
            default: throw new Error('Unsupported operator ' + node.operator);
        }
    }

    handleFunction(node) {
        const fn = async (...args) => {
            // support expression bodies and block bodies
            const scope = Object.create(this.globals);
            for (let i = 0; i < node.params.length; i++) scope[node.params[i]] = args[i];
            const interpreter = new Interpreter();
            interpreter.globals = scope;
            if (node.body && node.body.type === 'BlockStatement') {
                try {
                    return await interpreter.evaluateProgram({ type: 'Program', body: node.body.body });
                } catch (e) {
                    if (e && e.__return__) return e.value;
                    throw e;
                }
            } else {
                const res = await interpreter.evaluate(node.body);
                return res;
            }
        };
        this.globals[node.name] = fn;
        return fn;
    }
}
