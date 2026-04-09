HTTP and Fetch
================

Examples
--------

`use { fetch }` — simple HTTP client

See `std/fetch_example.vpr` for a simple example that fetches JSON from httpbin and prints the URL.

`use { http }` — simple HTTP server

See `std/http_example.vpr` for a simple example that starts a server on port 8080 and proxies `/proxy` to https://httpbin.org/get.

Running examples
----------------

Run a VPR script that imports these modules or call them from `examples/`:

```bash
deno run --allow-net --allow-read cli/cli.js myscript.vpr
```

Notes
-----
- `host.fetch` returns an object with `.status`, `.ok`, `.headers`, and async helpers `.text()` / `.json()`.
- `host.http.serve` returns a handle with `{ stop(), url }` so you can stop the server programmatically.
- Ensure you pass `--allow-net` when running networked examples.
