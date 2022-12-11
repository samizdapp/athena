
import { createLibp2p, Libp2p } from "libp2p";
import {
  createEd25519PeerId,
  createFromProtobuf,
  exportToProtobuf,
} from "@libp2p/peer-id-factory";
import { readFile, writeFile} from "fs/promises";
import { environment } from "../environments/environment";

export default async function createLibp2pInstance(): Promise<Libp2p> {
    const peerId = await readFile(environment.libp2p_id_file)
            .then(createFromProtobuf)
            .catch(async (_) => {
                const _id = await createEd25519PeerId();
                await writeFile(environment.libp2p_id_file, exportToProtobuf(_id));
                return _id;
            });

        return createLibp2p({
            peerId,
        });
}


