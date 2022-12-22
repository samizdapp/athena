export default {
    CADDY_ROOT: process.env.NX_CADDY_ROOT ?? '',
    get STATUS_API_ROOT() {
        return (
            process.env.NX_STATUS_API_ROOT ??
            `${this.CADDY_ROOT}/smz/api/status`
        );
    },
    get NETWORKING_API_ROOT() {
        return (
            process.env.NX_NETWORKING_API_ROOT ??
            `${this.CADDY_ROOT}/smz/api/networking`
        );
    },
};
