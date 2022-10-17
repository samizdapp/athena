import React from 'react';
import styled from 'styled-components';

const StyledSvg = styled.svg`
    width: 100px;
    display: block;
    margin: 40px auto 0;

    .path {
        stroke-dasharray: 1000;
        stroke-dashoffset: 0;
        &.circle {
            -webkit-animation: dash 0.9s ease-in-out;
            animation: dash 0.9s ease-in-out;
        }
        &.line {
            stroke-dashoffset: 1000;
            -webkit-animation: dash 0.9s 0.35s ease-in-out forwards;
            animation: dash 0.9s 0.35s ease-in-out forwards;
        }
        &.check {
            stroke-dashoffset: -100;
            -webkit-animation: dash-check 0.9s 0.35s ease-in-out forwards;
            animation: dash-check 0.9s 0.35s ease-in-out forwards;
        }
    }

    @keyframes dash {
        0% {
            stroke-dashoffset: 1000;
        }
        100% {
            stroke-dashoffset: 0;
        }
    }

    @keyframes dash-check {
        0% {
            stroke-dashoffset: -100;
        }
        100% {
            stroke-dashoffset: 900;
        }
    }
`;

export const AnimatedCheck = () => {
    return (
        <StyledSvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130.2 130.2">
            <circle
                cx="65.1"
                cy="65.1"
                r="62.1"
                fill="none"
                stroke="#73AF55"
                strokeMiterlimit="10"
                strokeWidth="6"
                className="path circle"
            ></circle>
            <path
                fill="none"
                stroke="#73AF55"
                strokeLinecap="round"
                strokeMiterlimit="10"
                strokeWidth="6"
                d="M100.2 40.2L51.5 88.8 29.8 67.5"
                className="path check"
            ></path>
        </StyledSvg>
    );
};

export default AnimatedCheck;
