import { useSelector } from 'react-redux';
import styled from 'styled-components';

import { WorkerVersion } from '../../../../../src/worker-messaging';
import { selectVersions } from '../../../redux/service-worker/serviceWorker.slice';

const StyledVersion = styled.div`
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;

    .version-info {
        flex: 1;
        overflow: auto;

        .version-line {
            min-width: 16em;

            .title {
                font-weight: bold;
                width: 7em;
                display: inline-block;
            }

            .version,
            .build {
                font-family: monospace;
                background-color: #ddd;
                padding: 0 5px;
                border-radius: 1px;
            }

            .version {
                padding-right: 2px;
            }

            .commit {
                font-size: 0.6em;
                font-weight: bold;
                text-transform: uppercase;
                color: #aaa;
            }

            .update-instruction {
                font-size: 0.7em;
                font-weight: bold;
                text-transform: uppercase;
                color: #333;
            }
        }
    }

    .worker-control {
        display: flex;
        align-items: center;
        justify-content: space-evenly;
        flex-wrap: wrap;
        height: 60px;

        button {
            background-color: #8acae9;
            border-radius: 10px;
            border: 0;
            box-shadow: 0px 0px 7px -4px #000 inset;
            cursor: pointer;
            font-size: 0.8em;
            font-weight: bold;
            padding: 5px 10px;
        }
    }
`;

type VersionLineProps = {
    className?: string;
    title: string;
    updateInstruction?: string;
    version?: WorkerVersion;
};

const VersionLine = ({
    className = '',
    title,
    updateInstruction = 'Restart required',
    version: { version, build, commit, updateAvailable } = {},
}: VersionLineProps) => {
    return (
        <p className={className + ' version-line'}>
            <span className="title">{title}: </span>
            {build ? (
                <>
                    {version ? (
                        <span className="version">{version} -</span>
                    ) : null}

                    <span className="build">{build}</span>

                    {updateAvailable ? (
                        <>
                            <br />

                            <span className="update-instruction">
                                (Update available, {updateInstruction})
                            </span>
                        </>
                    ) : null}

                    <br />

                    <span className="commit">{commit}</span>
                </>
            ) : (
                <span className="waiting">Waiting...</span>
            )}
        </p>
    );
};

export const Version = () => {
    const { app, root, gateway } = useSelector(selectVersions);

    const createHandleControlClick =
        (action: 'UPDATE_WORKER' | 'ROLLBACK_WORKER') => () => {
            // if we have no controller
            if (!navigator.serviceWorker.controller) {
                // do nothing
                return;
            }

            // else, send a message to the controller with our action
            navigator.serviceWorker.controller.postMessage({
                type: action,
            });
        };

    return (
        <StyledVersion className="version-status">
            <div className="version-info">
                <VersionLine title="App Worker" version={app} />
                <VersionLine title="Root Worker" version={root} />
                <VersionLine
                    title="Gateway App"
                    version={gateway}
                    updateInstruction="Refresh the page"
                />
            </div>

            <div className="worker-control">
                <button
                    className="update-worker"
                    onClick={createHandleControlClick('UPDATE_WORKER')}
                >
                    Update Worker
                </button>

                <button
                    className="rollback-worker"
                    onClick={createHandleControlClick('ROLLBACK_WORKER')}
                >
                    Rollback Worker
                </button>
            </div>
        </StyledVersion>
    );
};

export default Version;
