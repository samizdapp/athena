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
}

export default new Dbus();
