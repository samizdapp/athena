import { useCallback, useState } from 'react';
import { ArcherContainer, ArcherElement } from 'react-archer';
import styled from 'styled-components';

import { useSelectStatusLogsByService } from '../../redux/status-log/statusLog.api';
import Service from './service';
import ServiceDetails from './service-details';

const StyledStatus = styled.div`
    display: flex;
    flex-direction: row;
    overflow: auto;
    padding: 50px;
    height: 100%;

    .service {
        cursor: pointer;
        margin: auto;
        position: relative;
        width: 100px;
        height: 100px;

        svg {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }

        .details {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }

        h3 {
            margin: 3px;
            line-height: 31px;
            text-align: center;
        }

        .status {
            font-weight: bold;
            margin: 0;
            text-align: center;
        }

        &.online {
            svg path,
            svg g {
                fill: #0a0;
            }

            .status {
                color: #0a0;
            }
        }

        &.waiting {
            svg path,
            svg g {
                fill: #caa500;
            }

            .status {
                color: #caa500;
            }
        }

        &.offline {
            svg path,
            svg g {
                fill: #a00;
            }

            .status {
                color: #a00;
            }
        }
    }

    .critical {
        flex: 1;

        & > svg {
            min-width: 400px;

            path {
                fill: #aaa;
                stroke: #aaa !important;
            }
        }

        & > div {
            display: grid;
            grid-gap: 40px;
            min-width: 400px;

            .yggdrasil {
                grid-column: 1/2;
                grid-row: 1;
            }

            .yggdrasil-crawler {
                grid-column: 2/3;
                grid-row: 1;
            }

            .postgres {
                grid-column: 4/5;
                grid-row: 1;
            }

            .daemon-pleroma {
                grid-column: 3/4;
                grid-row: 2;
            }

            .daemon-caddy {
                grid-column: 4/5;
                grid-row: 2;
            }

            .daemon-proxy {
                grid-column: 4/5;
                grid-row: 3;
            }
        }
    }

    .non-critical {
        align-items: flex-end;
        display: flex;
        flex-direction: column;
        flex: 0 0 140px;
        overflow: auto;
        padding-right: 5px;

        .service {
            margin: 10px 0;
            min-height: 100px;
        }
    }

    .service-details {
        background: #fff;
        border: 1px #aaa solid;
        border-radius: 7px;
        box-shadow: 0px 0px 5px #aaa;
        max-height: 195px;
        position: absolute;
        bottom: 10px;
        left: 10px;
        transition: all 0.4s ease;
        width: 55%;
        height: 38%;

        &.closed {
            height: 0;
            opacity: 0;
        }

        & > svg {
            cursor: pointer;
            position: absolute;
            top: 5px;
            right: 5px;
        }

        h3 {
            margin: 10px;
            text-align: center;

            .status {
                font-size: 0.8em;
                font-weight: bold;
            }
        }

        pre {
            background: #ddd;
            margin: 10px;
            overflow: auto;
            padding: 5px;
            height: calc(100% - 60px);
        }

        &.online {
            h3 .status {
                color: #0a0;
            }
        }

        &.waiting {
            h3 .status {
                color: #caa500;
            }
        }

        &.offline {
            h3 .status {
                color: #a00;
            }
        }
    }

    @media (max-width: 768px) {
        flex-direction: column;
        padding: 10px;

        .critical {
            position: relative;
            height: 400px;
            overflow: auto;
            flex: 0;
            min-height: 400px;

            & > div {
                .postgres {
                    grid-row: 1;
                    grid-column: 3/4;
                }

                .daemon-pleroma {
                    grid-column: 2/4;
                }

                .daemon-caddy {
                    grid-column: 1/2;
                }

                .daemon-proxy {
                    grid-column: 1/2;
                }
            }
        }

        .non-critical {
            flex: 1;
            flex-direction: row;
            flex-wrap: wrap;
            justify-content: center;
            width: 100%;

            .service {
                margin: 10px;
                min-width: 100px;
            }
        }

        .service-details {
            width: calc(100% - 20px);
            height: calc(100% - 430px);
            max-height: initial;
        }
    }
`;

/* eslint-disable-next-line */
export interface StatusProps {}

export const BoxStatus = (_props: StatusProps) => {
    const { data: allLogs } = useSelectStatusLogsByService({
        pollingInterval: 10000,
    });
    const {
        daemon_pleroma: daemonPleroma,
        yggdrasil_crawler: yggdrasilCrawler,
        yggdrasil,
        postgres,
        daemon_proxy: daemonProxy,
        daemon_caddy: daemonCaddy,
        ...nonCritical
    } = allLogs;
    const [selected, setSelected] = useState<string | undefined>(undefined);
    const [detailsOpen, setDetailsOpen] = useState(false);

    const createHandleClick = (name: string) => () => {
        setSelected(name);
        setDetailsOpen(true);
    };

    const handleClose = useCallback(() => {
        /* We don't unselect the service because the unselected state will be
         * visible in the details box ahead of the animation completing.
         */
        //setSelected(undefined);
        setDetailsOpen(false);
    }, []);

    return (
        <StyledStatus>
            <ArcherContainer className="critical">
                <ArcherElement
                    id="yggdrasil"
                    relations={[
                        {
                            targetId: 'yggdrasil_crawler',
                            sourceAnchor: 'right',
                            targetAnchor: 'left',
                        },
                    ]}
                >
                    <Service
                        name="yggdrasil"
                        logs={yggdrasil}
                        onClick={createHandleClick('yggdrasil')}
                    />
                </ArcherElement>

                <ArcherElement
                    id="yggdrasil_crawler"
                    relations={[
                        {
                            targetId: 'daemon_pleroma',
                            sourceAnchor: 'right',
                            targetAnchor: 'top',
                        },
                    ]}
                >
                    <Service
                        name="yggdrasil crawler"
                        logs={yggdrasilCrawler}
                        onClick={createHandleClick('yggdrasil_crawler')}
                    />
                </ArcherElement>

                <ArcherElement
                    id="postgres"
                    relations={[
                        {
                            targetId: 'daemon_pleroma',
                            sourceAnchor: 'left',
                            targetAnchor: 'top',
                        },
                    ]}
                >
                    <Service
                        name="postgres"
                        logs={postgres}
                        onClick={createHandleClick('postgres')}
                    />
                </ArcherElement>

                <ArcherElement id="daemon_pleroma">
                    <Service
                        name="daemon pleroma"
                        logs={daemonPleroma}
                        onClick={createHandleClick('daemon_pleroma')}
                    />
                </ArcherElement>

                <ArcherElement
                    id="daemon_caddy"
                    relations={[
                        {
                            targetId: 'daemon_proxy',
                            sourceAnchor: 'bottom',
                            targetAnchor: 'top',
                        },
                    ]}
                >
                    <Service
                        name="daemon caddy"
                        logs={daemonCaddy}
                        onClick={createHandleClick('daemon_caddy')}
                    />
                </ArcherElement>

                <ArcherElement id="daemon_proxy">
                    <Service
                        name="daemon proxy"
                        logs={daemonProxy}
                        onClick={createHandleClick('daemon_proxy')}
                    />
                </ArcherElement>
            </ArcherContainer>

            <div className="non-critical">
                {Object.entries(nonCritical).map(([name, logs]) => (
                    <Service
                        key={name}
                        name={name.replaceAll('_', ' ')}
                        logs={logs}
                        onClick={createHandleClick(name)}
                    />
                ))}
            </div>

            <ServiceDetails
                name={selected}
                logs={allLogs[selected ?? '']}
                open={detailsOpen}
                onClose={handleClose}
            />
        </StyledStatus>
    );
};

export default BoxStatus;
