import { Navigate, Route, Routes } from 'react-router-dom';
import styled from 'styled-components';

import Home from './components/home/home';
import Status from './components/status-dashboard/status-dashboard';
import Navbar from './navbar';

const StyledApp = styled.div`
    overflow: hidden;
    position: relative;
    height: 100%;

    .navbar {
        height: 65px;
    }

    .screen {
        height: calc(100% - 65px);
    }
`;

export function App() {
    return (
        <StyledApp>
            <Navbar />

            <div className="screen">
                <Routes>
                    <Route path="/smz/pwa" element={<Home />} />
                    <Route path="/smz/pwa/status" element={<Status />} />
                    <Route
                        path="*"
                        element={<Navigate to="/smz/pwa" replace />}
                    />
                </Routes>
            </div>
        </StyledApp>
    );
}

export default App;
