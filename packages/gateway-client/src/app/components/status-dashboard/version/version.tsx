import styled from 'styled-components';

const StyledVersion = styled.div``;

export const Version = () => {
    return (
        <StyledVersion>
            <div className="version">
                <span>Version: </span>
                <span>0.0.0</span>
            </div>
        </StyledVersion>
    );
};

export default Version;
