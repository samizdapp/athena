import useSWR from 'swr';

import Basic from './basic';
import HomeMobile from './home.mobile';

const fetcher = (...args: Parameters<typeof fetch>) =>
    fetch(...args).then(res => res.json());

type HomeLayoutProps = {
    children: React.ReactNode;
};

export default function HomeLayout({ children }: HomeLayoutProps) {
    const { data } = useSWR('/api/harnessed', fetcher);
    const harnessed = data?.harnessed || [];
    return (
        <HomeMobile harnessed={harnessed}>
            <Basic>{children}</Basic>
        </HomeMobile>
    );
}
