export const environment = {
    production: true,
    libp2p_id_file: __dirname + '/assets/libp2p.id',
    libp2p_listen_port: 9000,
    libp2p_bootstrap_file: '/next/assets/libp2p.bootstrap',
    yggdrasil_listen_port: 5000,
    yggdrasil_admin_host: 'localhost',
    yggdrasil_admin_port: 9001,
    yggdrasil_config: '/etc/yggdrasil-network/config.conf',
    yggdrasil_peer_file: '/yggdrasil/peer',
    hostsfile: '/shared_etc/hosts',
};
