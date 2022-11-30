import { Injectable } from '@nestjs/common';
import { exec as childProcessExec } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(childProcessExec);

@Injectable()
export class AppService {
    async getData() {
        let stdout, stderr;
        ({ stdout, stderr } = await exec('docker compose ls'));
        const composeOut = `${stdout}${'\n'}${stderr}`;
        ({ stdout, stderr } = await exec('docker ps'));
        const dockerOut = `${stdout}${'\n'}${stderr}`;

        return {
            composeOut,
            dockerOut,
        };
    }
}
