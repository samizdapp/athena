export const environment = {
    production: true,
    force_relay_open: process.env.force_relay_open || true,
    libp2p_id_file: process.env.libp2p_id_file || '/shared_etc/libp2p.id',
    libp2p_listen_port: parseInt(process.env.libp2p_listen_port || '9000'),
    libp2p_bootstrap_file:
        process.env.libp2p_bootstrap_file || '/next/assets/libp2p.bootstrap',
    libp2p_relay_file:
        process.env.libp2p_relay_file || '/yggdrasil/libp2p.relay',
    yggdrasil_listen_port: parseInt(
        process.env.yggdrasil_listen_port || '5000'
    ),
    yggdrasil_admin_host: process.env.yggdrasil_admin_host || '127.0.0.1',
    yggdrasil_admin_port: parseInt(process.env.yggdrasil_admin_port || '9001'),
    yggdrasil_config:
        process.env.yggdrasil_config || '/etc/yggdrasil-network/config.conf',
    yggdrasil_peer_file: process.env.yggdrasil_peer_file || '/yggdrasil/peer',
    hostsfile: process.env.hostsfile || '/shared_etc/hosts',
    default_log_level: process.env.default_log_level || 'INFO',
    ignore_status: (process.env.ignore_status as unknown as boolean) || false,
    yggdrasil_alias_localhost: process.env.yggdrasil_local_alias || '',
    fetch_localhost_ip: process.env.fetch_localhost_ip || '127.0.0.1',
    fetch_localhost_port: parseInt(process.env.fetch_localhost_port || '80'),
};
