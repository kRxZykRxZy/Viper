# FFI (native) modules

This document explains how to use native C/C++ libraries from Viper scripts via the host FFI bridge.

Requirements
- Run with Deno `--allow-ffi` and `--allow-read` when loading local shared libraries.

Example (VPR):

use { ffi }

// load a shared library (platform-specific extension)
lib = ffi.dlopen("./native/libmylib.so", {
    add: { type: 'function', parameters: ['f64','f64'], result: 'f64' }
})

// call function
result = lib.add(1.5, 2.0)
print(result)

Notes
- The `dlopen` wrapper expects a `symbols` description similar to Deno.dlopen signature.
- Remember to close the library with `lib.close()` when done.

