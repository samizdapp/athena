import { LogDto } from '@athena/shared/api';
import CloseIcon from '@mui/icons-material/Close';

export type ServiceDetailsProps = {
    name?: string;
    logs?: LogDto.Log[];
    open?: boolean;
    onClose?: React.MouseEventHandler;
};

export const ServiceDetails = ({
    name,
    logs = [],
    open,
    onClose,
}: ServiceDetailsProps) => {
    const status = logs.slice(-1)[0]?.status ?? '';
    const className = `service-details ${
        open ? 'open' : 'closed'
    } ${status.toLowerCase()}`;

    return (
        <section className={className}>
            <CloseIcon onClick={onClose} />

            <h3>
                {name} <span className="status">({status})</span>
            </h3>

            <pre>
                <code>
                    {logs.map(
                        ({ createdAt, status, message }) =>
                            `${createdAt} - ${status} - ${message}${'\n'}`
                    )}
                </code>
            </pre>
        </section>
    );
};

export default ServiceDetails;
