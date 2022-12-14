import { Message } from 'dbus-native';
import dbus from './dbus';

import * as os from 'os';

interface PublishedHosts {
    group: string;
    hostname: string;
    address: string;
}

class MDNS {
    private publishedHosts: PublishedHosts[] = [];

    private findPublishedHosts(search: {
        hostname?: string;
        address?: string;
    }): PublishedHosts {
        return this.publishedHosts.filter(
            i => i.hostname === search.hostname && i.address === search.address
        )[0];
    }

    private addPublishedHost(host: PublishedHosts) {
        this.publishedHosts.push(host);
    }

    private removePublishedHost(hostname: string) {
        this.publishedHosts = this.publishedHosts.filter(
            i => i.hostname === hostname
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private dbusInvoker(message: Message): PromiseLike<any> {
        return dbus.invoke(message);
    }

    private getIPv4InterfaceInfo(iface?: string): os.NetworkInterfaceInfo[] {
        return Object.entries(os.networkInterfaces())
            .filter(([nic]) => !iface || nic === iface)
            .flatMap(([, ips]) => ips || [])
            .filter(ip => !ip.internal && ip.family === 'IPv4');
    }

    private async getGroup(): Promise<string> {
        return await this.dbusInvoker({
            destination: 'org.freedesktop.Avahi',
            path: '/',
            interface: 'org.freedesktop.Avahi.Server',
            member: 'EntryGroupNew',
        });
    }

    private async addHostAddress(
        hostname: string,
        address: string
    ): Promise<void> {
        // If the hostname is already published with the same address, return
        if (this.findPublishedHosts({ hostname, address })) return;

        console.log(
            `* mdns - adding ${hostname} at address ${address} to local MDNS pool`
        );

        const group = await this.getGroup();
        console.log('* mdns - avahi group:', group);

        await this.dbusInvoker({
            destination: 'org.freedesktop.Avahi',
            path: group,
            interface: 'org.freedesktop.Avahi.EntryGroup',
            member: 'AddAddress',
            body: [-1, -1, 0x10, hostname, address],
            signature: 'iiuss',
        });

        await this.dbusInvoker({
            destination: 'org.freedesktop.Avahi',
            path: group,
            interface: 'org.freedesktop.Avahi.EntryGroup',
            member: 'Commit',
        });
        this.addPublishedHost({
            group,
            hostname,
            address,
        });
    }

    private async removeHostAddress(hostname: string): Promise<void> {
        // If the hostname doesn't exist, we don't use it
        const hostDetails = this.findPublishedHosts({ hostname });
        if (!hostDetails) return;

        console.log(
            `* mdns = removing ${hostname} at address from local MDNS pool`
        );

        // Free the group, removing the published address
        await this.dbusInvoker({
            destination: 'org.freedesktop.Avahi',
            path: hostDetails.group,
            interface: 'org.freedesktop.Avahi.EntryGroup',
            member: 'Free',
        });

        // Remove from the published hosts list
        this.removePublishedHost(hostname);
    }

    private async removeMdnsEntry(hostname: string) {
        this.removeHostAddress(hostname);
    }

    private async addMdnsEntry(hostname: string) {
        console.log('* mdns - starting');
        const ipAddr = this.getIPv4InterfaceInfo(process.env.INTERFACE)[0]
            .address;
        console.log('* mdns - IP:', ipAddr);
        this.addHostAddress(hostname, ipAddr);
    }
}

export default new MDNS();
