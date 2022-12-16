export const environment = {
    production: true,
    force_relay_open: process.env.FORCE_RELAY_OPEN || true,
    libp2p_id_file: process.env.LIBP2P_ID_FILE || '/shared_etc/libp2p.id',
    libp2p_listen_port: parseInt(process.env.LIBP2P_LISTEN_PORT || '9000'),
    libp2p_bootstrap_file:
        process.env.LIBP2P_BOOTSTRAP_FILE || '/next/assets/libp2p.bootstrap',
    libp2p_relay_file:
        process.env.LIBP2P_RELAY_FILE || '/yggdrasil/libp2p.relay',
    yggdrasil_listen_port: parseInt(
        process.env.YGGDRASIL_LISTEN_PORT || '5000'
    ),
    yggdrasil_admin_host: process.env.YGGDRASIL_ADMIN_HOST || '127.0.0.1',
    yggdrasil_admin_port: parseInt(process.env.YGGDRASIL_ADMIN_PORT || '9001'),
    yggdrasil_config:
        process.env.YGGDRASIL_CONFIG || '/etc/yggdrasil-network/config.conf',
    yggdrasil_peer_file: process.env.YGGDRASIL_PEER_FILE || '/yggdrasil/peer',
    hostsfile: process.env.HOSTSFILE || '/shared_etc/hosts',
    default_log_level: process.env.DEFAULT_LOG_LEVEL || 'INFO',
    ignore_status: (process.env.IGNORE_STATUS as unknown as boolean) || false,
    yggdrasil_alias_localhost: process.env.YGGDRASIL_LOCAL_ALIAS || '',
    fetch_localhost_ip: process.env.FETCH_LOCALHOST_IP || '127.0.0.1',
    fetch_localhost_port: parseInt(process.env.FETCH_LOCALHOST_PORT || '80'),
    nx_local: (process.env.NX_LOCAL as unknown as boolean) || false,
};
