struct Buf { data: array<f32>; };

@group(0) @binding(0) var<storage, read> A: Buf;
@group(0) @binding(1) var<storage, read> B: Buf;
@group(0) @binding(2) var<storage, read_write> C: Buf;
@group(0) @binding(3) var<storage, read> dims: array<u32>;

@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let M = dims[0];
  let N = dims[1];
  let K = dims[2];
  let row = gid.y;
  let col = gid.x;
  if (row >= M || col >= N) { return; }
  var sum: f32 = 0.0;
  var k: u32 = 0u;
  loop {
    if (k >= K) { break; }
    let a = A.data[row * K + k];
    let b = B.data[k * N + col];
    sum = sum + a * b;
    k = k + 1u;
  }
  C.data[row * N + col] = sum;
}
