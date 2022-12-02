import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { exec, ExecException } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

@Injectable()
export class SupervisorManager {
    private log = new Logger(SupervisorManager.name);

    private handleCmdOut({
        stdout,
        stderr,
    }: {
        stdout: string;
        stderr: string;
    }) {
        return {
            stdout: stdout.replaceAll('\\n', '\n').trim(),
            stderr: stderr.replaceAll('\\n', '\n').trim(),
        };
    }

    @Cron('*/30 * * * * *')
    public async check() {
        try {
            const { stdout, stderr } = this.handleCmdOut(
                await execAsync(`python ${process.env.SUPERVISOR_PATH}`)
            );
            if (stdout) {
                this.log.log(stdout);
            }
            if (stderr) {
                this.log.warn(stderr);
            }
        } catch (e) {
            const { stdout, stderr } = this.handleCmdOut(
                e as {
                    stdout: string;
                    stderr: string;
                } & ExecException
            );
            if (stdout) {
                this.log.log(stdout);
            }
            if (stderr) {
                this.log.error(stderr);
            }
        }
    }
}
