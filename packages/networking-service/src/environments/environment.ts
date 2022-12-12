export const environment = {
    production: false,
    force_relay_open: true,
    libp2p_id_file: __dirname + '/assets/libp2p.id',
    libp2p_listen_port: 9900,
    libp2p_bootstrap_file: __dirname + '/assets/libp2p.bootstrap',
    libp2p_relay_file: __dirname + '/assets/libp2p.relay',
    yggdrasil_listen_port: 5500,
    yggdrasil_admin_host: 'samizdev.local',
    yggdrasil_admin_port: 9001,
    yggdrasil_config: __dirname + '/assets/yggdrasil.config.json',
    yggdrasil_peer_file: __dirname + '/assets/yggdrasil.peer',
    hostsfile: __dirname + '/assets/hosts',
};
