// copied from https://github.com/balena-labs-projects/wifi-repeater, apache license

import { NetworkManagerTypes } from './types/network-manager';
import { BodyEntry } from 'dbus-native';
import dbus from './dbus';
import { environment } from './environment';

export interface NetworkDevice {
    iface: string; // IP interface name
    path: string; // DBus object path
    type: string;
    driver: string;
    connected: boolean;
}

export interface WirelessDevice extends NetworkDevice {
    apCapable: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface WiredDevice extends NetworkDevice {}

export interface WirelessNetwork {
    iface: string;
    ssid: string;
    password?: string;
}

const nm = 'org.freedesktop.NetworkManager';

// Wireless
export const createAccessPoint = async (
    device: WirelessNetwork
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
    try {
        // Error out if the interface does not exist
        const wifiDevices: NetworkDevice[] = await getWiFiDevices();

        if (!wifiDevices.some(d => d.iface === device.iface)) {
            console.log(
                `Selected interface ${device.iface} does not exist. Hotspot creation aborted...`
            );
            return;
        }

        const connectionParams = [
            [
                'connection',
                [
                    ['id', ['s', device.ssid]],
                    ['type', ['s', '802-11-wireless']],
                ],
            ],
            [
                '802-11-wireless',
                [
                    ['ssid', ['ay', stringToArrayOfBytes(device.ssid)]],
                    ['mode', ['s', 'ap']],
                ],
            ],
            [
                '802-11-wireless-security',
                [
                    ['key-mgmt', ['s', 'wpa-psk']],
                    ['psk', ['s', device.password]],
                ],
            ],
            ['ipv4', [['method', ['s', 'shared']]]],
            ['ipv6', [['method', ['s', 'ignore']]]],
        ];

        const dbusPath = await getPathByIface(device.iface);
        const connection = await addConnection(
            connectionParams as unknown as BodyEntry
        );
        const result = await activateConnection(connection, dbusPath);
        return result;
    } catch (error) {
        console.log(`Error creating Hotspot: ${error}`);
    }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const connectToWifi = async (network: WirelessNetwork): Promise<any> => {
    try {
        const connectionParams = [
            [
                'connection',
                [
                    ['id', ['s', network.ssid]],
                    ['type', ['s', '802-11-wireless']],
                ],
            ],
            [
                '802-11-wireless',
                [
                    ['ssid', ['ay', stringToArrayOfBytes(network.ssid)]],
                    ['mode', ['s', 'infrastructure']],
                ],
            ],
            [
                '802-11-wireless-security',
                [
                    ['key-mgmt', ['s', 'wpa-psk']],
                    ['psk', ['s', network.password]],
                ],
            ],
            ['ipv4', [['method', ['s', 'auto']]]],
            ['ipv6', [['method', ['s', 'auto']]]],
        ];

        const device = await getPathByIface(network.iface);
        const connection = await addConnection(
            connectionParams as unknown as BodyEntry
        );
        const result = await activateConnection(connection, device);
        return result;
    } catch (error) {
        console.log(`Error connecting to WiFi: ${error}`);
    }
};

// NetworkManager
export const getWiFiDevices = async (): Promise<WirelessDevice[]> => {
    const devices: NetworkDevice[] = await getDevicesByType(
        NetworkManagerTypes.DEVICE_TYPE.WIFI
    );
    const wifiDevices: WirelessDevice[] = [];

    for await (const device of devices) {
        const apCapable = !!(
            (await dbus.getProperty(
                nm,
                device.path,
                'org.freedesktop.NetworkManager.Device.Wireless',
                'WirelessCapabilities'
            )) & NetworkManagerTypes.WIFI_DEVICE_CAP.AP
        );
        wifiDevices.push({ ...device, apCapable });
    }

    return wifiDevices;
};

export const getWiredDevices = async (): Promise<WiredDevice[]> => {
    return await getDevicesByType(NetworkManagerTypes.DEVICE_TYPE.ETHERNET);
};

export const getDevicesByType = async (
    type: number
): Promise<NetworkDevice[]> => {
    const paths: string[] = await getDevicesPath();
    const devices: NetworkDevice[] = [];

    for await (const path of paths) {
        const deviceType: number = await dbus.getProperty(
            nm,
            path,
            'org.freedesktop.NetworkManager.Device',
            'DeviceType'
        );

        if (deviceType === type) {
            const iface: string = await dbus.getProperty(
                nm,
                path,
                'org.freedesktop.NetworkManager.Device',
                'Interface'
            );
            const connected: boolean =
                (await dbus.getProperty(
                    nm,
                    path,
                    'org.freedesktop.NetworkManager.Device',
                    'Ip4Connectivity'
                )) === NetworkManagerTypes.CONNECTIVITY.FULL;
            const driver: string = await dbus.getProperty(
                nm,
                path,
                'org.freedesktop.NetworkManager.Device',
                'Driver'
            );
            const typeName: string =
                Object.keys(NetworkManagerTypes.DEVICE_TYPE).find(
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    key => NetworkManagerTypes.DEVICE_TYPE[key] === type
                ) || 'UNKNOWN';
            devices.push({ path, iface, connected, driver, type: typeName });
        }
    }

    return devices;
};

export const getDevicesPath = async (): Promise<string[]> => {
    return await dbus.invoke({
        destination: nm,
        path: '/org/freedesktop/NetworkManager',
        interface: 'org.freedesktop.NetworkManager',
        member: 'GetDevices',
    });
};

export const getPathByIface = async (iface: string): Promise<string> => {
    return await dbus.invoke({
        destination: nm,
        path: '/org/freedesktop/NetworkManager',
        interface: 'org.freedesktop.NetworkManager',
        member: 'GetDeviceByIpIface',
        signature: 's',
        body: [iface],
    });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const checkDeviceConnectivity = async (iface: string): Promise<any> => {
    const path: string = await getPathByIface(iface);
    return await dbus.getProperty(
        nm,
        path,
        'org.freedesktop.NetworkManager.Device',
        'Ip4Connectivity'
    );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const checkNMConnectivity = async (): Promise<any> => {
    const nmConnectivityState = await dbus.invoke({
        destination: nm,
        path: '/org/freedesktop/NetworkManager',
        interface: 'org.freedesktop.NetworkManager',
        member: 'CheckConnectivity',
    });

    return nmConnectivityState === NetworkManagerTypes.CONNECTIVITY.FULL;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const addConnection = async (params: BodyEntry): Promise<any> => {
    return await dbus.invoke({
        destination: nm,
        path: '/org/freedesktop/NetworkManager/Settings',
        interface: 'org.freedesktop.NetworkManager.Settings',
        member: 'AddConnection',
        signature: 'a{sa{sv}}',
        body: [params],
    });
};

export const activateConnection = async (connection: string, path: string) => {
    return await dbus.invoke({
        destination: nm,
        path: '/org/freedesktop/NetworkManager',
        interface: 'org.freedesktop.NetworkManager',
        member: 'ActivateConnection',
        signature: 'ooo',
        body: [connection, path, '/'],
    });
};

function stringToArrayOfBytes(str: string) {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; ++i) {
        bytes.push(str.charCodeAt(i));
    }

    return bytes;
}

// defaults
const AP_SSID = environment.ap_ssid;
const AP_PASSWORD = environment.ap_password;
const WIFI_SSID = environment.wifi_ssid;
const WIFI_PASSWORD = environment.wifi_password;

(async () => {
    console.log('-- WiFi repeater: starting...');

    // Get available devices
    const wifiDevices = await getWiFiDevices();
    const wiredDevices = await getWiredDevices();
    console.log(
        `Wireless interfaces found: ${wifiDevices.map(d => d.iface).join(', ')}`
    );
    console.log(
        `Wired interfaces found: ${wiredDevices.map(d => d.iface).join(', ')}`
    );

    // Get available devices and find out which are useful. Only interested in:
    // - accessPoint: Any wireless device capable of creating an AP
    // - bridge: Any wireless device excluding accessPoint device
    // - ethernet: Any wired device that has internet connectivity
    const accessPoint = wifiDevices.find(device => device.apCapable);
    const bridge = wifiDevices.find(
        device => device.iface !== accessPoint?.iface
    );
    const ethernet = wiredDevices.find(device => device.connected);

    // Create Access Point, required for both modes of operation
    if (!accessPoint) {
        console.log(
            `Could not find a wireless device with AP capabilities. Exiting...`
        );
        return;
    }

    console.log(
        `Creating WiFi AP on ${accessPoint.iface} with SSID "${AP_SSID}" and password "${AP_PASSWORD}"...`
    );
    await createAccessPoint({
        iface: accessPoint.iface,
        ssid: AP_SSID,
        password: AP_PASSWORD,
    });

    return;

    // Use secondary wireless device for internet if ethernet doesn't do the job.
    if (!ethernet) {
        console.log(
            `Ethernet device has no internet. Attempting to use secondary wireless device to connect to WiFi...`
        );

        if (!bridge) {
            console.log(
                `Could not find a secondary wireless device. Exiting...`
            );
            return;
        }

        if (!WIFI_SSID || !WIFI_PASSWORD) {
            console.log(
                `WiFi credentials for secondary wireless device not provided. Exiting...`
            );
            return;
        }

        // Connect secondary wireless interface to WiFi
        console.log(
            `Connecting ${bridge.iface} to WiFi with SSID "${WIFI_SSID}" and password "${WIFI_PASSWORD}"`
        );
        await connectToWifi({
            iface: bridge.iface,
            ssid: WIFI_SSID,
            password: WIFI_PASSWORD,
        });

        // Check if we are now connected to the internet
        const nmConnected = await checkNMConnectivity();
        if (!nmConnected) {
            console.log(
                `Warning: Could not detect internet access. Bad WiFi credentials provided or WiFi network has no internet access...`
            );
            return;
        }

        console.log(`WiFi repeater started in REPEATER mode.`);
    } else {
        console.log(`WiFi repeater started in AP mode.`);
    }
})();
