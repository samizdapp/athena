import yggdrasilDNS from './yggdrasil/dns'
import http from 'http'
import https from 'https'
import dns from 'dns'
import { LookupFunction } from 'net'

const staticLookup = (): LookupFunction => {
    const lookup: LookupFunction = async (hostname, _, cb) => {
        if (hostname.endsWith(".localhost")) {
            console.log("intercepting localhost", hostname);
            return cb(null, "127.0.0.1", 4);
        }

        if (hostname.endsWith(".yg")) {
            console.log("intercepting yg", hostname);
            const ip = await yggdrasilDNS.lookup(hostname).catch((_e) => null);
            console.log('got addr', ip)
            if (ip) {
                return cb(null, ip, 6);
            }
        }

        dns.resolve(hostname, (err, addresses) => {
            if (err) {
                return cb(err, '', 4);
            }
            return cb(null, addresses[0], 4);
        })
    }
    return lookup
}

export default function staticDnsAgent(url: string) {
  const _u = new URL(url);
  const httpModule = _u.protocol === "http:" ? http : https;
  return new httpModule.Agent({ lookup: staticLookup() });
}