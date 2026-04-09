# WASM modules

Viper supports loading WebAssembly modules via `host.wasm.instantiateFile` which accepts a local path or URL and optional imports.

Example (VPR):

use { wasm }

wasm_mod = wasm.instantiateFile("./wasm/sum.wasm", { env: {} })
result = wasm_mod.sum(1,2)
print(result)

