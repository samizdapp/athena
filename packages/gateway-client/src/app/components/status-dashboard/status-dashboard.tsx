import { forwardRef } from 'react';
import * as Rgl from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import styled from 'styled-components';
import OpenWithIcon from '@mui/icons-material/OpenWith';

import BoxStatus from './box-status/box-status';
import Version from './version/version';
import WorkerStatus from './worker-status/worker-status';

const ResponsiveGridLayout = Rgl.WidthProvider(Rgl.Responsive);

const StyledStatus = styled.div`
    overflow: auto;
    height: 100%;

    .react-grid-item {
        background-color: #f1f1f1;
        border: 2px solid #84c184;
        border-top: 0;
        border-radius: 5px;
        box-shadow: 2px 2px 7px -3px #000;
        transition: none;

        header {
            background-color: #84c184;
            border-radius: 5px 5px 0 0;
            cursor: move;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            margin: 0 0 0 -2px;
            position: relative;
            height: 30px;
            width: calc(100% + 4px);

            h3 {
                font-size: 1.2em;
                line-height: 1.4em;
                margin: 2px 10px;
            }

            svg {
                position: absolute;
                right: 10px;
                top: 50%;
                margin-top: -0.5em;
                opacity: 0.2;
            }
        }

        article {
            overflow: auto;
            margin: 5px;
            height: calc(100% - 30px - 10px);
        }

        .react-resizable-handle {
            background-image: none;
            background-color: #ccc;
            border-radius: 10px;
            opacity: 0;
            margin: 0;
            transform: none;
        }

        .react-resizable-handle:hover {
            opacity: 0.6;
        }

        .react-resizable-handle-s,
        .react-resizable-handle-se {
            bottom: -8px;
            height: 10px;
        }

        .react-resizable-handle-e,
        .react-resizable-handle-se {
            right: -8px;
            width: 10px;
        }

        .react-resizable-handle-s {
            left: 0px;
            width: calc(100% - 12px);
        }

        .react-resizable-handle-e {
            top: 30px;
            height: calc(100% - 30px - 12px);
        }

        .react-resizable-handle-se {
            border-radius: 5px;
            height: 20px;
            width: 20px;
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
                    <OpenWithIcon />
                </header>
                <article>{children}</article>
            </section>
        );
    }
);

export const StatusDashboard = () => {
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
                resizeHandles={['s', 'e', 'se']}
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

export default StatusDashboard;
