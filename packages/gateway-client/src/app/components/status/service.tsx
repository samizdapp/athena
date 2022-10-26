import { LogDto } from '@athena/shared/api';
import React from 'react';

import ServerBox from './server-box';

export type ServiceProps = {
    name: string;
    logs?: LogDto.Log[];
    onClick?: React.MouseEventHandler;
};

export const Service = React.forwardRef<HTMLDivElement, ServiceProps>(
    ({ name, logs = [], onClick }: ServiceProps, ref) => {
        const status = logs.slice(-1)[0]?.status ?? '';
        const className = `service ${name.replaceAll(
            ' ',
            '-'
        )} ${status?.toLowerCase()}`;

        return (
            <div
                className={className}
                ref={ref}
                onClick={onClick}
            >
                <ServerBox />
                <section className="details">
                    <h3>{name}</h3>
                    <p className="status">{status}</p>
                </section>
            </div>
        );
    }
);

export default Service;
