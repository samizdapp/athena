/*
 * Shamelessly copied from https://github.com/telehash/lob-enc
 *
 */

import crypto from 'crypto';
import Stream from 'stream';

import * as chacha20 from './chacha20';

export type Packet<J = Record<string, unknown>> = {
    head?: Buffer;
    json: J;
    body: Buffer;
} & Buffer;

type Head<J = Record<string, unknown>> =
    | Packet<J>
    | Buffer
    | J
    | false
    | number;
type Body = Buffer | string;

// encode a packet
export const encode = function <J = Record<string, unknown>>(
    head: Head<J> | null,
    body?: Body
) {
    // support different arg types
    if (typeof body == 'string') body = Buffer.from(body, 'binary');
    if (head === null) head = false; // grrrr
    if (typeof head == 'number') head = Buffer.from(String.fromCharCode(head));
    if (typeof head == 'object') {
        // accept a packet as the first arg
        if (Buffer.isBuffer((head as Packet<J>).body) && body === undefined) {
            const packetHead = head as Packet<J>;
            body = packetHead.body;
            head = packetHead.head || packetHead.json;
        }
        // serialize raw json
        if (!Buffer.isBuffer(head)) {
            head = {
                ...head,
                bodyLength: body ? body.length : 0,
            };
            head = Buffer.from(JSON.stringify(head));
            // require real json object
            if (head.length < 7) head = false;
        }
    }
    head = (head as Buffer) || Buffer.alloc(0);
    body = body || Buffer.alloc(0);
    const len = Buffer.alloc(2);
    len.writeInt16BE(head.length, 0);
    return Buffer.concat([len, head, body]) as Packet<J>;
};

// packet decoding, add values to a buffer return
export const decode = function <J = Record<string, unknown>>(
    bin?: string | Packet<J> | Buffer
) {
    if (!bin) return undefined;
    const buf = (
        typeof bin == 'string' ? Buffer.from(bin, 'binary') : bin
    ) as Packet<J>;
    if (bin.length < 2) return undefined;

    // read and validate the json length
    const len = buf.readUInt16BE(0);
    if (len > buf.length - 2) return undefined;
    buf.head = buf.slice(2, len + 2);
    buf.body = buf.slice(len + 2);

    // parse out the json
    buf.json = {} as J;
    if (len >= 7) {
        try {
            buf.json = JSON.parse(buf.head.toString('utf8'));
        } catch (E) {
            return undefined;
        }
    }
    return buf;
};

// convenience to create a valid packet object
export const packet = function <J = Record<string, unknown>>(
    head: Head<J>,
    body: Body
) {
    return decode(encode(head, body));
};

export const isPacket = function (packet: unknown) {
    if (!Buffer.isBuffer(packet)) return false;
    if (packet.length < 2) return false;
    const possiblePacket = packet as Packet;
    if (typeof possiblePacket.json != 'object') return false;
    if (!Buffer.isBuffer(possiblePacket.head)) return false;
    if (!Buffer.isBuffer(possiblePacket.body)) return false;
    return true;
};

// read a bytestream for a packet, decode the header and pass body through
const Transform = Stream.Transform;
export const stream = function <J = Record<string, unknown>>(
    cbHead: (packet: Packet<J>, cb: (err: Error) => void) => void
) {
    const stream = new Transform();
    let buf: Packet<J> | boolean = Buffer.alloc(0) as Packet<J>;
    stream._transform = function (
        data: Uint8Array,
        enc: string,
        cbTransform: (err?: Error) => void
    ) {
        // no buffer means pass everything through
        if (!buf) {
            stream.push(data);
            return cbTransform();
        }
        // gather until full header
        buf = Buffer.concat([buf as Buffer, data]) as Packet<J>;
        const packet = decode(buf);
        if (!packet) return cbTransform();
        buf = false; // pass through all future data
        // give to the app
        cbHead(packet, function (err: Error) {
            if (err) return cbTransform(err);
            stream.push(packet.body);
            cbTransform();
        });
    };
    return stream;
};

// chunking stream
const Duplex = Stream.Duplex;
export const chunking = function <J = Record<string, unknown>>(
    args: { size?: number; blocking?: boolean; ack?: boolean },
    cbPacket: (err: string | Error | boolean, packet: Packet<J>) => void
) {
    if (!args) args = {};
    if (!cbPacket)
        cbPacket = function () {
            /* empty */
        };

    // chunks can have space for 1 to 255 bytes
    if (!args.size || args.size > 256) args.size = 256;
    let space = args.size - 1;
    if (space < 1) space = 1; // minimum

    let blocked = false;
    if (args.blocking) args.ack = true; // blocking requires acks

    type SendableDuplex<J = Record<string, unknown>> = {
        send: (packet?: Packet<J>) => void;
    } & Stream.Duplex;
    const stream = new Duplex({ allowHalfOpen: false }) as SendableDuplex<J>;
    const queue: Buffer[] = [];

    // incoming chunked data coming from another stream
    let chunks = Buffer.alloc(0);
    let data = Buffer.alloc(0);
    stream._write = function (
        data2: Uint8Array,
        enc: string,
        cbWrite: () => void
    ) {
        // trigger an error when http is detected, but otherwise continue
        if (data.length === 0 && data2.slice(0, 5).toString() === 'GET /') {
            cbPacket('HTTP detected', data2 as Packet<J>);
        }
        data = Buffer.concat([data, data2]);
        while (data.length) {
            const len = data.readUInt8(0);
            // packet done or ack
            if (len === 0) {
                blocked = false;
                if (chunks.length) {
                    const packet = exports.decode(chunks);
                    chunks = Buffer.alloc(0);
                    if (packet) cbPacket(false, packet);
                }
                data = data.slice(1);
                continue;
            }
            // not a full chunk yet, wait for more
            if (data.length < len + 1) break;

            // full chunk, buffer it up
            blocked = false;
            chunks = Buffer.concat([chunks, data.slice(1, len + 1)]);
            data = data.slice(len + 1);
            // ensure a response when enabled
            if (args.ack) {
                if (!queue.length) queue.push(Buffer.from('\0'));
            }
        }
        stream.send(); // always try sending more data
        cbWrite();
    };

    // accept packets to be chunked
    stream.send = function (packet) {
        // break packet into chunks and add to queue
        while (packet) {
            const len = Buffer.alloc(1);
            const chunk = packet.slice(0, space);
            packet = packet.slice(chunk.length) as Packet<J>;
            len.writeUInt8(chunk.length, 0);
            // check if we can include the packet terminating zero
            let zero = Buffer.alloc(0);
            if (packet.length === 0 && chunk.length <= space) {
                zero = Buffer.from('\0');
                break;
            }
            queue.push(Buffer.concat([len, chunk, zero]));
        }

        // pull next chunk off the queue
        if (queue.length && !blocked) {
            const chunk = queue.shift() as Buffer;
            if (args.blocking && chunk.length > 1) blocked = true;
            if (stream.push(chunk)) stream.send(); // let the loop figure itself out
        }
    };

    // try sending more chunks
    stream._read = function () {
        stream.send();
    };

    return stream;
};

function keySize(key: Buffer | crypto.BinaryLike) {
    if (!key) key = 'telehash';
    if (Buffer.isBuffer(key) && key.length === 32) return key;
    return crypto.createHash('sha256').update(key).digest();
}

export const cloak = function (packet: Buffer, key: Buffer, rounds: number) {
    if (!(key = keySize(key)) || !Buffer.isBuffer(packet)) return undefined;
    if (!rounds) rounds = 1;
    // get a non-zero start
    let nonce;
    while (true) {
        nonce = crypto.randomBytes(8);
        if (nonce[0] === 0) continue;
        break;
    }
    const cloaked = Buffer.concat([
        nonce,
        chacha20.encrypt(key, nonce, packet),
    ]);
    rounds--;
    return rounds ? exports.cloak(cloaked, key, rounds) : cloaked;
};

export const decloak = function (cloaked: Buffer, key: Buffer, rounds: number) {
    if (
        !(key = keySize(key)) ||
        !Buffer.isBuffer(cloaked) ||
        cloaked.length < 2
    )
        return undefined;
    if (!rounds) rounds = 0;
    if (cloaked[0] === 0) {
        const packet = exports.decode(cloaked);
        if (packet) packet.cloaked = rounds;
        return packet;
    }
    if (cloaked.length < 10) return undefined; // must have cloak and a minimum packet
    rounds++;
    return exports.decloak(
        chacha20.decrypt(key, cloaked.slice(0, 8), cloaked.slice(8)),
        key,
        rounds
    );
};
