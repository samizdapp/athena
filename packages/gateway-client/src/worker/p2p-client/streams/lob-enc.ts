/*
 * Shamelessly copied from https://github.com/telehash/lob-enc
 *
 */

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
