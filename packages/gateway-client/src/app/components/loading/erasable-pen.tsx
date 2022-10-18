import styled from 'styled-components';

const StyledContainer = styled.div`
    margin: auto;
    text-align: center;
    width: 200px;
    height: 200px;
`;

/**
 * CSS copied from: https://cssloaders.github.io/
 * Thank you!
 * @author https://github.com/vineethtrv
 *
 */

type StyledLoaderProps = {
    primary: string;
    secondary: string;
};

const StyledLoader = styled.span<StyledLoaderProps>`
    display: inline-block;
    position: relative;
    height: 100%;
    width: 100%;
    border-bottom: ${({ primary }) => `3px solid ${primary}`};
    box-sizing: border-box;
    animation: drawLine 4s linear infinite;

    &:before {
        content: '';
        position: absolute;
        left: calc(100% + 14px);
        bottom: -6px;
        width: 16px;
        height: 50%;
        border-radius: 10% 10% 25% 25%;
        background-repeat: no-repeat;
        background-image: ${({
            primary,
            secondary,
        }) => `linear-gradient(${primary} 6px, transparent 0),
            linear-gradient(45deg, rgba(0, 0, 0, 0.02) 49%, white 51%),
            linear-gradient(315deg, rgba(0, 0, 0, 0.02) 49%, white 51%),
            linear-gradient(
                to bottom,
                ${secondary} 10%,
                ${primary} 10%,
                ${primary} 90%,
                ${secondary} 90%
            )`};
        background-size: 3px 3px, 8px 8px, 8px 8px, 16px 88px;
        background-position: center bottom, left 88px, right 88px, left top;
        transform: rotate(25deg);
        animation: pencilRot 4s linear infinite;
    }

    @keyframes drawLine {
        0%,
        100% {
            width: 0px;
        }
        45%,
        55% {
            width: 100%;
        }
    }

    @keyframes pencilRot {
        0%,
        45% {
            bottom: -6px;
            left: calc(100% + 14px);
            transform: rotate(25deg);
        }
        55%,
        100% {
            bottom: -12px;
            left: calc(100% + 16px);
            transform: rotate(220deg);
        }
    }
`;

export type ErasablePenProps = {
    className?: string;
} & Partial<StyledLoaderProps>;

export const ErasablePen = ({
    className = '',
    primary = '#ff3d00',
    secondary = '#ffffff',
}: ErasablePenProps) => {
    return (
        <StyledContainer className={'loading erasable-pen ' + className}>
            <StyledLoader primary={primary} secondary={secondary} />
        </StyledContainer>
    );
};

export default ErasablePen;
