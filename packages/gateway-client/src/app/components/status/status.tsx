import { forwardRef } from 'react';
import * as Rgl from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import styled from 'styled-components';

import BoxStatus from './box-status/box-status';
import Version from './version/version';
import WorkerStatus from './worker-status/worker-status';

const ResponsiveGridLayout = Rgl.WidthProvider(Rgl.Responsive);

const StyledStatus = styled.div`
    overflow: auto;
    height: 100%;

    .react-grid-item {
        border: 3px solid #0a0;
        border-radius: 5px 5px 0 0;
        transition: none;

        header {
            background-color: #0a0;
            cursor: move;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            margin: -2px 0 0 -2px;
            height: 34px;
            width: calc(100% + 4px);

            h3 {
                margin: 2px 10px;
            }
        }

        article {
            overflow: auto;
            height: calc(100% - 30px);
        }
    }
`;

type GridItemProps = {
    className?: string;
    children: React.ReactNode;
    title: string;
};

const GridItem = forwardRef<HTMLElement, GridItemProps>(
    ({ children, className = '', title, ...props }: GridItemProps, ref) => {
        return (
            <section ref={ref} className={className} {...props}>
                <header>
                    <h3>{title}</h3>
                </header>
                <article>{children}</article>
            </section>
        );
    }
);

export const Status = () => {
    return (
        <StyledStatus>
            <ResponsiveGridLayout
                className="layout"
                layouts={{
                    lg: [
                        {
                            i: 'box-status',
                            x: 5,
                            y: 0,
                            w: 7,
                            h: 16,
                        },
                        {
                            i: 'version',
                            x: 0,
                            y: 0,
                            w: 5,
                            h: 8,
                        },
                        { i: 'worker-status', x: 0, y: 8, w: 5, h: 8 },
                    ],
                }}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={30}
                draggableHandle="header"
            >
                <GridItem key="box-status" title="Box Status">
                    <BoxStatus />
                </GridItem>

                <GridItem key="version" title="Version">
                    <Version />
                </GridItem>

                <GridItem key="worker-status" title="Worker Status">
                    <WorkerStatus />
                </GridItem>
            </ResponsiveGridLayout>
        </StyledStatus>
    );
};

export default Status;
