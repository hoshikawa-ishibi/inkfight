// SHA-256 / HMAC-SHA256 / base64url —— 纯 JS，同步，无依赖。
//
// **为什么不用现成的**：浏览器的 `crypto.subtle` 是异步的，而且只在安全上下文
// （https / localhost / file）里存在；Node 的 `node:crypto` 浏览器里根本没有。
// 两边各挑一个「现成的」，就等于同一份签名规则有两份实现——这是本项目出过
// 七次 bug 的那个形状。分享码必须两边算出完全一样的结果，所以这里自己写一份，
// `npm test` 用标准向量钉住它。
//
// 性能不是问题：一条战绩几百字节，签一次是微秒级。

// ── 字节与字符串 ───────────────────────────────────────────
// 不用 TextEncoder：Node 和浏览器都有，但手写一份的代价只有十几行，
// 而且能让整个模块在任何环境里都是同一条路径。
export function utf8Bytes(str){
  const out = [];
  for(let i = 0; i < str.length; i++){
    let c = str.codePointAt(i);
    if(c > 0xffff) i++;                    // 代理对占两个 UTF-16 单元
    if(c < 0x80) out.push(c);
    else if(c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if(c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function bytesToUtf8(bytes){
  let out = '';
  for(let i = 0; i < bytes.length;){
    const b = bytes[i];
    let c, n;
    if(b < 0x80){ c = b; n = 1; }
    else if((b & 0xe0) === 0xc0){ c = b & 31; n = 2; }
    else if((b & 0xf0) === 0xe0){ c = b & 15; n = 3; }
    else { c = b & 7; n = 4; }
    // 截断的多字节序列（分享码被截断时会遇到）不该让整个解码抛异常，
    // 交给上层按「格式不对」处理。
    if(i + n > bytes.length) throw new RangeError('UTF-8 序列被截断');
    for(let k = 1; k < n; k++) c = (c << 6) | (bytes[i + k] & 63);
    out += String.fromCodePoint(c);
    i += n;
  }
  return out;
}

export function bytesToHex(bytes){
  let s = '';
  for(const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

// ── base64url ─────────────────────────────────────────────
// 分享码要能贴进聊天框、也能当文件名的一部分，所以用 URL 安全字母表且不带 `=`。
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INV = (() => {
  const m = new Map();
  for(let i = 0; i < B64.length; i++) m.set(B64[i], i);
  return m;
})();

export function bytesToBase64url(bytes){
  let out = '';
  for(let i = 0; i < bytes.length; i += 3){
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b === undefined ? 0 : b) >> 4)];
    if(b === undefined) break;
    out += B64[((b & 15) << 2) | ((c === undefined ? 0 : c) >> 6)];
    if(c === undefined) break;
    out += B64[c & 63];
  }
  return out;
}

export function base64urlToBytes(str){
  const out = [];
  let buf = 0, bits = 0;
  for(const ch of str){
    const v = B64_INV.get(ch);
    if(v === undefined) throw new RangeError('分享码里有非法字符：' + ch);
    buf = (buf << 6) | v;
    bits += 6;
    if(bits >= 8){
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

// ── SHA-256 ───────────────────────────────────────────────
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const ror = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

export const SHA256_BLOCK = 64;
export const SHA256_DIGEST = 32;

export function sha256(bytes){
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  // 补位：0x80，补零到 56 mod 64，最后 8 字节是大端的**比特**长度。
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  // 比特长度可能超过 32 位能表示的范围，所以高低两半分开写。
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  const tail = padded.length - 8;
  padded[tail]     = (hi >>> 24) & 0xff;
  padded[tail + 1] = (hi >>> 16) & 0xff;
  padded[tail + 2] = (hi >>> 8) & 0xff;
  padded[tail + 3] = hi & 0xff;
  padded[tail + 4] = (lo >>> 24) & 0xff;
  padded[tail + 5] = (lo >>> 16) & 0xff;
  padded[tail + 6] = (lo >>> 8) & 0xff;
  padded[tail + 7] = lo & 0xff;

  const w = new Uint32Array(64);
  for(let off = 0; off < padded.length; off += 64){
    for(let i = 0; i < 16; i++){
      w[i] = (padded[off + i * 4] << 24 | padded[off + i * 4 + 1] << 16
            | padded[off + i * 4 + 2] << 8 | padded[off + i * 4 + 3]) >>> 0;
    }
    for(let i = 16; i < 64; i++){
      const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for(let i = 0; i < 64; i++){
      const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  h.forEach((v, i) => {
    out[i * 4]     = (v >>> 24) & 0xff;
    out[i * 4 + 1] = (v >>> 16) & 0xff;
    out[i * 4 + 2] = (v >>> 8) & 0xff;
    out[i * 4 + 3] = v & 0xff;
  });
  return out;
}

export function sha256Hex(input){
  return bytesToHex(sha256(typeof input === 'string' ? utf8Bytes(input) : input));
}

// ── HMAC-SHA256（RFC 2104）─────────────────────────────────
export function hmacSha256(key, msg){
  const k0 = typeof key === 'string' ? utf8Bytes(key) : key;
  const m = typeof msg === 'string' ? utf8Bytes(msg) : msg;

  let block = new Uint8Array(SHA256_BLOCK);
  if(k0.length > SHA256_BLOCK) block.set(sha256(k0));
  else block.set(k0);

  const ipad = new Uint8Array(SHA256_BLOCK + m.length);
  const opad = new Uint8Array(SHA256_BLOCK + SHA256_DIGEST);
  for(let i = 0; i < SHA256_BLOCK; i++){
    ipad[i] = block[i] ^ 0x36;
    opad[i] = block[i] ^ 0x5c;
  }
  ipad.set(m, SHA256_BLOCK);
  opad.set(sha256(ipad), SHA256_BLOCK);
  return sha256(opad);
}

export function hmacSha256Hex(key, msg){
  return bytesToHex(hmacSha256(key, msg));
}

// 比较签名时不要用 `===` 提前返回：等长常数时间比较，习惯留住就行。
export function bytesEqual(a, b){
  if(a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
