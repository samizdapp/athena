interface PropertyProps {
    className?: string;
    name: string;
    value: string;
    color?: 'online' | 'offline' | 'connecting' | 'none';
}

export const Property = ({
    className = '',
    name,
    value,
    color = 'none',
}: PropertyProps) => {
    return (
        <div className={'property ' + className}>
            <dt>{name}: </dt>
            <dd>
                {value}
                <span className={'badge ' + color}></span>
            </dd>
        </div>
    );
};

export default Property;
