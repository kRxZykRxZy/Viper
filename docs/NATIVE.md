Native modules (C/C++)
======================

Overview
--------
This file shows how to expose C/C++ functions to Viper via `host.ffi` using Deno's `dlopen`.

Notes
-----
- You must run the Viper CLI (or Deno) with `--allow-ffi` and `--allow-read` on the shared library path.
- On Windows you will produce `.dll`, on macOS `.dylib`, on Linux `.so`.

Compile a simple C example (Linux/macOS):

```bash
gcc -shared -fPIC -o libmylib.so mylib.c
```

Windows (MSVC / clang) produces `mylib.dll` (tooling varies).

Example C source (mylib.c):

```c
#include <stdint.h>
int32_t add_int32(int32_t a, int32_t b) {
    return a + b;
}
```

Using from VPR
---------------
In VPR, use the provided `host.ffi.load` helper to load the library and call functions:

```
use { ffi }

const lib = ffi.load('./libmylib.so', {
  add_int32: { parameters: ['i32','i32'], result: 'i32' }
});

const sum = lib.add_int32(3,4);
console.log('sum =', sum);
lib.close();
```

Permissions
-----------
Run with Deno flags:

```
deno run --allow-read --allow-ffi --unstable cli/cli.js myscript.vpr
```

Security
--------
FFI is powerful and unsafe. Only load trusted libraries.
