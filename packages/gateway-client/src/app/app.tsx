import { Navigate, Route, Routes } from 'react-router-dom';
import styled from 'styled-components';

import Home from './components/home/home';
import Status from './components/status/status';

const StyledApp = styled.div`
    overflow: hidden;
    position: relative;
    height: 100%;
`;

export function App() {
    return (
        <StyledApp>
            <Routes>
                <Route path="/pwa" element={<Home />} />
                <Route path="/pwa/status" element={<Status />} />
                <Route path="*" element={<Navigate to="/pwa" replace />} />
            </Routes>
        </StyledApp>
    );
}

export default App;
