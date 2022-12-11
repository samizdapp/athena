
// eslint-disable-next-line
// @ts-ignore
import { libp2p,  createEd25519PeerId, createFromProtobuf,exportToProtobuf } from "libp2p";
import { readFile, writeFile} from "fs/promises";
import { environment } from "../environments/environment";

export const createLibp2p = libp2p.createLibp2p;

export default async function createLibp2pInstance(): Promise<libp2p.Libp2p> {
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


