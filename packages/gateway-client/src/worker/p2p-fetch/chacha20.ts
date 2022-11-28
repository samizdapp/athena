/*
 * Shamelessly copied from https://github.com/quartzjer/chacha20
 *
 */

/* chacha20 - 256 bits */

// Written in 2014 by Devi Mandiri. Public domain.
//
// Implementation derived from chacha-ref.c version 20080118
// See for details: http://cr.yp.to/chacha/chacha-20080128.pdf

function U8TO32_LE(x: Buffer, i: number) {
    return x[i] | (x[i + 1] << 8) | (x[i + 2] << 16) | (x[i + 3] << 24);
}

function U32TO8_LE(x: Uint8Array, i: number, u: number) {
    x[i] = u;
    u >>>= 8;
    x[i + 1] = u;
    u >>>= 8;
    x[i + 2] = u;
    u >>>= 8;
    x[i + 3] = u;
}

function ROTATE(v: number, c: number) {
    return (v << c) | (v >>> (32 - c));
}

class Chacha20 {
    public input: Uint32Array;

    constructor(key: Buffer, nonce: Buffer, counter: number) {
        this.input = new Uint32Array(16);

        // https://tools.ietf.org/html/draft-irtf-cfrg-chacha20-poly1305-01#section-2.3
        this.input[0] = 1634760805;
        this.input[1] = 857760878;
        this.input[2] = 2036477234;
        this.input[3] = 1797285236;
        this.input[4] = U8TO32_LE(key, 0);
        this.input[5] = U8TO32_LE(key, 4);
        this.input[6] = U8TO32_LE(key, 8);
        this.input[7] = U8TO32_LE(key, 12);
        this.input[8] = U8TO32_LE(key, 16);
        this.input[9] = U8TO32_LE(key, 20);
        this.input[10] = U8TO32_LE(key, 24);
        this.input[11] = U8TO32_LE(key, 28);
        // be compatible with the reference ChaCha depending on the nonce size
        if (nonce.length === 12) {
            this.input[12] = counter;
            this.input[13] = U8TO32_LE(nonce, 0);
            this.input[14] = U8TO32_LE(nonce, 4);
            this.input[15] = U8TO32_LE(nonce, 8);
        } else {
            this.input[12] = counter;
            this.input[13] = 0;
            this.input[14] = U8TO32_LE(nonce, 0);
            this.input[15] = U8TO32_LE(nonce, 4);
        }
    }

    quarterRound(x: Uint32Array, a: number, b: number, c: number, d: number) {
        x[a] += x[b];
        x[d] = ROTATE(x[d] ^ x[a], 16);
        x[c] += x[d];
        x[b] = ROTATE(x[b] ^ x[c], 12);
        x[a] += x[b];
        x[d] = ROTATE(x[d] ^ x[a], 8);
        x[c] += x[d];
        x[b] = ROTATE(x[b] ^ x[c], 7);
    }

    encrypt(dst: Buffer, src: Buffer, len: number) {
        const x = new Uint32Array(16);
        const output = new Uint8Array(64);
        let i,
            dpos = 0,
            spos = 0;

        while (len > 0) {
            for (i = 16; i--; ) x[i] = this.input[i];
            for (i = 20; i > 0; i -= 2) {
                this.quarterRound(x, 0, 4, 8, 12);
                this.quarterRound(x, 1, 5, 9, 13);
                this.quarterRound(x, 2, 6, 10, 14);
                this.quarterRound(x, 3, 7, 11, 15);
                this.quarterRound(x, 0, 5, 10, 15);
                this.quarterRound(x, 1, 6, 11, 12);
                this.quarterRound(x, 2, 7, 8, 13);
                this.quarterRound(x, 3, 4, 9, 14);
            }
            for (i = 16; i--; ) x[i] += this.input[i];
            for (i = 16; i--; ) U32TO8_LE(output, 4 * i, x[i]);

            this.input[12] += 1;
            if (!this.input[12]) {
                this.input[13] += 1;
            }
            if (len <= 64) {
                for (i = len; i--; ) {
                    dst[i + dpos] = src[i + spos] ^ output[i];
                }
                return;
            }
            for (i = 64; i--; ) {
                dst[i + dpos] = src[i + spos] ^ output[i];
            }
            len -= 64;
            spos += 64;
            dpos += 64;
        }
    }

    keystream(dst: Buffer, len: number) {
        for (let i = 0; i < len; ++i) dst[i] = 0;
        this.encrypt(dst, dst, len);
    }
}

// additions to make it easier and export it as a module

export { Chacha20 as Cipher };

const encrypt = function (key: Buffer, nonce: Buffer, data: Buffer) {
    const cipher = new Chacha20(key, nonce, 1);
    const ret = Buffer.alloc(data.length);
    cipher.encrypt(ret, data, data.length);
    return ret;
};

const decrypt = encrypt;

export { encrypt, decrypt };
