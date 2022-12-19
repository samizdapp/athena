import React from 'react';
import styled from 'styled-components';

const StyledProperties = styled.dl`
    display: flex;
    flex-wrap: wrap;
    margin: 0;
    margin: 0;

    .property {
        margin-bottom: 10px;
    }

    dt {
        display: inline-block;
        font-weight: bold;
        text-transform: capitalize;
        width: 125px;
    }

    dd {
        display: inline-block;
        margin: 0;
        width: 150px;
    }

    .badge {
        border-radius: 1em;
        display: inline-block;
        margin-left: 0.5em;
        width: 0.5em;
        height: 0.5em;

        &.connecting {
            background-color: #ffd000;
        }

        &.online {
            background-color: #00dd00;
        }

        &.offline {
            background-color: #cc0000;
        }
    }

    .box-address {
        display: none;

        pre {
            background: #ddd;
            padding: 10px;
            overflow: auto;
        }
    }
`;

type PropertiesProps = {
    children: React.ReactNode;
};

export const Properties = ({ children }: PropertiesProps) => {
    return (
        <StyledProperties className="properties">{children}</StyledProperties>
    );
};

export default Properties;
