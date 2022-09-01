import Drawer from '../components/drawer.mobile';

type HomeMobileProps = {
    children: React.ReactNode;
    harnessed: string[];
};

export default function HomeMobile({ children, harnessed }: HomeMobileProps) {
    return (
        <>
            {children}
            <Drawer harnessed={harnessed} />
        </>
    );
}
