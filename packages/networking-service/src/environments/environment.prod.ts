export const environment = {
    production: true,
    force_relay_open: false,
    libp2p_id_file: __dirname + '/assets/libp2p.id',
    libp2p_listen_port: 9002,
    libp2p_bootstrap_file: '/next/assets/libp2p.bootstrap',
    libp2p_relay_file: '/yggdrasil/libp2p.relay',
    yggdrasil_listen_port: 5000,
    yggdrasil_admin_host: 'localhost',
    yggdrasil_admin_port: 9001,
    yggdrasil_config: '/etc/yggdrasil-network/config.conf',
    yggdrasil_peer_file: '/yggdrasil/peer',
    hostsfile: '/shared_etc/hosts',
};
