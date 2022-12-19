import { Message, systemBus } from 'dbus-native';

class Dbus {
    private readonly bus = systemBus();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public invoke(message: Message): Promise<any> {
        return new Promise((resolve, reject) => {
            this.bus.invoke(message, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    getProperty = async (
        service: string,
        objectPath: string,
        objectInterface: string,
        property: string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> => {
        const message: Message = {
            destination: service,
            path: objectPath,
            interface: 'org.freedesktop.DBus.Properties',
            member: 'Get',
            signature: 'ss',
            body: [objectInterface, property],
        };
        // eslint-disable-next-line no-empty-pattern
        const [[], [value]] = await this.invoke(message);
        return value;
    };
}

export default new Dbus();
