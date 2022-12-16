import { Navigate, Route, Routes } from 'react-router-dom';
import styled from 'styled-components';

import Home from './components/home/home';
import Status from './components/status-dashboard/status-dashboard';
import Navbar from './navbar';

const StyledApp = styled.div`
    overflow: hidden;
    position: relative;
    height: 100%;
`;

export function App() {
    return (
        <StyledApp>
            <Navbar />

            <Routes>
                <Route path="/smz/pwa" element={<Home />} />
                <Route path="/smz/pwa/status" element={<Status />} />
                <Route path="*" element={<Navigate to="/smz/pwa" replace />} />
            </Routes>
        </StyledApp>
    );
}

export default App;
