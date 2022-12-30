import {
    multiaddr,
    Multiaddr,
} from '@athena/shared/libp2p/@multiformats/multiaddr';
import { P2P } from '@multiformats/mafmt';

export class BootstrapAddress {
    public multiaddr: Multiaddr;
    public lastSeen = 0;
    public latency = Infinity;
    public isRelay = false;
    public isDNS = false;
    public address: string;

    private _serverId: string;

    public constructor(address: string) {
        if (!P2P.matches(address)) {
            throw new Error('Invalid multiaddr');
        }

        this.multiaddr = multiaddr(address);
        const serverId = this.multiaddr.getPeerId();
        if (!serverId) {
            throw new Error(
                `Address ${address} contains invalid or missing peer id.`
            );
        }

        this.address = this.multiaddr.toString();
        this._serverId = serverId;
        this.isRelay = this.address.includes('/p2p-circuit/');
        this.isDNS = this.address.includes('/dns4/');
    }

    static fromJson(json: Record<string, unknown>): BootstrapAddress {
        const addr = new BootstrapAddress(json.address as string);
        addr.lastSeen = json.lastSeen as number;
        addr.latency = json.latency as number;
        return addr;
    }

    toJson(): Record<string, unknown> {
        return {
            address: this.address ?? '',
            lastSeen: this.lastSeen ?? Date.now(),
            latency: this.latency ?? Infinity,
        };
    }

    toString(): string {
        return this.address;
    }

    get serverId(): string {
        return this._serverId;
    }

    set serverId(id: string) {
        // update multiaddr
        const newMultiaddr = multiaddr(
            this.multiaddr.toString().replace(this._serverId, id)
        );
        const newServerId = newMultiaddr.getPeerId();
        if (!newServerId) {
            throw new Error(
                `Error setting serverId: ${id} (was parsed to: ${newServerId}).`
            );
        }
        this.address = newMultiaddr.toString();
        this.multiaddr = newMultiaddr;
        this._serverId = newServerId;
    }
}
